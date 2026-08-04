import { consola } from "consola";
import { loadProjectConfig } from "../config/loader.js";
import { cleanTargetFiles } from "../core/writer.js";
import type { Target, TemplateType } from "../types.js";

interface RunCleanOptions {
  root: string;
  /** CLI `--target` selection. When omitted every registered target is cleaned. */
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
 * Loads config for `outputDirs` / `preserveOnClean` / `templatesDir` but
 * deliberately does NOT scope targets to `config.targets` — cleaning every
 * registered target is what removes stale output for a target you've since
 * dropped from your config. Narrow it with `--target` when you want less.
 */
export async function runClean(options: RunCleanOptions): Promise<string[]> {
  const { root, targets, types, configPath, verbose, dryRun } = options;
  const config = await loadProjectConfig({ root, configPath });

  const preserved: string[] = [];
  const cleaned = await cleanTargetFiles(root, targets, types, {
    verbose,
    dryRun,
    outputDirs: config.outputDirs,
    preserveOnClean: config.preserveOnClean,
    templatesDir: config.templatesDir,
    onPreserve: (path) => {
      if (!preserved.includes(path)) preserved.push(path);
    },
  });

  if (!verbose && cleaned.length > 0) {
    consola.info(`${dryRun ? "Would clean" : "Cleaned"} ${cleaned.length} existing path(s)`);
  }

  // Under --verbose these were already logged line-by-line as they were skipped.
  if (!verbose && preserved.length > 0) {
    consola.info(`Preserved ${preserved.length} path(s) via \`preserveOnClean\`:`);
    for (const path of preserved.sort()) {
      consola.log(`  ${path}`);
    }
  }

  return cleaned;
}
