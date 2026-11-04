import { consola } from "consola";
import { loadProjectConfig } from "../config/loader.js";
import { cleanTargetFiles } from "../core/clean/index.js";
import type { Target, TemplateType } from "../types.js";

interface RunCleanOptions {
  root: string;
  /** CLI `--target` selection: the set to clean. When omitted every registered target is cleaned. */
  targets?: Target[];
  /** CLI `--type` selection. When omitted every type is cleaned. */
  types?: TemplateType[];
  configPath?: string;
  verbose?: boolean;
  dryRun?: boolean;
}

/**
 * Shared implementation behind `uac clean` and `uac generate --clean`.
 *
 * Loads config for `outputDirs` / `preserveOnClean` / `templatesDir` /
 * `agentsMd` but deliberately does NOT scope targets to `config.targets` —
 * cleaning every registered target is what removes stale output for a target
 * you've since dropped from your config. Narrow it with `--target`.
 */
export async function runClean(options: RunCleanOptions): Promise<string[]> {
  const { root, targets, types, configPath, verbose, dryRun } = options;
  const config = await loadProjectConfig({ root, configPath });

  const preserved: string[] = [];
  const cleaned = await cleanTargetFiles(root, targets, types, {
    dryRun,
    outputDirs: config.outputDirs,
    preserveOnClean: config.preserveOnClean,
    templatesDir: config.templatesDir,
    additionalTemplateDirs: config.additionalTemplateDirs,
    agentsMd: config.agentsMd,
    onPreserve: (path) => {
      if (!preserved.includes(path)) preserved.push(path);
    },
  });

  const verb = dryRun ? "Would clean" : "Cleaned";
  if (verbose) {
    for (const path of cleaned) consola.info(`${verb} ${path}`);
    for (const path of preserved.sort()) consola.info(`Preserved ${path}`);
    return cleaned;
  }

  if (cleaned.length > 0) consola.info(`${verb} ${cleaned.length} existing path(s)`);
  if (preserved.length > 0) {
    consola.info(`Preserved ${preserved.length} path(s) via \`preserveOnClean\`:`);
    for (const path of preserved.sort()) consola.log(`  ${path}`);
  }
  return cleaned;
}
