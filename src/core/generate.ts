import { readFile, readdir, stat } from "node:fs/promises";
import { join, basename, relative, sep } from "node:path";
import { consola } from "consola";
import { stringify as stringifyYAML } from "yaml";
import { loadProjectConfig } from "../config/loader.js";
import { createExcludeMatcher } from "./exclude.js";
import { filterMCPServers } from "./filter-mcp-servers.js";
import { parseFrontmatter, parseTemplate, renderEjs, type TemplatesIndex } from "./parser.js";
import { resolveJsonVariables } from "./resolve-json-variables.js";
import { resolveOverrides } from "./resolve-overrides.js";
import {
  displayPathFor,
  excludePathsFor,
  resolveTemplateSources,
  type TemplateSource,
} from "./template-sources.js";
import { stringifyToml } from "./toml.js";
import { targets } from "../targets/index.js";
import type { ConsolidateInput, TemplateTypeConfig } from "../targets/define-target.js";
import type {
  GeneratedFile,
  GenerateOptions,
  InMemoryExtraFile,
  ResolvedConfig,
  ShadowEvent,
  Target,
  TemplateType,
  UniversalFrontmatter,
  UniversalHookHandler,
  UniversalMCPInput,
  UniversalMCPServer,
} from "../types.js";

/** Reports a candidate that lost a name collision. No-op when the caller passed no callback. */
type ShadowReporter = (event: ShadowEvent) => void;

/**
 * Deterministic JSON for comparing two merged entries by value: object keys are
 * emitted in sorted order, so declaration order in the source file never makes
 * two identical handlers look different.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

/** Normalize path separators to forward slashes for glob matching */
function normalizePath(p: string): string {
  return sep === "/" ? p : p.split(sep).join("/");
}

interface ExtraFile {
  /** Path relative to the skill directory, e.g. "references/example.md" */
  relativePath: string;
  /** Absolute path to the file on disk */
  filePath: string;
  /** In-memory content — when present, readFile is skipped */
  content?: string;
}

interface DiscoveredTemplate {
  name: string;
  type: TemplateType;
  filePath: string;
  /** Path relative to project root (used as sourcePath in GeneratedFile) */
  relativePath: string;
  /** Path relative to the containing templates dir, e.g. "instructions/foo.md" (used for exclude matching) */
  templateRelativePath: string;
  /** Every spelling `exclude` may address this candidate by — see `excludePathsFor` */
  excludePaths: string[];
  /** Source-qualified path, e.g. "shared-templates/instructions/foo.md" — for shadow reports */
  displayPath: string;
  /** Extra files in skill directories (beyond SKILL.md) */
  extraFiles?: ExtraFile[];
  /** In-memory content — when present, readFile is skipped */
  content?: string;
}

/**
 * All candidates competing for one identity (`type` + `name`), in precedence
 * order: `templatesDir`, then each `additionalTemplateDirs` entry, then
 * in-memory templates. The winner is picked per target, after `exclude`.
 */
interface TemplateSlot {
  type: TemplateType;
  name: string;
  candidates: DiscoveredTemplate[];
  winnerByTarget: Map<Target, DiscoveredTemplate | undefined>;
}

/**
 * Pick the first candidate `exclude` didn't remove, and report every
 * non-excluded candidate behind it as shadowed.
 *
 * Candidates *ahead* of the winner were removed by `exclude` — the user asked
 * for that, so they stay silent. Only precedence losers are reported.
 */
