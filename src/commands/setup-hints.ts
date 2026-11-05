import { consola } from "consola";
import pc from "picocolors";
import { loadProjectConfig } from "../config/loader.js";
import { gitignoreBlockState, type GitignoreBlockState } from "../seed-types/gitignore/index.js";
import { metaInstructionsDrift, readSeedStamp } from "../seed-types/meta-instructions/state.js";
import type { ResolvedConfig } from "../types.js";
import { compareVersions, UAC_VERSION } from "../version.js";

function count(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** "2 paths to add, 1 to remove" for a stale `.gitignore` block. */
export function describeBlockChange(
  state: Extract<GitignoreBlockState, { status: "stale" }>,
): string {
  const parts = [
    state.added.length > 0 && count(state.added.length, "path to add", "paths to add"),
    state.removed.length > 0 && count(state.removed.length, "path to remove", "paths to remove"),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "comments changed";
}

/** What `uac setup` would update: one line per reason, empty when nothing is due. */
async function setupHints(root: string, config: ResolvedConfig): Promise<string[]> {
  const hints: string[] = [];
  const setup = pc.cyan("uac setup");

  const stamp = await readSeedStamp(root, config.templatesDir);
  if (stamp && compareVersions(stamp, UAC_VERSION) < 0) {
    hints.push(`Meta-instructions are from uac ${stamp}, you have ${UAC_VERSION} — run ${setup}`);
  } else if (stamp && compareVersions(stamp, UAC_VERSION) > 0) {
    hints.push(`This project was set up with a newer uac (${stamp}) than yours (${UAC_VERSION})`);
  } else if (stamp) {
    // Same uac, but `standards` changed: uac's files are where the other setting puts them
    const { misplaced } = await metaInstructionsDrift(root, config);
    if (misplaced > 0) {
      hints.push(
        `uac's meta-instructions are where \`standards\` no longer puts them (${count(misplaced, "file", "files")} to move) — run ${setup}`,
      );
    }
  }

  const block = await gitignoreBlockState(root, config);
  if (block.status === "stale") {
    hints.push(
      `The uac block in .gitignore is out of date (${describeBlockChange(block)}) — run ${setup}`,
    );
  }
  return hints;
}

/**
 * Print what `uac setup` would update. Uses the config as written, not the
 * run's `--type`, so narrowing one run doesn't make the block look stale.
 */
export async function printSetupHints(root: string, configPath?: string): Promise<void> {
  const config = await loadProjectConfig({ root, configPath });
  for (const hint of await setupHints(root, config)) consola.info(hint);
}
