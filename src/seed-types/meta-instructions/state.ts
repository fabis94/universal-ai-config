import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ResolvedConfig } from "../../types.js";
import { UAC_VERSION } from "../../version.js";
import { currentContent, expectedContent, isPresent, mayWriteSkill } from "./destinations.js";
import { planMetaInstructions } from "./placement.js";

/** Records which uac version last seeded the meta-instructions. Committed with the templates. */
const STAMP_FILE = ".uac-version";

/** The uac version recorded by the last meta-instructions seed, if any. */
export async function readSeedStamp(
  root: string,
  templatesDir: string,
): Promise<string | undefined> {
  try {
    const stamp = (await readFile(join(root, templatesDir, STAMP_FILE), "utf-8")).trim();
    return stamp || undefined;
  } catch {
    return undefined;
  }
}

export async function writeSeedStamp(root: string, templatesDir: string): Promise<void> {
  await mkdir(join(root, templatesDir), { recursive: true });
  await writeFile(join(root, templatesDir, STAMP_FILE), `${UAC_VERSION}\n`, "utf-8");
}

export interface SeedDrift {
  /** Seeded files (or AGENTS.md blocks) that don't exist */
  missing: number;
  /** Seeded files whose content differs from what this uac would seed (edited or outdated) */
  differ: number;
  /**
   * uac's files where the other setting of `standards` puts them — the
   * setting changed since the last seed, so a reseed is due to move them
   */
  misplaced: number;
}

/**
 * Compare the meta-instructions on disk with what this uac version would seed
 * under this config. A same-named skill the project keeps in `.agents/skills`
 * isn't uac's, so it never counts.
 */
export async function metaInstructionsDrift(
  root: string,
  config: ResolvedConfig,
): Promise<SeedDrift> {
  const drift: SeedDrift = { missing: 0, differ: 0, misplaced: 0 };
  const plan = planMetaInstructions(config);
  for (const entry of plan.entries) {
    if (entry.skill && !(await mayWriteSkill(root, entry.skill))) continue;
    const current = await currentContent(root, entry);
    if (current === undefined) drift.missing += 1;
    else if (current !== expectedContent(entry)) drift.differ += 1;
  }
  for (const item of plan.obsolete) {
    if (await isPresent(root, item)) drift.misplaced += 1;
  }
  return drift;
}