function selectWinner<T extends { excludePaths: string[]; displayPath: string }>(
  candidates: T[],
  isExcluded: (path: string) => boolean,
  onShadowed: (loser: T, winner: T) => void,
): T | undefined {
  const kept = candidates.filter((c) => !c.excludePaths.some((p) => isExcluded(p)));
  const [winner, ...losers] = kept;
  if (!winner) return undefined;
  for (const loser of losers) onShadowed(loser, winner);
  return winner;
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

/**
 * Collect every candidate for every identity, grouped into slots in precedence
 * order. Nothing is dropped here — a name collision is resolved per target,
 * once `exclude` is known (see `selectWinner`).
 *
 * Slot order follows first-discovery order, so for a project with no collisions
 * the emitted file order is identical to scanning a flat list.
 */
async function discoverTemplates(
  root: string,
  config: ResolvedConfig,
): Promise<Map<string, TemplateSlot>> {
  const slots = new Map<string, TemplateSlot>();

  function addCandidate(type: TemplateType, name: string, candidate: DiscoveredTemplate): void {
    const key = `${type}:${name}`;
    let slot = slots.get(key);
    if (!slot) {
      slot = { type, name, candidates: [], winnerByTarget: new Map() };
      slots.set(key, slot);
    }
    slot.candidates.push(candidate);
  }

  async function scanDir(source: TemplateSource) {
    for (const type of config.types) {
      // Hooks and MCP are handled separately — they use JSON, not markdown templates
      if (type === "hooks" || type === "mcp") continue;

      const typeDir = join(source.dir, type);
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
          const skillDir = join(typeDir, entry);
          const skillStats = await stat(skillDir);
          if (!skillStats.isDirectory()) continue;
          const skillFile = join(skillDir, "SKILL.md");
          try {
            await stat(skillFile);

            // Collect extra files (everything except SKILL.md)
            const allFiles = await collectFiles(skillDir);
            const extraFiles = allFiles.filter((f) => f.relativePath !== "SKILL.md");
            const templateRelativePath = normalizePath(relative(source.dir, skillFile));

            addCandidate(type, entry, {
              name: entry,
              type,
              filePath: skillFile,
              relativePath: relative(root, skillFile),
              templateRelativePath,
              excludePaths: excludePathsFor(source, root, templateRelativePath),
              displayPath: displayPathFor(source, templateRelativePath),
              extraFiles: extraFiles.length > 0 ? extraFiles : undefined,
            });
          } catch {
            // SKILL.md doesn't exist in this folder — the name stays unclaimed,
            // so a lower-precedence dir with a real skill can still win it
          }
        }
      } else {
        // Instructions and agents are flat .md files
        const entries = await readdir(typeDir);
        for (const entry of entries) {
          if (!entry.endsWith(".md")) continue;
          const name = basename(entry, ".md");

          const filePath = join(typeDir, entry);
          const fileStats = await stat(filePath);
          if (!fileStats.isFile()) continue;

          const templateRelativePath = normalizePath(relative(source.dir, filePath));
          addCandidate(type, name, {
            name,
            type,
            filePath,
            relativePath: relative(root, filePath),
            templateRelativePath,
            excludePaths: excludePathsFor(source, root, templateRelativePath),
            displayPath: displayPathFor(source, templateRelativePath),
          });
        }
      }
    }
  }

  // Main dir first, then additional dirs in order — this is the precedence chain
  for (const source of resolveTemplateSources(root, config)) {
    await scanDir(source);
  }

  return slots;
}

function generateFileContent(frontmatter: Record<string, unknown>, body: string): string {
  const fmString = formatFrontmatter(frontmatter);
  if (fmString.length === 0) {
    return body.startsWith("\n") ? body.slice(1) : body;
  }
  return `---\n${fmString}\n---\n${body}`;
}

interface DiscoveredJsonFile {
  filePath: string;
  /** Path relative to templates dir, e.g. "hooks/basic.json" */
  templateRelativePath: string;
  /** Every spelling `exclude` may address this candidate by — see `excludePathsFor` */
  excludePaths: string[];
  /** Source-qualified path, e.g. "shared-templates/hooks/basic.json" — for shadow reports */
  displayPath: string;
}

/** All JSON files competing for one basename, in precedence order. */
interface JsonSlot {
  name: string;
  candidates: DiscoveredJsonFile[];
}

/**
 * Discover `hooks/*.json` or `mcp/*.json` across every source dir, grouped by
 * basename. Files with *different* basenames all merge downstream — the slot
 * only resolves same-named files, where the highest-precedence one wins whole.
 */
