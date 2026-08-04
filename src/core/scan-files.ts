import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

/**
 * Directory names never descended into when scanning a project tree for
 * generated outputs. Dependency trees and build output can dwarf the source
 * they sit next to, and uac never writes into any of them.
 */
const DEFAULT_SKIP_DIRS = [
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  ".yarn",
  ".pnpm-store",
  ".venv",
  "__pycache__",
  "vendor",
  "target",
];

interface WalkOptions {
  /** Directory names to skip, replacing `DEFAULT_SKIP_DIRS`. */
  skipDirs?: Iterable<string>;
  /** Extra directory names to skip on top of the defaults. */
  extraSkipDirs?: Iterable<string>;
  /** Max directory levels below `dir` to descend. Unlimited when omitted. */
  maxDepth?: number;
}

/**
 * Walk `dir` breadth-first, invoking `onFile` with every file's path relative
 * to `root` (POSIX separators).
 *
 * Uses an explicit stack with sequential `readdir` calls rather than recursive
 * `Promise.all` fan-out — a monorepo has enough directories to exhaust the file
 * descriptor limit if every level is opened concurrently.
 *
 * Symlinks are never followed: a dirent for a symlinked directory reports
 * `isSymbolicLink()` and not `isDirectory()`, so cycles are impossible without
 * extra bookkeeping. Unreadable directories are skipped silently — a
 * permissions error deep in a tree must never fail a clean.
 */
async function walk(
  root: string,
  dir: string,
  onFile: (relPath: string) => void,
  options?: WalkOptions,
): Promise<void> {
  const skip = new Set(options?.skipDirs ?? DEFAULT_SKIP_DIRS);
  for (const extra of options?.extraSkipDirs ?? []) skip.add(extra);
  const maxDepth = options?.maxDepth ?? Infinity;

  const stack: Array<{ path: string; depth: number }> = [{ path: dir, depth: 0 }];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;

    let entries;
    try {
      entries = await readdir(current.path, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = join(current.path, entry.name);
      if (entry.isDirectory()) {
        if (skip.has(entry.name)) continue;
        if (current.depth >= maxDepth) continue;
        stack.push({ path: full, depth: current.depth + 1 });
      } else if (entry.isFile()) {
        onFile(relative(root, full).split(sep).join("/"));
      }
    }
  }
}

/**
 * Find every file named exactly `fileName` under `root`, returning
 * root-relative POSIX paths in sorted order.
 *
 * Match on the basename only. Callers must never pass a name that users also
 * hand-author (`AGENTS.md`, `CLAUDE.md`) — this feeds a delete.
 */
export async function findFilesByName(
  root: string,
  fileName: string,
  options?: WalkOptions,
): Promise<string[]> {
  const found: string[] = [];
  await walk(
    root,
    root,
    (rel) => {
      if (rel.split("/").at(-1) === fileName) found.push(rel);
    },
    options,
  );
  return found.sort();
}

/**
 * List every file under `dir` as a root-relative POSIX path, sorted. Used by
 * preserve-aware cleanup, which has to delete a directory's contents one file
 * at a time instead of removing it wholesale.
 *
 * No directories are skipped: this walks output uac itself wrote, so the
 * default prune list (which exists to avoid dependency trees) would only risk
 * stranding a generated file that happens to sit in a `build/` skill folder.
 */
export async function listFilesRecursive(root: string, dir: string): Promise<string[]> {
  const found: string[] = [];
  await walk(root, dir, (rel) => found.push(rel), { skipDirs: [] });
  return found.sort();
}
