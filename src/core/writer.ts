import { access, mkdir, readFile, readdir, writeFile, rm, rmdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { consola } from "consola";
import { targets } from "../targets/index.js";
import { CODEX_OVERRIDE_FILENAME } from "../targets/codex/instruction-routing.js";
import { safePath } from "./safe-path.js";
import { parseToml, stringifyToml } from "./toml.js";
import { createPreserveMatcher } from "./preserve-on-clean.js";
import { findFilesByName, listFilesRecursive } from "./scan-files.js";
import type { GeneratedFile, PerTargetValue, Target, TemplateType } from "../types.js";

/**
 * A single removable artifact, tagged with the `TemplateType` it belongs to so
 * `cleanTargetFiles` can honor a `--type` filter. `location` distinguishes paths
 * inside the target's `outputDir` (`"output"`) from project-root-relative ones
 * (`"root"`) — MCP config files and Codex's `AGENTS.md` / `.agents/skills` live
 * outside `outputDir`. The `hooks`/`mcp` special cases (Claude's `settings.json`
 * merge, Codex's `config.toml` table) are handled separately in `cleanTargetFiles`.
 */
interface CleanEntry {
  type: TemplateType;
  path: string;
  location: "output" | "root";
}

const CLEAN_ENTRIES: Record<string, CleanEntry[]> = {
  claude: [
    { type: "instructions", path: "rules", location: "output" },
    { type: "skills", path: "skills", location: "output" },
    { type: "agents", path: "agents", location: "output" },
    { type: "mcp", path: ".mcp.json", location: "root" },
  ],
  copilot: [
    { type: "instructions", path: "copilot-instructions.md", location: "output" },
    { type: "instructions", path: "instructions", location: "output" },
    { type: "agents", path: "agents", location: "output" },
    { type: "skills", path: "skills", location: "output" },
    { type: "hooks", path: "hooks", location: "output" },
    { type: "mcp", path: ".vscode/mcp.json", location: "root" },
  ],
  cursor: [
    { type: "instructions", path: "rules", location: "output" },
    { type: "skills", path: "skills", location: "output" },
    { type: "hooks", path: "hooks.json", location: "output" },
    { type: "mcp", path: ".cursor/mcp.json", location: "root" },
  ],
  codex: [
    { type: "agents", path: "agents", location: "output" },
    { type: "hooks", path: "hooks.json", location: "output" },
    { type: "instructions", path: "AGENTS.md", location: "root" },
    { type: "skills", path: ".agents/skills", location: "root" },
  ],
};

async function mergeJsonKey(fullPath: string, content: string, mergeKey: string): Promise<string> {
  const newData = JSON.parse(content) as Record<string, unknown>;
  const mergeValue = newData[mergeKey];

  let existing: Record<string, unknown> = {};
  try {
    const existingContent = await readFile(fullPath, "utf-8");
    existing = JSON.parse(existingContent) as Record<string, unknown>;
  } catch {
    // File doesn't exist yet, start fresh
  }

  existing[mergeKey] = mergeValue;
  return JSON.stringify(existing, null, 2) + "\n";
}

/**
 * TOML twin of `mergeJsonKey`. Replaces only `mergeKey` of the existing TOML
 * file at `fullPath`, leaving all other top-level keys untouched. Used by
 * Codex to write the `mcp_servers` table into `.codex/config.toml` while
 * preserving any user-authored `[profiles.*]`, `personality`, etc.
 */
async function mergeTomlKey(fullPath: string, content: string, mergeKey: string): Promise<string> {
  const newData = parseToml(content);
  const mergeValue = newData[mergeKey];

  let existing: Record<string, unknown> = {};
  try {
    const existingContent = await readFile(fullPath, "utf-8");
    existing = parseToml(existingContent);
  } catch {
    // File doesn't exist yet, start fresh
  }

  existing[mergeKey] = mergeValue;
  return stringifyToml(existing) + "\n";
}

export async function writeGeneratedFiles(
  files: GeneratedFile[],
  root: string,
  options?: { verbose?: boolean },
): Promise<void> {
  for (const file of files) {
    const fullPath = safePath(root, file.path);
    await mkdir(dirname(fullPath), { recursive: true });

    if (file.mergeKey) {
      const merged =
        file.mergeFormat === "toml"
          ? await mergeTomlKey(fullPath, file.content, file.mergeKey)
          : await mergeJsonKey(fullPath, file.content, file.mergeKey);
      await writeFile(fullPath, merged, "utf-8");
    } else {
      await writeFile(fullPath, file.content, "utf-8");
    }

    if (options?.verbose) {
      const inputs =
        file.inputCount !== undefined
          ? ` (from ${file.inputCount} input${file.inputCount === 1 ? "" : "s"})`
          : "";
      consola.success(`Generated ${file.path}${inputs}`);
    }
  }
}

async function cleanClaudeHooks(
  root: string,
  outputDir: string,
  dryRun: boolean,
): Promise<string | undefined> {
  const settingsPath = join(root, outputDir, "settings.json");
  try {
    const content = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(content) as Record<string, unknown>;
    if ("hooks" in settings) {
      delete settings.hooks;
      if (!dryRun) {
        if (Object.keys(settings).length === 0) {
          await rm(settingsPath, { force: true });
        } else {
          await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
        }
      }
      return join(outputDir, "settings.json");
    }
  } catch {
    // File doesn't exist, nothing to clean
  }
  return undefined;
}

/**
 * Partial-key cleanup for Codex's shared `.codex/config.toml`. Deletes only
 * the `mcp_servers` table (uac-owned in v1), preserving any other top-level
 * sections (`[profiles.*]`, `personality`, etc.) the user has hand-authored.
 * Removes the file entirely if no other keys remain.
 */
async function cleanCodexConfig(
  root: string,
  outputDir: string,
  dryRun: boolean,
): Promise<string | undefined> {
  const configPath = join(root, outputDir, "config.toml");
  try {
    const content = await readFile(configPath, "utf-8");
    const data = parseToml(content);
    if ("mcp_servers" in data) {
      delete data.mcp_servers;
      if (!dryRun) {
        if (Object.keys(data).length === 0) {
          await rm(configPath, { force: true });
        } else {
          await writeFile(configPath, stringifyToml(data) + "\n", "utf-8");
        }
      }
      return join(outputDir, "config.toml");
    }
  } catch {
    // File doesn't exist, nothing to clean
  }
  return undefined;
}

/**
 * Remove `rel` (file or directory) while honoring `isPreserved`.
 *
 * With no preserved paths this is a plain recursive remove — the common case,
 * and identical to what clean has always done. When something under a directory
 * is preserved the directory can't be removed wholesale, so its files are
 * deleted individually and emptied subdirectories are pruned bottom-up. The
 * entry directory itself survives whenever anything is left inside it.
 *
 * Returns the root-relative paths actually removed (the directory itself when
 * it was removed whole, otherwise each removed file). Every existing path that
 * `isPreserved` spared is passed to `onPreserve`.
 */
async function removePath(
  root: string,
  rel: string,
  isPreserved: (path: string) => boolean,
  dryRun: boolean,
  onPreserve: (path: string) => void,
): Promise<string[]> {
  const fullPath = safePath(root, rel);

  const stats = await stat(fullPath).catch(() => undefined);
  if (!stats) return [];

  if (isPreserved(rel)) {
    onPreserve(rel);
    return [];
  }

  if (!stats.isDirectory()) {
    if (!dryRun) await rm(fullPath, { force: true });
    return [rel];
  }

  const contained = await listFilesRecursive(root, fullPath);
  const doomed: string[] = [];
  for (const p of contained) {
    if (isPreserved(p)) onPreserve(p);
    else doomed.push(p);
  }
  if (doomed.length === contained.length) {
    if (!dryRun) await rm(fullPath, { recursive: true, force: true });
    return [rel];
  }

  for (const p of doomed) {
    if (!dryRun) await rm(safePath(root, p), { force: true });
  }
  if (!dryRun) await pruneEmptyDirs(fullPath);
  return doomed;
}

/** Recursively remove directories left empty under `dir`, keeping `dir` itself. */
async function pruneEmptyDirs(dir: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const child = join(dir, entry.name);
    await pruneEmptyDirs(child);
    await rmdir(child).catch(() => undefined);
  }
}