async function discoverJsonFiles(
  root: string,
  config: ResolvedConfig,
  type: "hooks" | "mcp",
): Promise<Map<string, JsonSlot>> {
  const slots = new Map<string, JsonSlot>();

  async function scanDir(source: TemplateSource) {
    const typeDir = join(source.dir, type);
    try {
      const stats = await stat(typeDir);
      if (!stats.isDirectory()) return;
    } catch {
      return;
    }

    const entries = await readdir(typeDir);
    for (const file of entries) {
      if (!file.endsWith(".json")) continue;
      const templateRelativePath = normalizePath(join(type, file));
      let slot = slots.get(file);
      if (!slot) {
        slot = { name: file, candidates: [] };
        slots.set(file, slot);
      }
      slot.candidates.push({
        filePath: join(typeDir, file),
        templateRelativePath,
        excludePaths: excludePathsFor(source, root, templateRelativePath),
        displayPath: displayPathFor(source, templateRelativePath),
      });
    }
  }

  // Main dir first, then additional dirs in order — this is the precedence chain
  for (const source of resolveTemplateSources(root, config)) {
    await scanDir(source);
  }

  return slots;
}

/** Resolve each basename slot to its winning file for one target, reporting shadowed copies. */
function selectJsonFiles(
  slots: Map<string, JsonSlot>,
  type: "hooks" | "mcp",
  targetName: Target,
  isExcluded: (path: string) => boolean,
  report: ShadowReporter,
): DiscoveredJsonFile[] {
  const selected: DiscoveredJsonFile[] = [];
  for (const slot of slots.values()) {
    const winner = selectWinner(slot.candidates, isExcluded, (loser, won) =>
      report({
        target: targetName,
        type,
        scope: "file",
        name: slot.name,
        losingPath: loser.displayPath,
        winningPath: won.displayPath,
      }),
    );
    if (winner) selected.push(winner);
  }
  return selected;
}

interface MergedHookData {
  hooks: Record<string, Record<string, unknown>[]>;
  /** Maps each merged handler object back to the file it came from */
  handlerSources: WeakMap<Record<string, unknown>, DiscoveredJsonFile>;
}

async function mergeHookFiles(
  files: DiscoveredJsonFile[],
  variables: Record<string, unknown>,
): Promise<MergedHookData | null> {
  if (files.length === 0) return null;

  const merged: Record<string, Record<string, unknown>[]> = {};
  const handlerSources = new WeakMap<Record<string, unknown>, DiscoveredJsonFile>();

  for (const file of files) {
    const rawContent = await readFile(file.filePath, "utf-8");
    const rawParsed = JSON.parse(rawContent);
    const parsed = resolveJsonVariables(rawParsed, variables) as {
      hooks?: Record<string, Record<string, unknown>[]>;
    };
    if (!parsed.hooks) continue;

    for (const [event, handlers] of Object.entries(parsed.hooks)) {
      if (!merged[event]) {
        merged[event] = [];
      }
      for (const handler of handlers) {
        merged[event].push(handler);
        handlerSources.set(handler, file);
      }
    }
  }

  return Object.keys(merged).length > 0 ? { hooks: merged, handlerSources } : null;
}

/**
 * Resolve per-target overrides on every merged handler, dropping duplicates.
 *
 * Handlers have no name to key on, so identity is the resolved handler itself:
 * two files that produce an identical handler for this target declared the same
 * hook, and the first one wins. Comparing *after* override resolution is what
 * makes `{ command: { claude: "x" } }` and `{ command: "x" }` collapse for
 * claude while staying distinct elsewhere.
 */
function resolveHookHandlers(
  hooks: Record<string, Record<string, unknown>[]>,
  target: Target,
  handlerSources: WeakMap<Record<string, unknown>, DiscoveredJsonFile>,
  survivingSources: Set<DiscoveredJsonFile>,
  report: ShadowReporter,
): Record<string, UniversalHookHandler[]> {
  const result: Record<string, UniversalHookHandler[]> = {};
  for (const [event, handlers] of Object.entries(hooks)) {
    const resolved: UniversalHookHandler[] = [];
    const winners = new Map<string, DiscoveredJsonFile | undefined>();
    for (const handler of handlers) {
      const r = resolveOverrides(handler, target);
      if (!r.command) continue;

      const fingerprint = stableStringify(r);
      const source = handlerSources.get(handler);
      if (winners.has(fingerprint)) {
        const winner = winners.get(fingerprint);
        report({
          target,
          type: "hooks",
          scope: "handler",
          name: event,
          losingPath: source?.displayPath ?? event,
          winningPath: winner?.displayPath ?? event,
        });
        continue;
      }

      winners.set(fingerprint, source);
      resolved.push(r as unknown as UniversalHookHandler);
      if (source) survivingSources.add(source);
    }
    if (resolved.length > 0) result[event] = resolved;
  }
  return result;
}

