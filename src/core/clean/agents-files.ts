import { LEGACY_CODEX_OVERRIDE } from "../agents-md/index.js";
import { AGENTS_MD } from "../agents-md/index.js";
import { findFilesByName } from "../scan-files.js";

/** The folders uac reads from in a templates dir; files under them are inputs, never outputs. */
const TEMPLATE_INPUT_DIRS = ["instructions", "skills", "agents", "hooks", "mcp", "docs"];

/**
 * Every AGENTS.md (root and nested) and legacy AGENTS.override.md under
 * `root`, minus template inputs (a skill may ship either as an extra file).
 * Generated AGENTS.md files can sit anywhere a folder-scoped instruction
 * points — including a templates dir itself — so only its input folders are
 * skipped.
 *
 * @param templateDirs templates dirs as root-relative POSIX paths ("" or "." for the root)
 */
export async function findAgentsFiles(
  root: string,
  templateDirs: string[],
): Promise<{ agentsMd: string[]; overrides: string[] }> {
  const inputPrefixes = templateDirs.flatMap((dir) => {
    const base = dir === "." || dir === "" ? "" : `${dir}/`;
    return TEMPLATE_INPUT_DIRS.map((sub) => `${base}${sub}/`);
  });
  const isInput = (rel: string) => inputPrefixes.some((prefix) => rel.startsWith(prefix));

  const [agentsMd, overrides] = await Promise.all([
    findFilesByName(root, AGENTS_MD),
    findFilesByName(root, LEGACY_CODEX_OVERRIDE),
  ]);
  return {
    agentsMd: agentsMd.filter((rel) => !isInput(rel)),
    overrides: overrides.filter((rel) => !isInput(rel)),
  };
}
