import { posix, relative } from "node:path";
import { parseFrontmatter, parseTemplate, renderEjs, type TemplatesIndex } from "../parser.js";
import type { OutputPlan } from "../plan/build-plan.js";
import type { Locator } from "../plan/locate.js";
import { toPosixPath } from "../plan/locate.js";
import { resolveOverrides } from "../resolve-overrides.js";
import type {
  CombineEntry,
  MarkdownTemplateType,
  RenderedFile,
  TemplateTypeConfig,
} from "../../targets/define-target.js";
import type { GeneratedFile, Target, UniversalFrontmatter } from "../../types.js";
import type { GenerateRun } from "./context.js";
import type { DiscoveredTemplate, TemplateSlot } from "./discover.js";
import { mapFrontmatter, renderMarkdown } from "./frontmatter.js";
import { asText, type FileReader } from "./read-cache.js";
import { checkSkillSpec } from "./skill-spec.js";

/**
 * Build a per-target index of instruction template name → resolved
 * frontmatter. Path helpers like `instructionPath('foo')` need it to compute
 * where an instruction actually lands for targets that route by frontmatter.
 * It holds the per-target winner, so path helpers see what will be generated.
 */
export async function buildTemplatesIndexes(
  run: GenerateRun,
  plan: OutputPlan,
  slots: Map<string, TemplateSlot>,
  reader: FileReader,
  docs: Map<string, string>,
  missingDocs: Set<string>,
): Promise<Map<Target, TemplatesIndex>> {
  const indexes = new Map<Target, TemplatesIndex>();
  for (const targetName of run.config.targets) {
    indexes.set(targetName, { instructions: new Map(), docs, missingDocs });
  }

  const frontmatterCache = new Map<DiscoveredTemplate, Record<string, unknown>>();
  for (const slot of slots.values()) {
    if (slot.type !== "instructions") continue;
    for (const targetName of run.config.targets) {
      // A target reading AGENTS.md finds instructions where the shared files
      // put them, which follows the view target's frontmatter
      const source =
        plan.agentsMd && plan.outputFor(targetName, "instructions").kind === "agentsMd"
          ? plan.agentsMd.view
          : targetName;
      const winner = slot.winnerByTarget.get(source);
      if (!winner) continue;

      let frontmatter = frontmatterCache.get(winner);
      if (!frontmatter) {
        const parsed = parseFrontmatter(await reader.text(winner));
        frontmatter = parsed.frontmatter as Record<string, unknown>;
        frontmatterCache.set(winner, frontmatter);
      }

      const resolved = resolveOverrides(frontmatter, source) as UniversalFrontmatter;
      indexes.get(targetName)?.instructions.set(slot.name, resolved);
    }
  }
  return indexes;
}

/** One rendered file of one template, before same-path templates are combined. */
interface PendingFile extends RenderedFile {
  target: Target;
  type: MarkdownTemplateType;
  sourcePath: string;
  consumers: Target[];
  /** Set for a template's main files (not skill extras) — what `combine` receives */
  entry?: Omit<CombineEntry, "content">;
}

/** Join files of one target that landed on the same path, via the type's `combine`. */
function combinePending(
  pending: PendingFile[],
  locator: Locator,
  run: GenerateRun,
): GeneratedFile[] {
  const groups = new Map<string, PendingFile[]>();
  for (const file of pending) {
    const key = `${file.target}\u0000${file.path}`;
    const group = groups.get(key);
    if (group) group.push(file);
    else groups.set(key, [file]);
  }

  const files: GeneratedFile[] = [];
  for (const group of groups.values()) {
    const [first] = group;
    if (!first) continue;
    if (group.length === 1) {
      files.push({
        path: first.path,
        content: first.content,
        mode: first.mode,
        target: first.target,
        type: first.type,
        sourcePath: first.sourcePath,
        consumers: first.consumers,
      });
      continue;
    }

    const typeConfig: TemplateTypeConfig | undefined = locator.typeConfig(first.target, first.type);
    const entries = group.flatMap((file) =>
      file.entry && file.type === first.type
        ? [{ ...file.entry, content: asText(file.content) }]
        : [],
    );
    if (!typeConfig?.combine || entries.length !== group.length) {
      const sources = group.map((file) => file.sourcePath).join(", ");
      throw new Error(
        `${first.target}: several templates render to ${first.path} (${sources}). Rename one of them.`,
      );
    }
    files.push({
      path: first.path,
      content: typeConfig.combine(entries, { report: run.sink.scoped(first.target, first.type) }),
      target: first.target,
      type: first.type,
      sourcePath: group.map((file) => file.sourcePath).join(","),
      consumers: first.consumers,
    });
  }
  return files;
}