async function generateHooksFiles(
  root: string,
  config: ResolvedConfig,
  report: ShadowReporter,
): Promise<GeneratedFile[]> {
  const hookSlots = await discoverJsonFiles(root, config, "hooks");
  if (hookSlots.size === 0) return [];

  const generatedFiles: GeneratedFile[] = [];
  const hooksRelativePath = join(config.templatesDir, "hooks");

  for (const targetName of config.targets) {
    const targetDef = targets[targetName];
    if (!targetDef) continue;

    if (!targetDef.supportedTypes.includes("hooks")) continue;
    if (!targetDef.hooks) continue;

    // Resolve same-named files and drop excluded ones — both are per-target
    const isExcluded = createExcludeMatcher(config.exclude, targetName);
    const filteredFiles = selectJsonFiles(hookSlots, "hooks", targetName, isExcluded, report);

    const mergedHooks = await mergeHookFiles(filteredFiles, config.variables);
    if (!mergedHooks) continue;

    const hooksConfig = targetDef.hooks;
    const survivingSources = new Set<DiscoveredJsonFile>();
    const resolvedHooks = resolveHookHandlers(
      mergedHooks.hooks,
      targetName,
      mergedHooks.handlerSources,
      survivingSources,
      report,
    );
    const transformed = hooksConfig.transform(resolvedHooks);
    const outputDir = config.outputDirs[targetName as Target] ?? targetDef.outputDir;
    const fullOutputPath = join(outputDir, hooksConfig.outputPath);

    const hooksFormat = hooksConfig.format ?? "json";
    const content =
      hooksFormat === "toml"
        ? stringifyToml(transformed) + "\n"
        : JSON.stringify(transformed, null, 2) + "\n";

    generatedFiles.push({
      path: fullOutputPath,
      content,
      target: targetName as Target,
      type: "hooks",
      sourcePath: hooksRelativePath,
      mergeKey: hooksConfig.mergeKey,
      mergeFormat: hooksFormat === "toml" ? "toml" : undefined,
      inputCount: survivingSources.size,
    });
  }

  return generatedFiles;
}

interface MergedMCPData {
  servers: Record<string, Record<string, unknown>>;
  inputs: UniversalMCPInput[];
  /** server name → the file whose declaration won (first-wins) */
  serverSources: Map<string, DiscoveredJsonFile>;
  /** files that contributed at least one surviving entry to `inputs` */
  inputSources: Set<DiscoveredJsonFile>;
}

/**
 * Merge every `mcp/*.json` that survived file-level selection.
 *
 * Servers are keyed by name and inputs by `id`, and the **first** declaration
 * wins — same rule as every other template type, so a shared dir can never
 * silently override a server the project declared itself.
 */
