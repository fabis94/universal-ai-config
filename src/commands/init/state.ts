import { stat } from "node:fs/promises";
import { join } from "node:path";
import { findOverridesFile } from "../../config/config-files.js";
import { loadOverrides, loadProjectConfig } from "../../config/loader.js";
import { findConfigFile } from "../../core/find-project-root.js";
import { gitignoreBlockState, type GitignoreBlockState } from "../../seed-types/gitignore/index.js";
import {
  metaInstructionsDrift,
  readSeedStamp,
  type SeedDrift,
} from "../../seed-types/meta-instructions/state.js";
import type { ResolvedConfig, Target } from "../../types.js";

/** Everything setup decides from, detected once before anything is written. */
export interface SetupState {
  root: string;
  /** The project config as written (defaults when there's no config file yet) */
  config: ResolvedConfig;
  /** The existing `universal-ai-config.config.*` file name */
  configFile: string | undefined;
  /** No templates dir yet: setup does the full first-time work */
  firstTime: boolean;
  overrides:
    | {
        file: string;
        /** Keys the overrides file sets */
        keys: string[];
        targets: Target[] | undefined;
      }
    | undefined;
  gitignore: GitignoreBlockState;
  /** uac version that last seeded the meta-instructions */
  stamp: string | undefined;
  drift: SeedDrift;
}

async function isDirectory(path: string): Promise<boolean> {
  return (await stat(path).catch(() => undefined))?.isDirectory() ?? false;
}

export async function detectSetupState(root: string): Promise<SetupState> {
  const config = await loadProjectConfig({ root });
  const overridesFile = await findOverridesFile(root);
  const overrides = overridesFile ? ((await loadOverrides(root)) ?? {}) : undefined;

  return {
    root,
    config,
    configFile: findConfigFile(root),
    firstTime: !(await isDirectory(join(root, config.templatesDir))),
    overrides:
      overridesFile && overrides
        ? { file: overridesFile, keys: Object.keys(overrides), targets: overrides.targets }
        : undefined,
    gitignore: await gitignoreBlockState(root, config),
    stamp: await readSeedStamp(root, config.templatesDir),
    drift: await metaInstructionsDrift(root, config),
  };
}
