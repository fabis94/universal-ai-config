import { consola } from "consola";
import { findProjectRoot } from "../core/find-project-root.js";

/**
 * Resolve the project root for a CLI command. An explicit `--root` wins and disables walk-up.
 * Otherwise search upward from `startDir` for a uac root; when one is found above the start dir,
 * inform the user that a different directory is being used. Falls back to the start dir when no
 * root is found anywhere up the tree.
 *
 * `startDir` defaults to `process.cwd()` and is parameterized so tests can drive it without
 * mutating the global cwd.
 */
export function resolveCliRoot(explicitRoot?: string, startDir: string = process.cwd()): string {
  if (explicitRoot) return explicitRoot;
  const { root, startDir: start, walkedUp } = findProjectRoot(startDir);
  if (walkedUp) {
    consola.info(`No uac project at ${start} — using ${root}`);
  }
  return root;
}
