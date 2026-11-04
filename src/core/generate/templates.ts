import { join, relative } from "node:path";
import { parseFrontmatter, parseTemplate, renderEjs, type TemplatesIndex } from "../parser.js";
import { resolveOverrides } from "../resolve-overrides.js";
import { targets } from "../../targets/index.js";
import type { ConsolidateInput, TemplateTypeConfig } from "../../targets/define-target.js";
import type {
  GeneratedFile,
  InMemoryExtraFile,
  Target,
  TemplateType,
  UniversalFrontmatter,
} from "../../types.js";
import type { GenerateRun } from "./context.js";
import type { TemplateSlot } from "./discover.js";
import { mapFrontmatter, renderMarkdown } from "./frontmatter.js";
import { asText, type FileReader } from "./read-cache.js";

/**
 * Build a per-target index of instruction template name → resolved
 * frontmatter. Path helpers like `instructionPath('foo')` need it to compute
 * where an instruction actually lands for targets that route by frontmatter.
 * It holds the per-target winner, so path helpers see what will be generated.
 */
export async function buildTemplatesIndexes(
  run: GenerateRun,
  slots: Map<string, TemplateSlot>,
  reader: FileReader,
  docs: Map<string, string>,
  missingDocs: Set<string>,
): Promise<Map<Target, TemplatesIndex>> {
  const indexes = new Map<Target, TemplatesIndex>();
  for (const targetName of run.config.targets) {
    indexes.set(targetName, { instructions: new Map(), docs, missingDocs });
  }

  const frontmatterCache = new Map<string, Record<string, unknown>>();
  for (const slot of slots.values()) {
    if (slot.type !== "instructions") continue;
    for (const targetName of run.config.targets) {
      const winner = slot.winnerByTarget.get(targetName);
      if (!winner) continue;

      let frontmatter = winner.filePath ? frontmatterCache.get(winner.filePath) : undefined;
      if (!frontmatter) {
        frontmatter = parseFrontmatter(await reader.text(winner)).frontmatter as Record<
          string,
          unknown
        >;
        if (winner.filePath) frontmatterCache.set(winner.filePath, frontmatter);
      }

      const resolved = resolveOverrides(frontmatter, targetName) as UniversalFrontmatter;
      indexes.get(targetName)?.instructions.set(slot.name, resolved);
    }
  }
  return indexes;
}

/** Templates buffered for a type config that emits through `consolidate`. */
interface ConsolidateBuffer {
  targetName: Target;
  type: TemplateType;
  outputDir: string;
  consolidateFn: NonNullable<TemplateTypeConfig["consolidate"]>;
  templates: ConsolidateInput["templates"];
}

/** Render every winning instruction, skill and agent template for every target. */
export async function generateTemplateFiles(
  run: GenerateRun,
  slots: Map<string, TemplateSlot>,
  reader: FileReader,
  indexes: Map<Target, TemplatesIndex>,
): Promise<GeneratedFile[]> {
  const { root, config, sink } = run;
  const generatedFiles: GeneratedFile[] = [];
  // Keyed by `${target}:${type}`; flushed after the loop in one call per key.
  const consolidateBuffers = new Map<string, ConsolidateBuffer>();

  for (const slot of slots.values()) {
    for (const targetName of config.targets) {
      // The winner already accounts for `exclude`; no winner means every
      // candidate for this name was excluded for this target.
      const template = slot.winnerByTarget.get(targetName);
      if (!template) continue;
      const content = await reader.text(template);

      const targetDef = targets[targetName];
      if (!targetDef) continue;

      if (!targetDef.supportedTypes.includes(template.type)) {
        sink.report({
          code: "unsupported",
          target: targetName,
          type: template.type,
          source: template.relativePath,
          message: `does not support "${template.type}" — skipping ${template.relativePath}`,
          detail: { kind: "type", name: template.type },
        });
        continue;
      }

      const typeConfig = targetDef[template.type] as TemplateTypeConfig | undefined;
      if (!typeConfig) continue;

      const renderContext = {
        target: targetName,
        type: template.type,
        config,
        templatesIndex: indexes.get(targetName),
      };
      const parsed = parseTemplate(content, renderContext);
      const resolvedFm = resolveOverrides(
        parsed.frontmatter as Record<string, unknown>,
        targetName,
      ) as UniversalFrontmatter;
      const outputDir = config.outputDirs[targetName] ?? targetDef.outputDir;

      // Extra files of a skill: `.md` files go through EJS, everything else
      // is copied byte for byte (binary assets, scripts) with its exec bits.
      const extraFiles: Array<InMemoryExtraFile & { filePath: string }> = [];
      for (const extra of template.extraFiles ?? []) {
        const bytes = await reader.bytes(extra);
        extraFiles.push({
          relativePath: extra.relativePath,
          filePath: extra.filePath,
          content: extra.relativePath.endsWith(".md")
            ? renderEjs(asText(bytes), renderContext)
            : bytes,
          mode: extra.mode,
        });
      }

      // A `consolidate` type config owns all path/content emission: buffer
      // the parsed template for one batched call after the loop.
      if (typeConfig.consolidate) {
        const key = `${targetName}:${template.type}`;
        let buf = consolidateBuffers.get(key);
        if (!buf) {
          buf = {
            targetName,
            type: template.type,
            outputDir,
            consolidateFn: typeConfig.consolidate,
            templates: [],
          };
          consolidateBuffers.set(key, buf);
        }
        buf.templates.push({
          name: template.name,
          sourcePath: template.relativePath,
          frontmatter: resolvedFm,
          body: parsed.body,
          extraFiles:
            extraFiles.length > 0
              ? extraFiles.map(({ relativePath, content, mode }) => ({
                  relativePath,
                  content,
                  mode,
                }))
              : undefined,
        });
        continue;
      }

      // Default 1:1 emit path (claude/copilot/cursor).
      generatedFiles.push({
        path: join(outputDir, typeConfig.getOutputPath(template.name, resolvedFm)),
        content: renderMarkdown(mapFrontmatter(resolvedFm, typeConfig), parsed.body),
        target: targetName,
        type: template.type,
        sourcePath: template.relativePath,
      });

      for (const extra of extraFiles) {
        generatedFiles.push({
          path: join(outputDir, `skills/${template.name}`, extra.relativePath),
          content: extra.content,
          mode: extra.mode,
          target: targetName,
          type: template.type,
          sourcePath: extra.filePath ? relative(root, extra.filePath) : extra.relativePath,
        });
      }
    }
  }

  for (const buf of consolidateBuffers.values()) {
    const files = await buf.consolidateFn({
      templates: buf.templates,
      outputDir: buf.outputDir,
      root,
      report: sink.scoped(buf.targetName, buf.type),
    });
    generatedFiles.push(...files);
  }

  return generatedFiles;
}
