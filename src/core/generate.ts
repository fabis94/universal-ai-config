import { readFile, readdir, stat } from "node:fs/promises";
import { join, basename, relative, sep } from "node:path";
import { consola } from "consola";
import { loadProjectConfig } from "../config/loader.js";
import { createExcludeMatcher } from "./exclude.js";
import { parseTemplate } from "./parser.js";
import { resolveOverrides } from "./resolve-overrides.js";
import { safePath } from "./safe-path.js";
import { targets } from "../targets/index.js";
import type { TemplateTypeConfig } from "../targets/define-target.js";
import type {
  GeneratedFile,
  GenerateOptions,
  ResolvedConfig,
  Target,
  TemplateType,
  UniversalFrontmatter,
  UniversalHookHandler,
  UniversalMCPInput,
  UniversalMCPServer,
} from "../types.js";

/** Normalize path separators to forward slashes for glob matching */
function normalizePath(p: string): string {
  return sep === "/" ? p : p.split(sep).join("/");
}

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
  const templatesDir = safePath(root, config.templatesDir);
  const templates: DiscoveredTemplate[] = [];

  for (const type of config.types) {
    // Hooks and MCP are handled separately — they use JSON, not markdown templates
    if (type === "hooks" || type === "mcp") continue;

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

/** Replace {{varName}} placeholders with values from config variables */
function interpolateVariables(jsonText: string, variables: Record<string, unknown>): string {
  return jsonText.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = variables[key];
    return value !== undefined ? String(value) : match;
  });
}

interface DiscoveredHookFile {
  filePath: string;
  /** Path relative to templates dir, e.g. "hooks/basic.json" */
  templateRelativePath: string;
}

async function discoverHookFiles(
  root: string,
  config: ResolvedConfig,
): Promise<DiscoveredHookFile[]> {
  const hooksDir = safePath(root, join(config.templatesDir, "hooks"));
  try {
    const stats = await stat(hooksDir);
    if (!stats.isDirectory()) return [];
  } catch {
    return [];
  }

  const entries = await readdir(hooksDir);
  return entries
    .filter((e) => e.endsWith(".json"))
    .map((file) => ({
      filePath: join(hooksDir, file),
      templateRelativePath: normalizePath(join("hooks", file)),
    }));
}

