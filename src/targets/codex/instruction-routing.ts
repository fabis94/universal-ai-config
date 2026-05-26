import { normalizeGlobs } from "../../core/normalize-globs.js";
import type { UniversalFrontmatter } from "../../types.js";

/**
 * Given a glob pattern, return the longest leading directory prefix with no
 * wildcard characters, or `null` if the glob starts with a wildcard segment
 * or has no wildcard at all.
 *
 * Examples:
 *   "packages/frontend/**" → "packages/frontend"
 *   "src/api/**\/*.ts"      → "src/api"
 *   "**\/*.ts"              → null
 *   "*.md"                  → null
 *   "plain.ts"              → null  (no wildcard at all → no directory scope)
 */
export function globRootDir(glob: string): string | null {
  const parts = glob.split("/");
  const wildIdx = parts.findIndex((p) => /[*?[]/.test(p));
  if (wildIdx === -1) return null;
  if (wildIdx === 0) return null;
  return parts.slice(0, wildIdx).join("/");
}

/**
 * Compute the list of Codex emission paths for a single instruction template
 * based on its frontmatter. Mirrors the bucket-routing logic inside
 * `consolidateCodexInstructions`:
 *
 *   - alwaysApply: true                → ["AGENTS.md"]
 *   - no globs                         → ["AGENTS.md"]
 *   - all-leading-wildcard globs only  → ["AGENTS.md"]
 *   - any resolvable-prefix globs      → ["<dir>/AGENTS.override.md", ...] (alpha-sorted)
 *
 * When a template has both leading-wildcard and resolvable-prefix globs,
 * the resolvable dirs take precedence (strictly narrower scope) — the
 * leading-wildcard part is ignored, matching consolidate behavior.
 */
export function getCodexInstructionEmissionPaths(fm: UniversalFrontmatter): string[] {
  if (fm.alwaysApply) return ["AGENTS.md"];

  const globs = normalizeGlobs(fm.globs);
  if (globs.length === 0) return ["AGENTS.md"];

  const dirs = new Set<string>();
  for (const g of globs) {
    const dir = globRootDir(g);
    if (dir !== null) dirs.add(dir);
  }
  if (dirs.size === 0) return ["AGENTS.md"];

  return [...dirs].sort().map((d) => `${d}/AGENTS.override.md`);
}