async function mergeMCPFiles(
  files: DiscoveredJsonFile[],
  variables: Record<string, unknown>,
  targetName: Target,
  report: ShadowReporter,
): Promise<MergedMCPData | null> {
  if (files.length === 0) return null;

  const servers: Record<string, Record<string, unknown>> = {};
  const inputs: UniversalMCPInput[] = [];
  const serverSources = new Map<string, DiscoveredJsonFile>();
  const inputSources = new Set<DiscoveredJsonFile>();
  const inputSourceById = new Map<string, DiscoveredJsonFile>();

  for (const file of files) {
    const rawContent = await readFile(file.filePath, "utf-8");
    const rawParsed = JSON.parse(rawContent);
    const parsed = resolveJsonVariables(rawParsed, variables) as {
      mcpServers?: Record<string, Record<string, unknown>>;
      inputs?: UniversalMCPInput[];
    };

    if (parsed.mcpServers) {
      for (const [name, serverConfig] of Object.entries(parsed.mcpServers)) {
        const winner = serverSources.get(name);
        if (winner) {
          report({
            target: targetName,
            type: "mcp",
            scope: "server",
            name,
            losingPath: file.displayPath,
            winningPath: winner.displayPath,
          });
          continue;
        }
        servers[name] = serverConfig;
        serverSources.set(name, file);
      }
    }

    for (const input of parsed.inputs ?? []) {
      // `id` is required by the schema, but these files are untyped at runtime —
      // fall back to comparing the whole declaration.
      const key = typeof input?.id === "string" ? input.id : stableStringify(input);
      const winner = inputSourceById.get(key);
      if (winner) {
        report({
          target: targetName,
          type: "mcp",
          scope: "input",
          name: key,
          losingPath: file.displayPath,
          winningPath: winner.displayPath,
        });
        continue;
      }
      inputSourceById.set(key, file);
      inputs.push(input);
      inputSources.add(file);
    }
  }

  return Object.keys(servers).length > 0 ? { servers, inputs, serverSources, inputSources } : null;
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

async function generateMCPFiles(
  root: string,
  config: ResolvedConfig,
  report: ShadowReporter,
): Promise<GeneratedFile[]> {
  const mcpSlots = await discoverJsonFiles(root, config, "mcp");
  if (mcpSlots.size === 0) return [];

  const generatedFiles: GeneratedFile[] = [];
  const mcpRelativePath = join(config.templatesDir, "mcp");

  for (const targetName of config.targets) {
    const targetDef = targets[targetName];
    if (!targetDef) continue;

    if (!targetDef.supportedTypes.includes("mcp")) continue;
    if (!targetDef.mcp) continue;

    // Resolve same-named files and drop excluded ones — both are per-target
    const isExcluded = createExcludeMatcher(config.exclude, targetName);
    const filteredFiles = selectJsonFiles(mcpSlots, "mcp", targetName, isExcluded, report);

    const mergedData = await mergeMCPFiles(filteredFiles, config.variables, targetName, report);
    if (!mergedData) continue;

    const mcpConfig = targetDef.mcp;
    const resolvedServers = resolveMCPServers(mergedData.servers, targetName);

    const { servers: finalServers, unknownNames } = filterMCPServers(
      resolvedServers,
      config.mcp,
      targetName,
    );
    if (unknownNames.length > 0) {
      const known = Object.keys(resolvedServers).join(", ") || "(none)";
      consola.warn(
        `[uac] ${targetName}: mcp.mcpServers references unknown server name(s): ${unknownNames.join(", ")}. Known: ${known}`,
      );
    }
    if (Object.keys(finalServers).length === 0) continue;

    const transformed = mcpConfig.transform(finalServers, mergedData.inputs);

    const survivingSources = new Set<DiscoveredJsonFile>();
    for (const name of Object.keys(finalServers)) {
      const src = mergedData.serverSources.get(name);
      if (src) survivingSources.add(src);
    }
    // Files contributing only Copilot `inputs` count only when the transform actually emits them
    const emittedInputs = (transformed as { inputs?: unknown[] }).inputs;
    if (Array.isArray(emittedInputs) && emittedInputs.length > 0) {
      for (const src of mergedData.inputSources) survivingSources.add(src);
    }

    const mcpFormat = mcpConfig.format ?? "json";
    const content =
      mcpFormat === "toml"
        ? stringifyToml(transformed) + "\n"
        : JSON.stringify(transformed, null, 2) + "\n";

    generatedFiles.push({
      path: mcpConfig.outputPath,
      content,
      target: targetName as Target,
      type: "mcp",
      sourcePath: mcpRelativePath,
      mergeKey: mcpConfig.mergeKey,
      mergeFormat: mcpFormat === "toml" ? "toml" : undefined,
      inputCount: survivingSources.size,
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
    inlineOverrides: options.overrides,
  });

  // Validate target names
  for (const target of config.targets) {
    if (!targets[target]) {
      const available = Object.keys(targets).join(", ");
      throw new Error(`Unknown target "${target}". Available targets: ${available}`);
    }
  }

  const report: ShadowReporter = (event) => options.onShadowed?.(event);

  const slots = await discoverTemplates(root, config);

  // Append in-memory templates as the lowest-precedence candidates — a file
  // always outranks them, but one can still win a name every file candidate
  // was excluded from.
  if (options.templates) {
    for (const inMem of options.templates) {
      const key = `${inMem.type}:${inMem.name}`;
      const relativePath =
        inMem.type === "skills"
          ? `skills/${inMem.name}/SKILL.md`
          : `${inMem.type}/${inMem.name}.md`;

      let slot = slots.get(key);
      if (!slot) {
        slot = { type: inMem.type, name: inMem.name, candidates: [], winnerByTarget: new Map() };
        slots.set(key, slot);
      }
      slot.candidates.push({
        name: inMem.name,
        type: inMem.type,
        filePath: "",
        relativePath,
        templateRelativePath: relativePath,
        // No source dir to qualify with, so only the unqualified path addresses it
        excludePaths: [relativePath],
        displayPath: relativePath,
        content: inMem.content,
        extraFiles: inMem.extraFiles?.map((ef) => ({
          relativePath: ef.relativePath,
          filePath: "",
          content: ef.content,
        })),
      });
    }
  }

  const generatedFiles: GeneratedFile[] = [];

  // Pre-create exclude matchers for each target
  const excludeMatchers = new Map<string, (path: string) => boolean>();
  for (const targetName of config.targets) {
    excludeMatchers.set(targetName, createExcludeMatcher(config.exclude, targetName));
  }

  // Resolve every name collision, per target: the first candidate `exclude`
  // didn't remove wins, everything behind it is shadowed. This is per-target
  // because `exclude` is — excluding the winner for one target promotes the
  // runner-up for that target alone.
  for (const targetName of config.targets) {
    const isExcluded = excludeMatchers.get(targetName) ?? (() => false);
    for (const slot of slots.values()) {
      const winner = selectWinner(slot.candidates, isExcluded, (loser, won) =>
        report({
          target: targetName,
          type: slot.type,
          scope: "template",
          name: slot.name,
          losingPath: loser.displayPath,
          winningPath: won.displayPath,
        }),
      );
      slot.winnerByTarget.set(targetName, winner);
    }
  }

  // Read a candidate's content, caching by file path so a template that wins for
  // several targets is still read from disk exactly once.
  const templateContentCache = new Map<string, string>();
  const readCandidate = async (template: DiscoveredTemplate): Promise<string> => {
    if (template.content !== undefined) return template.content;
    const cached = templateContentCache.get(template.filePath);
    if (cached !== undefined) return cached;
    const content = await readFile(template.filePath, "utf-8");
    templateContentCache.set(template.filePath, content);
    return content;
  };

  // Pre-pass: build a per-target index of instruction template name → resolved
  // frontmatter. Path helpers like `instructionPath('foo')` need this to compute
  // the actual emission path for Codex (which routes to AGENTS.md vs
  // <dir>/AGENTS.override.md based on globs/alwaysApply). The index holds the
  // per-target winner, so path helpers see what will actually be generated.
  const frontmatterCache = new Map<string, Record<string, unknown>>();
  const templatesIndexByTarget = new Map<Target, TemplatesIndex>();
  for (const targetName of config.targets) {
    templatesIndexByTarget.set(targetName as Target, {
      instructions: new Map<string, UniversalFrontmatter>(),
    });
  }
  for (const slot of slots.values()) {
    if (slot.type !== "instructions") continue;
    for (const targetName of config.targets) {
      const winner = slot.winnerByTarget.get(targetName);
      if (!winner) continue;

      let frontmatter = winner.filePath ? frontmatterCache.get(winner.filePath) : undefined;
      if (!frontmatter) {
        const content = await readCandidate(winner);
        frontmatter = parseFrontmatter(content).frontmatter as Record<string, unknown>;
        if (winner.filePath) frontmatterCache.set(winner.filePath, frontmatter);
      }

      const resolved = resolveOverrides(frontmatter, targetName) as UniversalFrontmatter;
      templatesIndexByTarget.get(targetName as Target)?.instructions.set(slot.name, resolved);
    }
  }

  // Buffers for `consolidate` API — collected during the per-template loop and
  // emitted in a single call to `typeConfig.consolidate(...)` after the loop.
  // Keyed by `${target}:${type}`.
  interface ConsolidateBuffer {
    targetName: Target;
    type: TemplateType;
    outputDir: string;
    consolidateFn: NonNullable<TemplateTypeConfig["consolidate"]>;
    templates: ConsolidateInput["templates"];
  }
  const consolidateBuffers = new Map<string, ConsolidateBuffer>();

  for (const slot of slots.values()) {
    for (const targetName of config.targets) {
      // The winner already accounts for `exclude`; no winner means every
      // candidate for this name was excluded for this target.
      const template = slot.winnerByTarget.get(targetName);
      if (!template) continue;
      const content = await readCandidate(template);

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
        templatesIndex: templatesIndexByTarget.get(targetName as Target),
      });

      const resolvedFm = resolveOverrides(
        parsed.frontmatter as Record<string, unknown>,
        targetName,
      ) as UniversalFrontmatter;
      const outputDir = config.outputDirs[targetName as Target] ?? targetDef.outputDir;

      // If the target's type config uses `consolidate`, buffer the parsed
      // template (plus any rendered extra files) for a single batched call
      // after the loop. The consolidate function owns all path/content emission.
      if (typeConfig.consolidate) {
        let extraFiles: InMemoryExtraFile[] | undefined;
        if (template.extraFiles && template.extraFiles.length > 0) {
          extraFiles = [];
          for (const extra of template.extraFiles) {
            const extraContent = extra.content ?? (await readFile(extra.filePath, "utf-8"));
            const processedContent = extra.relativePath.endsWith(".md")
              ? renderEjs(extraContent, {
                  target: targetName as Target,
                  type: template.type,
                  config,
                  templatesIndex: templatesIndexByTarget.get(targetName as Target),
                })
              : extraContent;
            extraFiles.push({
              relativePath: extra.relativePath,
              content: processedContent,
            });
          }
        }

        const key = `${targetName}:${template.type}`;
        let buf = consolidateBuffers.get(key);
        if (!buf) {
          buf = {
            targetName: targetName as Target,
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
          extraFiles,
        });
        continue;
      }

      // Default 1:1 emit path (claude/copilot/cursor).
      const mappedFrontmatter = mapFrontmatter(resolvedFm, typeConfig);
      const outputPath = typeConfig.getOutputPath(template.name, resolvedFm);
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
          const extraContent = extra.content ?? (await readFile(extra.filePath, "utf-8"));
          const skillOutputDir = join(outputDir, `skills/${template.name}`);
          const extraOutputPath = join(skillOutputDir, extra.relativePath);

          // Render .md files through EJS, copy everything else raw
          const processedContent = extra.relativePath.endsWith(".md")
            ? renderEjs(extraContent, {
                target: targetName as Target,
                type: template.type,
                config,
                templatesIndex: templatesIndexByTarget.get(targetName as Target),
              })
            : extraContent;

          generatedFiles.push({
            path: extraOutputPath,
            content: processedContent,
            target: targetName as Target,
            type: template.type,
            sourcePath: extra.filePath ? relative(root, extra.filePath) : extra.relativePath,
          });
        }
      }
    }
  }

  // Invoke consolidate functions with the buffered template lists. Each
  // function returns root-relative `GeneratedFile`s for its (target, type).
  for (const buf of consolidateBuffers.values()) {
    const consolidateInput: ConsolidateInput = {
      templates: buf.templates,
      outputDir: buf.outputDir,
      root,
    };
    const files = await buf.consolidateFn(consolidateInput);
    generatedFiles.push(...files);
  }

  // Generate hooks files (separate pipeline — JSON, not markdown)
  if (config.types.includes("hooks")) {
    const hooksFiles = await generateHooksFiles(root, config, report);
    generatedFiles.push(...hooksFiles);
  }

  // Generate MCP files (separate pipeline — JSON, root-relative output)
  if (config.types.includes("mcp")) {
    const mcpFiles = await generateMCPFiles(root, config, report);
    generatedFiles.push(...mcpFiles);
  }

  return generatedFiles;
}