export interface CleanOptions {
  verbose?: boolean;
  /** Report what would be removed without touching disk. */
  dryRun?: boolean;
  /** Per-target output dirs from resolved config; falls back to each target's default. */
  outputDirs?: Partial<Record<Target, string>>;
  /** Root-relative glob patterns that must never be deleted. */
  preserveOnClean?: PerTargetValue<string[]>;
  /** Templates dir, excluded from the Codex override scan (it holds inputs, not artifacts). */
  templatesDir?: string;
  /**
   * Called with each root-relative path that `preserveOnClean` kept. Only fires
   * for paths that actually exist — a pattern matching nothing is not reported,
   * so callers can surface exactly what was spared.
   */
  onPreserve?: (path: string) => void;
}

/**
 * Remove generated artifacts for the given targets. When `types` is provided,
 * only artifacts belonging to those template types are removed — so
 * `generate --type skills --clean` no longer wipes instructions/agents/hooks/mcp.
 * When `types` is omitted, every type is cleaned (the original behavior).
 *
 * When `targetNames` is omitted every registered target is cleaned, not just the
 * ones in the project's config — that's what lets you drop a target from
 * `targets` and still have its stale output removed.
 *
 * Returns the root-relative paths removed (or, under `dryRun`, that would be).
 */
export async function cleanTargetFiles(
  root: string,
  targetNames?: Target[],
  types?: TemplateType[],
  options?: CleanOptions,
): Promise<string[]> {
  const targetList = targetNames ?? (Object.keys(targets) as Target[]);
  const includesType = (t: TemplateType): boolean => !types || types.includes(t);
  const dryRun = options?.dryRun ?? false;
  const verb = dryRun ? "Would clean" : "Cleaned";
  const cleaned: string[] = [];

  for (const targetName of targetList) {
    const targetDef = targets[targetName];
    if (!targetDef) continue;

    const outputDir = options?.outputDirs?.[targetName] ?? targetDef.outputDir;
    const entries = CLEAN_ENTRIES[targetName];
    if (!entries) continue;

    const isPreserved = createPreserveMatcher(options?.preserveOnClean, targetName);
    const onPreserve = (rel: string): void => {
      if (options?.verbose) consola.info(`Preserved ${rel}`);
      options?.onPreserve?.(rel);
    };

    for (const entry of entries) {
      if (!includesType(entry.type)) continue;
      const rel = entry.location === "root" ? entry.path : join(outputDir, entry.path);
      const removed = await removePath(root, rel, isPreserved, dryRun, onPreserve);
      for (const path of removed) {
        cleaned.push(path);
        if (options?.verbose) consola.info(`${verb} ${path}`);
      }
    }

    // Claude hooks are merged into settings.json — need special handling
    if (targetName === "claude" && includesType("hooks")) {
      const settingsRel = join(outputDir, "settings.json");
      const settingsExists = await access(join(root, settingsRel)).then(
        () => true,
        () => false,
      );
      if (settingsExists && isPreserved(settingsRel)) {
        onPreserve(settingsRel);
      } else {
        const hookLabel = await cleanClaudeHooks(root, outputDir, dryRun);
        if (hookLabel) {
          cleaned.push(hookLabel);
          if (options?.verbose) consola.info(`${verb} hooks from ${hookLabel}`);
        }
      }
    }

    // Codex shares `.codex/config.toml` with user content — partial cleanup
    // removes only the `mcp_servers` table, preserving any other top-level keys.
    if (targetName === "codex" && includesType("mcp")) {
      const configRel = join(outputDir, "config.toml");
      const configExists = await access(join(root, configRel)).then(
        () => true,
        () => false,
      );
      if (configExists && isPreserved(configRel)) {
        onPreserve(configRel);
      } else {
        const configLabel = await cleanCodexConfig(root, outputDir, dryRun);
        if (configLabel) {
          cleaned.push(configLabel);
          if (options?.verbose) consola.info(`${verb} mcp_servers from ${configLabel}`);
        }
      }
    }

    // Codex instruction overrides land at data-dependent paths derived from each
    // template's `globs` prefix, so no static CLEAN_ENTRIES row can name them.
    // Orphans (deleted template, changed globs, target dropped from config) are
    // not harmless — Codex still reads them, so a stale file keeps steering
    // agents indefinitely. Match the exact basename only; never scan for
    // `AGENTS.md`, which users hand-author in nested dirs and uac only ever
    // writes at the root.
    if (targetName === "codex" && includesType("instructions")) {
      // A skill's extra files can legitimately include an `AGENTS.override.md`
      // as template *input*; those are sources, not artifacts.
      const templatesPrefix = options?.templatesDir
        ? `${options.templatesDir.replace(/\\/g, "/").replace(/\/+$/, "")}/`
        : undefined;
      const found = await findFilesByName(root, CODEX_OVERRIDE_FILENAME);
      for (const rel of found) {
        if (templatesPrefix && rel.startsWith(templatesPrefix)) continue;
        if (isPreserved(rel)) {
          onPreserve(rel);
          continue;
        }
        if (!dryRun) await rm(safePath(root, rel), { force: true });
        cleaned.push(rel);
        if (options?.verbose) consola.info(`${verb} ${rel}`);
      }
    }
  }

  return cleaned;
}
