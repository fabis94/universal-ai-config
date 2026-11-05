import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ResolvedConfig } from "../../types.js";
import { UAC_VERSION } from "../../version.js";
import { getTemplates } from "./index.js";

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
  /** Seeded files that don't exist */
  missing: number;
  /** Seeded files whose content differs from what this uac would seed (edited or outdated) */
  differ: number;
}

/** Compare the meta-instructions on disk with what this uac version would seed. */
export async function metaInstructionsDrift(
  root: string,
  config: Pick<ResolvedConfig, "templatesDir" | "types">,
): Promise<SeedDrift> {
  const drift: SeedDrift = { missing: 0, differ: 0 };
  for (const template of getTemplates(config.templatesDir, config.types)) {
    let current: string;
    try {
      current = await readFile(join(root, config.templatesDir, template.relativePath), "utf-8");
    } catch {
      drift.missing += 1;
      continue;
    }
    if (current !== template.content) drift.differ += 1;
  }
  return drift;
}
