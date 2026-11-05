import { readFile, readdir, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../config/defaults.js";
import { targets } from "../../targets/index.js";
import type { TargetDefinition } from "../../targets/define-target.js";
import { createLocator, toPosixPath } from "../plan/locate.js";
import { createPreserveMatcher } from "../preserve-on-clean.js";
import { safePath } from "../safe-path.js";
import { listFilesRecursive } from "../scan-files.js";
import { parseToml, stringifyToml } from "../toml.js";
import { AGENTS_MD } from "../agents-md/index.js";
import type { PerTargetValue, Target, TemplateType } from "../../types.js";
import { findFilesOutsideInputs, templateDirsWithin } from "./agents-files.js";
import { ownedEntries, type CleanEntry } from "./entries.js";
import { legacyEntries } from "./legacy.js";

export interface CleanOptions {
  /** Report what would be removed without touching disk. */
  dryRun?: boolean;
  /** Per-target output dirs from resolved config; falls back to each target's default. */
  outputDirs?: Partial<Record<Target, string>>;
  /** Root-relative glob patterns that must never be deleted. */
  preserveOnClean?: PerTargetValue<string[]>;
  /** Templates dir: its input folders are never scanned for AGENTS.md files. */
  templatesDir?: string;
  /** Extra template dirs, skipped by the AGENTS.md scan like `templatesDir`. */
  additionalTemplateDirs?: string[];
  /**
   * The project's `agentsMd` config. With `enable: true`, every target that
   * reads AGENTS.md owns those files too, so cleaning it removes them.
   */
  agentsMd?: { enable?: boolean; indexDir?: string };
  /**
   * Called with each root-relative path that `preserveOnClean` kept. Only fires
   * for paths that actually exist — a pattern matching nothing is not reported,
   * so callers can surface exactly what was spared.
   */
  onPreserve?: (path: string) => void;
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

interface RemoveContext {
  root: string;
  dryRun: boolean;
  isPreserved: (path: string) => boolean;
  onPreserve: (path: string) => void;
}

/**
 * Remove `rel` (file or directory) while honoring `isPreserved`.
 *
 * With nothing preserved this is a plain recursive remove. When something
 * under a directory is preserved, the directory can't go wholesale: its other
 * files are deleted one by one and emptied subdirectories are pruned, and the
 * directory itself survives.
 *
 * Returns the root-relative paths removed (the directory itself when it was
 * removed whole, otherwise each removed file).
 */
async function removePath(rel: string, ctx: RemoveContext): Promise<string[]> {
  const fullPath = safePath(ctx.root, rel);
  const stats = await stat(fullPath).catch(() => undefined);
  if (!stats) return [];

  if (ctx.isPreserved(rel)) {
    ctx.onPreserve(rel);
    return [];
  }

  if (!stats.isDirectory()) {
    if (!ctx.dryRun) await rm(fullPath, { force: true });
    return [rel];
  }

  const contained = await listFilesRecursive(ctx.root, fullPath);
  const doomed: string[] = [];
  for (const p of contained) {
    if (ctx.isPreserved(p)) ctx.onPreserve(p);
    else doomed.push(p);
  }
  if (doomed.length === contained.length) {
    if (!ctx.dryRun) await rm(fullPath, { recursive: true, force: true });
    return [rel];
  }

  for (const p of doomed) {
    if (!ctx.dryRun) await rm(safePath(ctx.root, p), { force: true });
  }
  if (!ctx.dryRun) await pruneEmptyDirs(fullPath);
  return doomed;
}

/**
 * Remove one top-level key from a JSON or TOML file shared with user
 * settings, deleting the file when nothing else is left in it.
 */
async function removeKey(
  entry: Extract<CleanEntry, { kind: "key" }>,
  ctx: RemoveContext,
): Promise<string[]> {
  const fullPath = safePath(ctx.root, entry.path);
  let text: string;
  try {
    text = await readFile(fullPath, "utf-8");
  } catch {
    return [];
  }
  if (ctx.isPreserved(entry.path)) {
    ctx.onPreserve(entry.path);
    return [];
  }

  let data: Record<string, unknown>;
  try {
    data =
      entry.format === "toml" ? parseToml(text) : (JSON.parse(text) as Record<string, unknown>);
  } catch {
    // Not parseable: not uac's content to touch
    return [];
  }
  if (!(entry.key in data)) return [];
  data = Object.fromEntries(Object.entries(data).filter(([key]) => key !== entry.key));

  if (!ctx.dryRun) {
    if (Object.keys(data).length === 0) {
      await rm(fullPath, { force: true });
    } else {
      const serialized =
        entry.format === "toml"
          ? `${stringifyToml(data).trimEnd()}\n`
          : `${JSON.stringify(data, null, 2)}\n`;
      await writeFile(fullPath, serialized, "utf-8");
    }
  }
  return [entry.path];
}

function readsAgentsMd(definition: TargetDefinition | undefined): boolean {
  return (definition?.reads?.instructions ?? []).some((read) => read.from === "agentsMd");
}

/**
 * Whether cleaning `target` covers the AGENTS.md files: codex always (its
 * instructions are AGENTS.md), any other reader only when `agentsMd.enable`
 * made AGENTS.md its instruction output.
 */
function ownsAgentsMd(target: Target, options?: CleanOptions): boolean {
  const definition = targets[target];
  if (definition?.instructions === "agentsMd") return true;
  return options?.agentsMd?.enable === true && readsAgentsMd(definition);
}

/**
 * Remove generated artifacts for a set of targets.
 *
 * The targets are the set being cleaned, like `-t` in generate: everything
 * any of them would generate goes, shared paths included (`.mcp.json` when
 * cleaning copilot — the next generate restores it). When `targetNames` is
 * omitted every registered target is cleaned, not just the configured ones —
 * that's what removes the output of a target you dropped from `targets`.
 *
 * With `types`, only artifacts of those template types are removed; omitted,
 * every type is. Pass the resolved `config.types` for the CLI's semantics,
 * where a type left out of `types` is never touched.
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
  const includesType = (type: TemplateType): boolean => !types || types.includes(type);
  const locator = createLocator({
    outputDirs: { ...DEFAULT_CONFIG.outputDirs, ...options?.outputDirs },
    agentsMd: {
      ...DEFAULT_CONFIG.agentsMd,
      ...(options?.agentsMd?.indexDir ? { indexDir: options.agentsMd.indexDir } : {}),
    },
  });
  const removed = new Set<string>();
  const contextFor = (matchers: Array<(path: string) => boolean>): RemoveContext => ({
    root,
    dryRun: options?.dryRun ?? false,
    isPreserved: (path) => matchers.some((matcher) => matcher(path)),
    onPreserve: (path) => options?.onPreserve?.(path),
  });

  for (const target of targetList) {
    if (!targets[target]) continue;
    const ctx = contextFor([createPreserveMatcher(options?.preserveOnClean, target)]);
    for (const entry of [...ownedEntries(target, locator), ...legacyEntries(target)]) {
      if (!includesType(entry.type)) continue;
      const paths =
        entry.kind === "key" ? await removeKey(entry, ctx) : await removePath(entry.path, ctx);
      for (const path of paths) removed.add(path);
    }
  }

  // AGENTS.md files: root and nested ones sit wherever folder-scoped
  // instructions pointed, so a scan finds them (including ones a template
  // no longer derives). Legacy AGENTS.override.md files are not removed here:
  // see findAgentsOverrideFiles().
  const owners = targetList.filter((target) => ownsAgentsMd(target, options));
  if (owners.length > 0 && includesType("instructions")) {
    const ctx = contextFor(
      owners.map((target) => createPreserveMatcher(options?.preserveOnClean, target)),
    );
    const templateDirs = templateDirsWithin(root, [
      options?.templatesDir ?? DEFAULT_CONFIG.templatesDir,
      ...(options?.additionalTemplateDirs ?? []),
    ]);
    for (const rel of await findFilesOutsideInputs(root, AGENTS_MD, templateDirs)) {
      for (const path of await removePath(rel, ctx)) removed.add(path);
    }
    const indexDir = toPosixPath(options?.agentsMd?.indexDir ?? DEFAULT_CONFIG.agentsMd.indexDir);
    for (const path of await removePath(indexDir, ctx)) removed.add(path);
  }

  return [...removed];
}
