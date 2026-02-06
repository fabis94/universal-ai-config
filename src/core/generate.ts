import { readFile, readdir, stat } from "node:fs/promises";
import { join, basename, relative } from "node:path";
import { consola } from "consola";
import { loadProjectConfig } from "../config/loader.js";
import { parseTemplate } from "./parser.js";
import { targets } from "../targets/index.js";
import type { TemplateTypeConfig } from "../targets/define-target.js";
import type {
  GeneratedFile,
  GenerateOptions,
  ResolvedConfig,
  Target,
  TemplateType,
  UniversalFrontmatter,
} from "../types.js";

interface DiscoveredTemplate {
  name: string;
  type: TemplateType;
  filePath: string;
  relativePath: string;
}

function formatFrontmatter(data: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === "boolean") {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === "number") {
      lines.push(`${key}: ${value}`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${typeof item === "string" ? item : JSON.stringify(item)}`);
      }
    } else {
      // Object — use inline JSON for simplicity
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  return lines.join("\n");
}

function mapFrontmatter(
  universal: UniversalFrontmatter,
  typeConfig: TemplateTypeConfig,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [universalKey, mapper] of Object.entries(typeConfig.frontmatterMap)) {
    const value = (universal as Record<string, unknown>)[universalKey];
    if (value === undefined) continue;

    if (typeof mapper === "string") {
      result[mapper] = value;
    } else {
      const mapped = mapper(value, universal);
      Object.assign(result, mapped);
    }
  }
  return result;
}

async function discoverTemplates(
  root: string,
  config: ResolvedConfig,
): Promise<DiscoveredTemplate[]> {
  const templatesDir = join(root, config.templatesDir);
  const templates: DiscoveredTemplate[] = [];

  for (const type of config.types) {
    const typeDir = join(templatesDir, type);
    try {
      const stats = await stat(typeDir);
      if (!stats.isDirectory()) continue;
    } catch {
      continue; // Directory doesn't exist
    }

    if (type === "skills") {
      // Skills are folders, each containing SKILL.md
      const entries = await readdir(typeDir);
      for (const entry of entries) {
        const skillDir = join(typeDir, entry);
        const skillStats = await stat(skillDir);
        if (!skillStats.isDirectory()) continue;
        const skillFile = join(skillDir, "SKILL.md");
        try {
          await stat(skillFile);
          templates.push({
            name: entry,
            type,
            filePath: skillFile,
            relativePath: relative(root, skillFile),
          });
        } catch {
          // SKILL.md doesn't exist in this folder
        }
      }
    } else {
      // Instructions and agents are flat .md files
      const entries = await readdir(typeDir);
      for (const entry of entries) {
        if (!entry.endsWith(".md")) continue;
        const filePath = join(typeDir, entry);
        const fileStats = await stat(filePath);
        if (!fileStats.isFile()) continue;
        const name = basename(entry, ".md");
        templates.push({
          name,
          type,
          filePath,
          relativePath: relative(root, filePath),
        });
      }
    }
  }

  return templates;
}

function generateFileContent(frontmatter: Record<string, unknown>, body: string): string {
  const fmString = formatFrontmatter(frontmatter);
  if (fmString.length === 0) {
    return body.startsWith("\n") ? body.slice(1) : body;
  }
  return `---\n${fmString}\n---\n${body}`;
}

export async function generate(options: GenerateOptions = {}): Promise<GeneratedFile[]> {
  const root = options.root ?? process.cwd();

  const config = await loadProjectConfig({
    root,
    configPath: options.config,
    cliTargets: options.targets,
    cliTypes: options.types,
  });

  // Validate target names
  for (const target of config.targets) {
    if (!targets[target]) {
      const available = Object.keys(targets).join(", ");
      throw new Error(`Unknown target "${target}". Available targets: ${available}`);
    }
  }

  const templates = await discoverTemplates(root, config);
  const generatedFiles: GeneratedFile[] = [];

  for (const template of templates) {
    const content = await readFile(template.filePath, "utf-8");

    for (const targetName of config.targets) {
      const targetDef = targets[targetName];
      if (!targetDef) continue;

      // Check if target supports this template type
      if (!targetDef.supportedTypes.includes(template.type)) {
        consola.warn(
          `Target "${targetName}" does not support "${template.type}" — skipping ${template.relativePath}`,
        );
        continue;
      }

      const typeConfig = targetDef[template.type];
      if (!typeConfig) continue;

      const parsed = parseTemplate(content, {
        target: targetName as Target,
        type: template.type,
        config,
      });

      const mappedFrontmatter = mapFrontmatter(parsed.frontmatter, typeConfig);
      const outputPath = typeConfig.getOutputPath(template.name, parsed.frontmatter);
      const outputDir = config.outputDirs[targetName as Target] ?? targetDef.outputDir;
      const fullOutputPath = join(outputDir, outputPath);

      const fileContent = generateFileContent(mappedFrontmatter, parsed.body);

      generatedFiles.push({
        path: fullOutputPath,
        content: fileContent,
        target: targetName as Target,
        type: template.type,
        sourcePath: template.relativePath,
      });
    }
  }

  return generatedFiles;
}