/** Render every winning instruction, skill and agent template for every target. */
export async function generateTemplateFiles(
  run: GenerateRun,
  slots: Map<string, TemplateSlot>,
  reader: FileReader,
  indexes: Map<Target, TemplatesIndex>,
  plan: OutputPlan,
): Promise<GeneratedFile[]> {
  const { root, config, sink, locator } = run;
  const pending: PendingFile[] = [];

  for (const slot of slots.values()) {
    const type = slot.type as MarkdownTemplateType;
    for (const targetName of config.targets) {
      // The winner already accounts for `exclude`; no winner means every
      // candidate for this name was excluded for this target.
      const template = slot.winnerByTarget.get(targetName);
      if (!template) continue;

      const mode = plan.outputFor(targetName, type);
      if (mode.kind === "off" && mode.reason === "unsupported") {
        sink.report({
          code: "unsupported",
          target: targetName,
          type,
          source: template.relativePath,
          message: `does not support "${type}" — skipping ${template.relativePath}`,
          detail: { kind: "type", name: type },
        });
        continue;
      }
      // Only `own` renders here: AGENTS.md and other targets' outputs are
      // generated elsewhere
      if (mode.kind !== "own") continue;
      const typeConfig = locator.typeConfig(targetName, type);
      if (!typeConfig) continue;
      const consumers = plan.consumersOf(targetName, type);

      const renderContext = {
        target: targetName,
        type,
        config,
        templatesIndex: indexes.get(targetName),
        locator,
        consumers,
      };
      const parsed = parseTemplate(await reader.text(template), renderContext);
      const frontmatter = resolveOverrides(
        parsed.frontmatter as Record<string, unknown>,
        targetName,
      ) as UniversalFrontmatter;
      const outputPath = locator.templatePath(targetName, type, template.name, frontmatter);
      const sourcePath = toPosixPath(template.relativePath);
      // Reported without a target: the same problem in every target prints once
      if (type === "skills") {
        checkSkillSpec(template.name, frontmatter, sourcePath, (d) => sink.report(d));
      }

      const rendered = typeConfig.render
        ? typeConfig.render(
            { name: template.name, sourcePath, frontmatter, body: parsed.body, outputPath },
            { report: sink.scoped(targetName, type) },
          )
        : [
            {
              path: outputPath,
              content: renderMarkdown(
                mapFrontmatter(frontmatter, typeConfig, {
                  report: sink.scoped(targetName, type),
                }),
                parsed.body,
                typeConfig.frontmatterStyle,
              ),
            },
          ];
      for (const file of rendered) {
        pending.push({
          ...file,
          path: toPosixPath(file.path),
          target: targetName,
          type,
          sourcePath,
          consumers,
          entry: { name: template.name, sourcePath, frontmatter, body: parsed.body },
        });
      }

      // Extra files of a skill sit next to its main file. `.md` files go
      // through EJS; everything else is copied byte for byte with its mode.
      const extraDir = posix.dirname(outputPath);
      for (const extra of template.extraFiles ?? []) {
        const bytes = await reader.bytes(extra);
        pending.push({
          path: posix.join(extraDir, extra.relativePath),
          content: extra.relativePath.endsWith(".md")
            ? renderEjs(asText(bytes), renderContext)
            : bytes,
          mode: extra.mode,
          target: targetName,
          type,
          consumers,
          sourcePath: extra.filePath
            ? toPosixPath(relative(root, extra.filePath))
            : extra.relativePath,
        });
      }
    }
  }

  return combinePending(pending, locator, run);
}
