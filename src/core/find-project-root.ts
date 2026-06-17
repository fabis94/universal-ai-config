import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const TEMPLATES_DIR = ".universal-ai-config";
const CONFIG_EXTENSIONS = ["ts", "js", "mjs", "cjs", "mts", "cts", "json"];

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * A directory is a uac root when it contains a `.universal-ai-config/` folder or a
 * `universal-ai-config.config.*` file. The folder is the strong default marker; the config
 * file covers projects with a custom `templatesDir` (which can only be set via the config
 * file, so the custom directory name itself need not be detected).
 */
function hasUacMarker(dir: string): boolean {
  if (isDir(join(dir, TEMPLATES_DIR))) return true;
  return CONFIG_EXTENSIONS.some((ext) =>
    existsSync(join(dir, `universal-ai-config.config.${ext}`)),
  );
}

interface ProjectRootResult {
  /** Resolved root to use. */
  root: string;
  /** Resolved start dir (where the search began). */
  startDir: string;
  /** True when `root` differs from `startDir` (a root was found by walking up). */
  walkedUp: boolean;
  /** True when a uac marker was located anywhere up the tree. */
  found: boolean;
}

/**
 * Walk up from `startDir` to the first ancestor that is a uac root. Falls back to `startDir`
 * (with `found: false`) when no root exists anywhere up the tree.
 */
export function findProjectRoot(startDir: string): ProjectRootResult {
  const start = resolve(startDir);
  let dir = start;
  for (;;) {
    if (hasUacMarker(dir)) {
      return { root: dir, startDir: start, walkedUp: dir !== start, found: true };
    }
    const parent = dirname(dir);
    if (parent === dir) break; // hit filesystem root
    dir = parent;
  }
  return { root: start, startDir: start, walkedUp: false, found: false };
}
