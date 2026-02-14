import { readFile, readdir, stat } from "node:fs/promises";
import { join, basename, relative, sep, resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { consola } from "consola";
import { stringify as stringifyYAML } from "yaml";
import { loadProjectConfig } from "../config/loader.js";
import { createExcludeMatcher } from "./exclude.js";
import { parseTemplate, renderEjs } from "./parser.js";
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

interface ExtraFile {
  /** Path relative to the skill directory, e.g. "references/example.md" */
  relativePath: string;
  /** Absolute path to the file on disk */
  filePath: string;
}

interface DiscoveredTemplate {
  name: string;
  type: TemplateType;
  filePath: string;
  /** Path relative to project root (used as sourcePath in GeneratedFile) */
  relativePath: string;
  /** Path relative to the containing templates dir, e.g. "instructions/foo.md" (used for exclude matching) */
  templateRelativePath: string;
  /** Extra files in skill directories (beyond SKILL.md) */
  extraFiles?: ExtraFile[];
}

/** Resolve an additional template dir path: expands ~ and resolves relative paths against root */
function resolveAdditionalDir(root: string, dir: string): string {
  const expanded = dir.startsWith("~") ? join(homedir(), dir.slice(1)) : dir;
  return isAbsolute(expanded) ? expanded : resolve(root, expanded);
}

function formatFrontmatter(data: Record<string, unknown>): string {
  // Filter out undefined and null values
  const filteredData = Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined && value !== null),
  );

  if (Object.keys(filteredData).length === 0) {
    return "";
  }

  return stringifyYAML(filteredData, {
    // Quote strings for safety and explicitness - avoids YAML ambiguity
    defaultStringType: "QUOTE_DOUBLE",
    defaultKeyType: "PLAIN",
    // Use 2-space indentation to match existing style
    indent: 2,
  }).trim();
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

/** Recursively collect all files in a directory, returning paths relative to the base dir */
async function collectFiles(dir: string, base: string = dir): Promise<ExtraFile[]> {
  const results: ExtraFile[] = [];
  const entries = await readdir(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = await stat(fullPath);
    if (stats.isDirectory()) {
      results.push(...(await collectFiles(fullPath, base)));
    } else if (stats.isFile()) {
      results.push({
        relativePath: normalizePath(relative(base, fullPath)),
        filePath: fullPath,
      });
    }
  }
  return results;
}

async function discoverTemplates(
  root: string,
  config: ResolvedConfig,
): Promise<DiscoveredTemplate[]> {
  const templates: DiscoveredTemplate[] = [];
  const seen = new Set<string>();

  async function scanDir(templatesDir: string) {
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
        // Skills are folders, each containing SKILL.md + optional extra files
        const entries = await readdir(typeDir);
        for (const entry of entries) {
          const dedupKey = `${type}:${entry}`;
          if (seen.has(dedupKey)) continue;

          const skillDir = join(typeDir, entry);
          const skillStats = await stat(skillDir);
          if (!skillStats.isDirectory()) continue;
          const skillFile = join(skillDir, "SKILL.md");
          try {
            await stat(skillFile);
            seen.add(dedupKey);

            // Collect extra files (everything except SKILL.md)
            const allFiles = await collectFiles(skillDir);
            const extraFiles = allFiles.filter((f) => f.relativePath !== "SKILL.md");

            templates.push({
              name: entry,
              type,
              filePath: skillFile,
              relativePath: relative(root, skillFile),
              templateRelativePath: normalizePath(relative(templatesDir, skillFile)),
              extraFiles: extraFiles.length > 0 ? extraFiles : undefined,
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
          const name = basename(entry, ".md");
          const dedupKey = `${type}:${name}`;
          if (seen.has(dedupKey)) continue;

          const filePath = join(typeDir, entry);
          const fileStats = await stat(filePath);
          if (!fileStats.isFile()) continue;

          seen.add(dedupKey);
          templates.push({
            name,
            type,
            filePath,
            relativePath: relative(root, filePath),
            templateRelativePath: normalizePath(relative(templatesDir, filePath)),
          });
        }
      }
    }
  }

  // Main dir first (wins priority via dedup)
  await scanDir(safePath(root, config.templatesDir));

  // Additional dirs in order
  for (const dir of config.additionalTemplateDirs) {
    await scanDir(resolveAdditionalDir(root, dir));
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
  const files: DiscoveredHookFile[] = [];
  const seen = new Set<string>();

  async function scanHooksDir(templatesDir: string) {
    const hooksDir = join(templatesDir, "hooks");
    try {
      const stats = await stat(hooksDir);
      if (!stats.isDirectory()) return;
    } catch {
      return;
    }

    const entries = await readdir(hooksDir);
    for (const file of entries) {
      if (!file.endsWith(".json")) continue;
      if (seen.has(file)) continue;
      seen.add(file);
      files.push({
        filePath: join(hooksDir, file),
        templateRelativePath: normalizePath(join("hooks", file)),
      });
    }
  }

  // Main dir first (wins priority via dedup)
  await scanHooksDir(safePath(root, config.templatesDir));

  // Additional dirs in order
  for (const dir of config.additionalTemplateDirs) {
    await scanHooksDir(resolveAdditionalDir(root, dir));
  }

  return files;
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
  const files: DiscoveredMCPFile[] = [];
  const seen = new Set<string>();

  async function scanMCPDir(templatesDir: string) {
    const mcpDir = join(templatesDir, "mcp");
    try {
      const stats = await stat(mcpDir);
      if (!stats.isDirectory()) return;
    } catch {
      return;
    }

    const entries = await readdir(mcpDir);
    for (const file of entries) {
      if (!file.endsWith(".json")) continue;
      if (seen.has(file)) continue;
      seen.add(file);
      files.push({
        filePath: join(mcpDir, file),
        templateRelativePath: normalizePath(join("mcp", file)),
      });
    }
  }

  // Main dir first (wins priority via dedup)
  await scanMCPDir(safePath(root, config.templatesDir));

  // Additional dirs in order
  for (const dir of config.additionalTemplateDirs) {
    await scanMCPDir(resolveAdditionalDir(root, dir));
  }

  return files;
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
      const isExcluded = excludeMatchers.get(targetName);
      if (isExcluded?.(template.templateRelativePath)) continue;

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

      // Copy extra files from skill directories
      if (template.extraFiles) {
        for (const extra of template.extraFiles) {
          const extraContent = await readFile(extra.filePath, "utf-8");
          const skillOutputDir = join(outputDir, `skills/${template.name}`);
          const extraOutputPath = join(skillOutputDir, extra.relativePath);

          // Render .md files through EJS, copy everything else raw
          const processedContent = extra.relativePath.endsWith(".md")
            ? renderEjs(extraContent, {
                target: targetName as Target,
                type: template.type,
                config,
              })
            : extraContent;

          generatedFiles.push({
            path: extraOutputPath,
            content: processedContent,
            target: targetName as Target,
            type: template.type,
            sourcePath: relative(root, extra.filePath),
          });
        }
      }
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
