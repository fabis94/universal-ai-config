import { readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Target } from "../types.js";

/** The name `uac setup` writes. The loader also reads other extensions and `.overrides.config.*`. */
export const OVERRIDES_FILE = "universal-ai-config.overrides.ts";
export const CONFIG_FILE = "universal-ai-config.config.ts";

const OVERRIDES_PREFIX = "universal-ai-config.overrides.";

/** The overrides file in `root`, any extension or spelling; the documented one first, like the loader. */
export async function findOverridesFile(root: string): Promise<string | undefined> {
  const names = await readdir(root).catch(() => [] as string[]);
  const legacy = (name: string): number => Number(name.startsWith(`${OVERRIDES_PREFIX}config.`));
  return names
    .filter((name) => name.startsWith(OVERRIDES_PREFIX))
    .sort((a, b) => legacy(a) - legacy(b) || a.localeCompare(b))[0];
}

/**
 * A config module with a type-only import: it type-checks where uac is
 * installed and still loads where it isn't (uac run through npx), since
 * type-only imports are erased when the file is loaded.
 */
export function renderConfigFile(comment: string, fields: { targets: Target[] }): string {
  const targets = fields.targets.map((target) => `"${target}"`).join(", ");
  return [
    `// ${comment}`,
    `import type { UserConfig } from "universal-ai-config";`,
    ``,
    `export default {`,
    `  targets: [${targets}],`,
    `} satisfies UserConfig;`,
    ``,
  ].join("\n");
}

/**
 * Write this machine's targets to `universal-ai-config.overrides.ts`. An
 * `existing` overrides file with another name is removed: the loader reads
 * only one, and it might not be the new one.
 */
export async function writeOverridesFile(
  root: string,
  targets: Target[],
  existing?: string,
): Promise<void> {
  const content = renderConfigFile(
    "This machine's uac settings (gitignored). Written by `uac setup`.",
    { targets },
  );
  await writeFile(join(root, OVERRIDES_FILE), content, "utf-8");
  if (existing && existing !== OVERRIDES_FILE) await rm(join(root, existing), { force: true });
}
