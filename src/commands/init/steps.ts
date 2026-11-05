import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { consola } from "consola";
import {
  CONFIG_FILE,
  OVERRIDES_FILE,
  renderConfigFile,
  writeOverridesFile,
} from "../../config/config-files.js";
import { writeSeedStamp } from "../../seed-types/meta-instructions/state.js";
import { targets as registry } from "../../targets/index.js";
import type { Target } from "../../types.js";
import { askYesNo, selectMany, selectOne, showNote, type Choice } from "../interactive.js";
import { runGenerate } from "../run-generate.js";
import { runSeed } from "../seed.js";
import type { SetupState } from "./state.js";

/**
 * Each setup step, once: the first-time flow, the existing-project menu and
 * the flag-driven run are different lists of these calls.
 */

/** A prompt was cancelled (Esc, Ctrl+C): setup stops, keeping what's done. */
export class SetupCancelled extends Error {}

const ALL_TARGETS = Object.keys(registry) as Target[];

/** "Claude Code, Cursor" */
export function agentLabels(targets: Target[]): string {
  return targets.map((target) => registry[target]?.label ?? target).join(", ");
}

function answered<T>(answer: T | undefined): T {
  if (answer === undefined) throw new SetupCancelled();
  return answer;
}

/** Create the templates dir, and the config (listing every target) if there's none. */
export async function writeConfig(state: SetupState): Promise<void> {
  await mkdir(join(state.root, state.config.templatesDir), { recursive: true });
  if (state.configFile) return;
  const content = renderConfigFile(
    "Shared uac config. Each developer picks their own coding agents with `uac setup`.",
    { targets: ALL_TARGETS },
  );
  await writeFile(join(state.root, CONFIG_FILE), content, "utf-8");
  consola.success(`Created ${CONFIG_FILE} (all coding agents)`);
}

export async function seedMetaInstructions(state: SetupState): Promise<void> {
  await runSeed("meta-instructions", state.root, state.config, { quiet: true });
}

/** With no stamp and nothing to update, record that the files match this uac. */
export async function stampIfCurrent(state: SetupState): Promise<void> {
  if (state.stamp || state.firstTime) return;
  if (state.drift.missing === 0 && state.drift.differ === 0) {
    await writeSeedStamp(state.root, state.config.templatesDir);
  }
}

export async function updateGitignore(state: SetupState): Promise<void> {
  await runSeed("gitignore", state.root, state.config, { quiet: true });
}

export async function addExamples(state: SetupState): Promise<void> {
  await runSeed("examples", state.root, state.config, { quiet: true });
}

export async function askToAddExamples(state: SetupState): Promise<void> {
  const add = answered(
    await askYesNo("Add example templates? (one of each type, to copy from)", false),
  );
  if (add) await addExamples(state);
}

export async function saveCodingAgents(state: SetupState, picked: Target[]): Promise<void> {
  await writeOverridesFile(state.root, picked, state.overrides?.file);
  consola.success(`Saved ${agentLabels(picked)} to ${OVERRIDES_FILE}`);
}

function codingAgentChoices(): Choice<Target>[] {
  return ALL_TARGETS.map((name) => {
    const target = registry[name];
    const outputs = [`${target?.outputDir ?? name}/`];
    if (target?.instructions === "agentsMd") outputs.push("AGENTS.md");
    return { value: name, label: target?.label ?? name, hint: `${name} · ${outputs.join(", ")}` };
  });
}

/**
 * Ask which coding agents this machine uses and save them. Returns whether
 * the set generated for this machine changed.
 */
export async function pickCodingAgents(state: SetupState): Promise<boolean> {
  const { overrides, config } = state;
  const otherKeys = overrides?.keys.filter((key) => key !== "targets") ?? [];
  if (overrides && otherKeys.length > 0) {
    const replace = answered(
      await askYesNo(
        `Replace ${overrides.file}? Its ${otherKeys.join(", ")} settings will be lost`,
        false,
      ),
    );
    if (!replace) {
      consola.info(`Kept ${overrides.file}. Set \`targets\` in it by hand.`);
      return false;
    }
  }

  showNote(
    "Pick just one if you can. Coding agents read each other's files, so with several " +
      "selected they can load duplicate or conflicting instructions, which wastes context. " +
      `Run \`uac setup\` again when you switch. Saved to ${OVERRIDES_FILE} (gitignored).`,
  );
  const picked = answered(
    await selectMany("Which coding agents do you use on this machine?", codingAgentChoices(), {
      initial: overrides?.targets,
      required: true,
    }),
  );
  await saveCodingAgents(state, picked);
  const before = new Set(config.targets);
  return picked.length !== before.size || picked.some((target) => !before.has(target));
}

/** Offer to generate now; cleaning first is the default when the coding agents changed. */
export async function offerGenerate(state: SetupState, agentsChanged: boolean): Promise<void> {
  const choice = answered(
    await selectOne(
      "Generate now?",
      [
        { value: "generate", label: "Generate" },
        {
          value: "clean",
          label: "Clean, then generate",
          hint: "removes output of agents you dropped",
        },
        { value: "skip", label: "Skip" },
      ],
      agentsChanged ? "clean" : "generate",
    ),
  );
  if (choice !== "skip") await runGenerate({ root: state.root, clean: choice === "clean" });
}
