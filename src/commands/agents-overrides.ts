import { consola } from "consola";
import { removeAgentsOverrideFiles } from "../core/clean/agents-overrides.js";
import { canPrompt, confirmAction } from "./interactive.js";

/**
 * Ask whether to delete the AGENTS.override.md files the warning above
 * listed. Only in a terminal and never in a dry run; elsewhere the warning
 * stands on its own and nothing is deleted.
 */
export async function offerAgentsOverrideRemoval(
  root: string,
  paths: string[],
  options: { dryRun: boolean },
): Promise<void> {
  if (paths.length === 0 || options.dryRun || !canPrompt()) return;

  const files = paths.length === 1 ? "this file" : `these ${paths.length} files`;
  if (!(await confirmAction(`Delete ${files}?`))) {
    consola.info("Kept. Set agentsMd.keepOverrideFiles: true to stop this warning.");
    return;
  }
  const removed = await removeAgentsOverrideFiles(root, paths);
  consola.success(
    `Deleted ${removed.length} AGENTS.override.md file${removed.length === 1 ? "" : "s"}`,
  );
}
