import { isAbsolute, relative } from "node:path";
import { toPosixPath } from "../plan/locate.js";
import { findFilesByName } from "../scan-files.js";
import { resolveSourceDir } from "../template-sources.js";

/** The folders uac reads from in a templates dir; files under them are inputs, never outputs. */
const TEMPLATE_INPUT_DIRS = ["instructions", "skills", "agents", "hooks", "mcp", "docs"];

/**
 * The template dirs that sit inside the project, as root-relative POSIX paths
 * ("." for the root itself). Dirs outside the project are never scanned anyway.
 */
export function templateDirsWithin(root: string, dirs: string[]): string[] {
  return dirs.flatMap((dir) => {
    const rel = relative(root, resolveSourceDir(root, dir));
    if (rel === "") return ["."];
    if (rel.startsWith("..") || isAbsolute(rel)) return [];
    return [toPosixPath(rel)];
  });
}

/**
 * Every file named `basename` under `root` (AGENTS.md, AGENTS.override.md),
 * minus template inputs: a skill may ship either as an extra file. Generated
 * AGENTS.md files can sit anywhere a folder-scoped instruction points,
 * including a templates dir itself, so only its input folders are skipped.
 *
 * @param templateDirs templates dirs as root-relative POSIX paths ("." for the root)
 */
export async function findFilesOutsideInputs(
  root: string,
  basename: string,
  templateDirs: string[],
): Promise<string[]> {
  const inputPrefixes = templateDirs.flatMap((dir) => {
    const base = dir === "." || dir === "" ? "" : `${dir}/`;
    return TEMPLATE_INPUT_DIRS.map((sub) => `${base}${sub}/`);
  });
  const found = await findFilesByName(root, basename);
  return found.filter((rel) => !inputPrefixes.some((prefix) => rel.startsWith(prefix)));
}
