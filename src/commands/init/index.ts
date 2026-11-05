import { defineCommand } from "citty";
import { consola } from "consola";
import { relative, resolve } from "node:path";
import { findProjectRoot } from "../../core/find-project-root.js";
import type { Target } from "../../types.js";
import { parseTargets } from "../cli-args.js";
import { canPrompt, endFlow, selectOne, startFlow } from "../interactive.js";
import { detectSetupState, type SetupState } from "./state.js";
import {
  addExamples,
  saveCodingAgents,
  seedMetaInstructions,
  stampIfCurrent,
  updateGitignore,
  writeConfig,
} from "./steps.js";
import { runWizard } from "./wizard.js";

interface Flags {
  target?: Target[];
  examples: boolean;
  reseed: boolean;
  force: boolean;
}

/** Setup without prompts: the flags answer every question. */
async function runWithFlags(state: SetupState, flags: Flags): Promise<void> {
  if (state.firstTime) {
    await writeConfig(state);
    await seedMetaInstructions(state);
  } else {
    await stampIfCurrent(state);
    if (flags.reseed) await seedMetaInstructions(state);
  }
  await updateGitignore(state);
  if (flags.examples) await addExamples(state);

  if (flags.target) {
    if (state.overrides && !flags.force) {
      consola.warn(`${state.overrides.file} already exists. Pass --force to replace it.`);
    } else {
      await saveCodingAgents(state, flags.target);
    }
  }
}

/**
 * Where to set up: `--root`, else the current directory. From inside an
 * existing project (a subfolder), the interactive setup asks which one.
 * Returns undefined when that question was cancelled.
 */
async function chooseRoot(explicit: string | undefined, interactive: boolean) {
  if (explicit) return resolve(explicit);
  const cwd = process.cwd();
  const found = findProjectRoot(cwd);
  if (!interactive || !found.walkedUp) return cwd;

  const parent = relative(cwd, found.root) || ".";
  return selectOne(
    `Found a uac project at ${parent}`,
    [
      { value: found.root, label: `Set up this machine for ${parent}` },
      { value: cwd, label: "Create a new uac project here" },
    ],
    found.root,
  );
}

const initCommand = defineCommand({
  meta: {
    name: "init",
    description: "Set up uac for this project or this machine (alias: setup)",
  },
  args: {
    root: {
      type: "string",
      alias: "r",
      description: "Project root (default: cwd)",
    },
    target: {
      type: "string",
      alias: "t",
      description: "Save this machine's coding agents: claude,cursor,…",
    },
    examples: {
      type: "boolean",
      description: "Add example templates",
      default: false,
    },
    reseed: {
      type: "boolean",
      description: "Re-seed meta-instructions (overwrites edits to them)",
      default: false,
    },
    force: {
      type: "boolean",
      description: "Replace an existing overrides file",
      default: false,
    },
    yes: {
      type: "boolean",
      alias: "y",
      description: "Don't prompt; use flags and defaults",
      default: false,
    },
  },
  async run({ args }) {
    const flags: Flags = {
      target: parseTargets(args.target),
      examples: args.examples,
      reseed: args.reseed,
      force: args.force,
    };
    // Any flag that answers a question means a script is running this
    const scripted =
      args.yes || flags.target !== undefined || flags.examples || flags.reseed || flags.force;
    const interactive = canPrompt() && !scripted;

    if (interactive) startFlow("uac setup");
    const root = await chooseRoot(args.root, interactive);
    if (root === undefined) {
      endFlow("Setup cancelled", { cancelled: true });
      process.exitCode = 1;
      return;
    }
    const state = await detectSetupState(root);

    if (interactive) {
      if (!(await runWizard(state))) process.exitCode = 1;
      return;
    }
    await runWithFlags(state, flags);
    consola.success(state.firstTime ? "Initialized uac" : "Setup done");
  },
});

export default initCommand;

/** `uac setup`: the same command, listed once in help (as init's alias). */
export const setupCommand = defineCommand({
  ...initCommand,
  meta: { name: "setup", description: "Set up uac for this project or this machine", hidden: true },
});
