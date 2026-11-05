import { normalizeGlobs } from "../normalize-globs.js";
import type { Reporter } from "../diagnostics.js";
import type { UniversalFrontmatter } from "../../types.js";

/** A folder an instruction applies to, and the globs that put it there. */
export interface DirScope {
  /** Root-relative folder, no trailing slash */
  dir: string;
  globs: string[];
  /** Every glob covers the whole folder (`dir/**`), so the folder alone says the scope */
  whole: boolean;
}

/**
 * Where an instruction applies:
 * - `always`: everywhere (alwaysApply, or no usable globs);
 * - `pattern`: files matching globs that have no folder to anchor them (`**\/*.ts`);
 * - `dirs`: one or more folders, plus `residual` globs with no folder of their own.
 */
export type Route =
  | { kind: "always" }
  | { kind: "pattern"; globs: string[] }
  | { kind: "dirs"; dirs: DirScope[]; residual: string[] };

/** A path segment that matches more than itself: `*`, `?`, `[…]`, `{…}` or an extglob `@(…)`. */
function isWildcardSegment(segment: string): boolean {
  return /[*?[{]/.test(segment) || /[@!+]\(/.test(segment);
}

/**
 * The folder a glob is anchored to: the segments before the first wildcard.
 * A glob with no wildcard names one path, so it is anchored to that path's
 * parent folder. `null` when the glob starts with a wildcard or sits at the
 * root.
 *
 *   "packages/frontend/**"  → "packages/frontend"
 *   "src/api/**\/*.ts"       → "src/api"
 *   "src/{a,b}/**"          → "src"
 *   "@scope/pkg/**"         → "@scope/pkg"
 *   "src/index.ts"          → "src"
 *   "**\/*.ts", "*.md", "README.md" → null
 */
export function globRootDir(glob: string): string | null {
  const parts = glob.split("/").filter((part) => part !== "");
  const wildIdx = parts.findIndex(isWildcardSegment);
  const anchor = wildIdx === -1 ? parts.slice(0, -1) : parts.slice(0, wildIdx);
  return anchor.length > 0 ? anchor.join("/") : null;
}

/** `dir/**` and `dir/**\/*` match every file in the folder. */
function coversWholeDir(glob: string, dir: string): boolean {
  return glob === `${dir}/**` || glob === `${dir}/**/*`;
}

/**
 * Clean up one glob for routing: strip `./` and a leading `/`; reject negated
 * globs and `..` segments, which no folder layout can express.
 */
function sanitizeGlob(glob: string, template: string, report?: Reporter): string | undefined {
  if (glob.startsWith("!")) {
    report?.({
      code: "agents-md-glob",
      message: `instruction "${template}": negated glob "${glob}" can't be expressed in AGENTS.md; ignoring it`,
      detail: { template, glob, reason: "negated" },
    });
    return undefined;
  }
  let clean = glob;
  while (clean.startsWith("./")) clean = clean.slice(2);
  while (clean.startsWith("/")) clean = clean.slice(1);
  if (clean.split("/").includes("..")) {
    report?.({
      code: "agents-md-glob",
      message: `instruction "${template}": glob "${glob}" points outside the project; ignoring it`,
      detail: { template, glob, reason: "parent-segment" },
    });
    return undefined;
  }
  return clean;
}

/** Decide where an instruction applies, from its frontmatter. */
export function classify(
  name: string,
  frontmatter: UniversalFrontmatter,
  report?: Reporter,
): Route {
  if (frontmatter.alwaysApply) return { kind: "always" };

  const globs = normalizeGlobs(frontmatter.globs)
    .map((glob) => sanitizeGlob(glob, name, report))
    .filter((glob): glob is string => glob !== undefined);
  if (globs.length === 0) return { kind: "always" };

  const byDir = new Map<string, string[]>();
  const residual: string[] = [];
  for (const glob of globs) {
    const dir = globRootDir(glob);
    if (dir === null) {
      residual.push(glob);
      continue;
    }
    const list = byDir.get(dir) ?? [];
    list.push(glob);
    byDir.set(dir, list);
  }
  if (byDir.size === 0) return { kind: "pattern", globs: residual };

  const scopes: DirScope[] = [...byDir]
    .map(([dir, dirGlobs]) => ({
      dir,
      globs: dirGlobs,
      whole: dirGlobs.some((glob) => coversWholeDir(glob, dir)),
    }))
    .sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));

  // A folder inside another folder this template already fully covers adds
  // nothing but a second copy wherever both files load.
  const dirs = scopes.filter(
    (scope) =>
      !scopes.some(
        (other) => other !== scope && other.whole && scope.dir.startsWith(`${other.dir}/`),
      ),
  );
  return { kind: "dirs", dirs, residual };
}