async function mergeHookFiles(
  files: DiscoveredHookFile[],
  variables: Record<string, unknown>,
): Promise<Record<string, Record<string, unknown>[]> | null> {
  if (files.length === 0) return null;

  const merged: Record<string, Record<string, unknown>[]> = {};

  for (const file of files) {
    const rawContent = await readFile(file.filePath, "utf-8");
    const content = interpolateVariables(rawContent, variables);
    const parsed = JSON.parse(content) as {
      hooks?: Record<string, Record<string, unknown>[]>;
    };
    if (!parsed.hooks) continue;

    for (const [event, handlers] of Object.entries(parsed.hooks)) {
      if (!merged[event]) {
        merged[event] = [];
      }
      merged[event].push(...handlers);
    }
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

function resolveHookHandlers(
  hooks: Record<string, Record<string, unknown>[]>,
  target: string,
): Record<string, UniversalHookHandler[]> {
  const result: Record<string, UniversalHookHandler[]> = {};
  for (const [event, handlers] of Object.entries(hooks)) {
    const resolved: UniversalHookHandler[] = [];
    for (const handler of handlers) {
      const r = resolveOverrides(handler, target);
      if (r.command) resolved.push(r as unknown as UniversalHookHandler);
    }
    if (resolved.length > 0) result[event] = resolved;
  }
  return result;
}

async function generateHooksFiles(root: string, config: ResolvedConfig): Promise<GeneratedFile[]> {
  const allHookFiles = await discoverHookFiles(root, config);
  if (allHookFiles.length === 0) return [];

  const generatedFiles: GeneratedFile[] = [];
  const hooksRelativePath = join(config.templatesDir, "hooks");

  for (const targetName of config.targets) {
    const targetDef = targets[targetName];
    if (!targetDef) continue;

    if (!targetDef.supportedTypes.includes("hooks")) continue;
    if (!targetDef.hooks) continue;

    // Filter hook files by exclude patterns for this target
    const isExcluded = createExcludeMatcher(config.exclude, targetName);
    const filteredFiles = allHookFiles.filter((f) => !isExcluded(f.templateRelativePath));

    const mergedHooks = await mergeHookFiles(filteredFiles, config.variables);
    if (!mergedHooks) continue;

    const hooksConfig = targetDef.hooks;
    const resolvedHooks = resolveHookHandlers(mergedHooks, targetName);
    const transformed = hooksConfig.transform(resolvedHooks);
    const outputDir = config.outputDirs[targetName as Target] ?? targetDef.outputDir;
    const fullOutputPath = join(outputDir, hooksConfig.outputPath);

    generatedFiles.push({
      path: fullOutputPath,
      content: JSON.stringify(transformed, null, 2) + "\n",
      target: targetName as Target,
      type: "hooks",
      sourcePath: hooksRelativePath,
      mergeKey: hooksConfig.mergeKey,
    });
  }

  return generatedFiles;
}

interface DiscoveredMCPFile {
  filePath: string;
  templateRelativePath: string;
}

async function discoverMCPFiles(
  root: string,
  config: ResolvedConfig,
): Promise<DiscoveredMCPFile[]> {
  const mcpDir = safePath(root, join(config.templatesDir, "mcp"));
  try {
    const stats = await stat(mcpDir);
    if (!stats.isDirectory()) return [];
  } catch {
    return [];
  }

  const entries = await readdir(mcpDir);
  return entries
    .filter((e) => e.endsWith(".json"))
    .map((file) => ({
      filePath: join(mcpDir, file),
      templateRelativePath: normalizePath(join("mcp", file)),
    }));
}

interface MergedMCPData {
  servers: Record<string, Record<string, unknown>>;
  inputs: UniversalMCPInput[];
}

async function mergeMCPFiles(
  files: DiscoveredMCPFile[],
  variables: Record<string, unknown>,
): Promise<MergedMCPData | null> {
  if (files.length === 0) return null;

  const servers: Record<string, Record<string, unknown>> = {};
  const inputs: UniversalMCPInput[] = [];

  for (const file of files) {
    const rawContent = await readFile(file.filePath, "utf-8");
    const content = interpolateVariables(rawContent, variables);
    const parsed = JSON.parse(content) as {
      mcpServers?: Record<string, Record<string, unknown>>;
      inputs?: UniversalMCPInput[];
    };

    if (parsed.mcpServers) {
      for (const [name, serverConfig] of Object.entries(parsed.mcpServers)) {
        servers[name] = serverConfig;
      }
    }

    if (parsed.inputs) {
      inputs.push(...parsed.inputs);
    }
  }

  return Object.keys(servers).length > 0 ? { servers, inputs } : null;
}

function resolveMCPServers(
  servers: Record<string, Record<string, unknown>>,
  target: string,
): Record<string, UniversalMCPServer> {
  const result: Record<string, UniversalMCPServer> = {};
  for (const [name, serverConfig] of Object.entries(servers)) {
    const resolved = resolveOverrides(serverConfig, target);
    // Drop server if neither command nor url is present
    if (!resolved.command && !resolved.url) continue;
    result[name] = resolved as unknown as UniversalMCPServer;
  }
  return result;
}

async function generateMCPFiles(root: string, config: ResolvedConfig): Promise<GeneratedFile[]> {
  const allMCPFiles = await discoverMCPFiles(root, config);
  if (allMCPFiles.length === 0) return [];

  const generatedFiles: GeneratedFile[] = [];
  const mcpRelativePath = join(config.templatesDir, "mcp");

  for (const targetName of config.targets) {
    const targetDef = targets[targetName];
    if (!targetDef) continue;

    if (!targetDef.supportedTypes.includes("mcp")) continue;
    if (!targetDef.mcp) continue;

    const isExcluded = createExcludeMatcher(config.exclude, targetName);
    const filteredFiles = allMCPFiles.filter((f) => !isExcluded(f.templateRelativePath));

    const mergedData = await mergeMCPFiles(filteredFiles, config.variables);
    if (!mergedData) continue;

    const mcpConfig = targetDef.mcp;
    const resolvedServers = resolveMCPServers(mergedData.servers, targetName);
    if (Object.keys(resolvedServers).length === 0) continue;

    const transformed = mcpConfig.transform(resolvedServers, mergedData.inputs);

    generatedFiles.push({
      path: mcpConfig.outputPath,
      content: JSON.stringify(transformed, null, 2) + "\n",
      target: targetName as Target,
      type: "mcp",
      sourcePath: mcpRelativePath,
    });
  }

  return generatedFiles;
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

  // Pre-create exclude matchers for each target
  const excludeMatchers = new Map<string, (path: string) => boolean>();
  for (const targetName of config.targets) {
    excludeMatchers.set(targetName, createExcludeMatcher(config.exclude, targetName));
  }

  for (const template of templates) {
    const content = await readFile(template.filePath, "utf-8");

    for (const targetName of config.targets) {
      // Check if template is excluded for this target
      const templateRelPath = normalizePath(relative(config.templatesDir, template.relativePath));
      const isExcluded = excludeMatchers.get(targetName);
      if (isExcluded?.(templateRelPath)) continue;

      const targetDef = targets[targetName];
      if (!targetDef) continue;

      // Check if target supports this template type
      if (!targetDef.supportedTypes.includes(template.type)) {
        consola.warn(
          `Target "${targetName}" does not support "${template.type}" — skipping ${template.relativePath}`,
        );
        continue;
      }

      const typeConfig = targetDef[template.type] as TemplateTypeConfig | undefined;
      if (!typeConfig) continue;

      const parsed = parseTemplate(content, {
        target: targetName as Target,
        type: template.type,
        config,
      });

      const resolvedFm = resolveOverrides(
        parsed.frontmatter as Record<string, unknown>,
        targetName,
      ) as UniversalFrontmatter;
      const mappedFrontmatter = mapFrontmatter(resolvedFm, typeConfig);
      const outputPath = typeConfig.getOutputPath(template.name, resolvedFm);
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

  // Generate hooks files (separate pipeline — JSON, not markdown)
  if (config.types.includes("hooks")) {
    const hooksFiles = await generateHooksFiles(root, config);
    generatedFiles.push(...hooksFiles);
  }

  // Generate MCP files (separate pipeline — JSON, root-relative output)
  if (config.types.includes("mcp")) {
    const mcpFiles = await generateMCPFiles(root, config);
    generatedFiles.push(...mcpFiles);
  }

  return generatedFiles;
}
