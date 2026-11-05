import { compareVersions, UAC_VERSION } from "../../version.js";
import { endFlow, selectMany, type Choice } from "../interactive.js";
import { describeBlockChange } from "../setup-hints.js";
import type { SetupState } from "./state.js";
import {
  addExamples,
  agentLabels,
  askToAddExamples,
  offerGenerate,
  pickCodingAgents,
  seedMetaInstructions,
  SetupCancelled,
  stampIfCurrent,
  updateGitignore,
  writeConfig,
} from "./steps.js";

type MenuItem = "agents" | "meta" | "gitignore" | "examples";

const OVERWRITES = "overwrites edits to them";

function agentsItem(state: SetupState): { choice: Choice<MenuItem>; preselect: boolean } {
  const current = state.overrides?.targets;
  let hint = `not set — generating for all ${state.config.targets.length}; pick just yours for best results`;
  if (current && current.length > 0) {
    hint = `currently: ${agentLabels(current)}${current.length > 1 ? " — one works best" : ""}`;
  }
  return {
    choice: { value: "agents", label: "Pick the coding agents you use on this machine", hint },
    preselect: !current || current.length === 0,
  };
}

function metaItem(state: SetupState): { choice: Choice<MenuItem>; preselect: boolean } {
  const label = "Update uac's meta-instructions";
  const { stamp, drift } = state;
  if (stamp) {
    const order = compareVersions(stamp, UAC_VERSION);
    if (order < 0) {
      return {
        choice: {
          value: "meta",
          label,
          hint: `seeded by uac ${stamp}, you have ${UAC_VERSION} — ${OVERWRITES}`,
        },
        preselect: true,
      };
    }
    if (order > 0) {
      return {
        choice: {
          value: "meta",
          label,
          hint: `seeded by newer uac ${stamp} — update uac first`,
          disabled: true,
        },
        preselect: false,
      };
    }
    return { choice: { value: "meta", label, hint: "up to date" }, preselect: false };
  }
  if (drift.missing + drift.differ > 0) {
    const parts = [
      drift.differ > 0 && `${drift.differ} out of date`,
      drift.missing > 0 && `${drift.missing} missing`,
    ].filter(Boolean);
    return {
      choice: { value: "meta", label, hint: `${parts.join(", ")} — ${OVERWRITES}` },
      preselect: true,
    };
  }
  return { choice: { value: "meta", label, hint: "up to date" }, preselect: false };
}

function gitignoreItem(state: SetupState): { choice: Choice<MenuItem>; preselect: boolean } {
  const label = "Update the uac block in .gitignore";
  switch (state.gitignore.status) {
    case "missing":
      return {
        choice: {
          value: "gitignore",
          label,
          hint: "missing — keeps generated files and your overrides file out of git",
        },
        preselect: true,
      };
    case "stale":
      return {
        choice: {
          value: "gitignore",
          label,
          hint: `out of date: ${describeBlockChange(state.gitignore)}`,
        },
        preselect: true,
      };
    case "current":
      return { choice: { value: "gitignore", label, hint: "up to date" }, preselect: false };
  }
}

/** The existing-project menu: each item preselected exactly when running it would change something. */
export function setupMenu(state: SetupState): { choices: Choice<MenuItem>[]; initial: MenuItem[] } {
  const items = [
    agentsItem(state),
    metaItem(state),
    gitignoreItem(state),
    {
      choice: {
        value: "examples" as const,
        label: "Add example templates",
        hint: "one of each type, to copy from",
      },
      preselect: false,
    },
  ];
  return {
    choices: items.map((item) => item.choice),
    initial: items.filter((item) => item.preselect).map((item) => item.choice.value),
  };
}

async function firstTimeSetup(state: SetupState): Promise<void> {
  await writeConfig(state);
  await seedMetaInstructions(state);
  await updateGitignore(state);
  const agentsChanged = await pickCodingAgents(state);
  await askToAddExamples(state);
  await offerGenerate(state, agentsChanged);
}

/** Returns false when nothing was picked. */
async function existingProjectSetup(state: SetupState): Promise<boolean> {
  await stampIfCurrent(state);
  const { choices, initial } = setupMenu(state);
  const picked = await selectMany("What should setup do?", choices, { initial });
  if (!picked) throw new SetupCancelled();
  if (picked.length === 0) return false;

  // Questions first, then the work
  const agentsChanged = picked.includes("agents") ? await pickCodingAgents(state) : false;
  if (picked.includes("meta")) await seedMetaInstructions(state);
  if (picked.includes("gitignore")) await updateGitignore(state);
  if (picked.includes("examples")) await addExamples(state);
  await offerGenerate(state, agentsChanged);
  return true;
}

/** The interactive setup, after `startFlow`. Returns false when the user cancelled. */
export async function runWizard(state: SetupState): Promise<boolean> {
  try {
    if (state.firstTime) await firstTimeSetup(state);
    else if (!(await existingProjectSetup(state))) {
      endFlow("Nothing to do");
      return true;
    }
  } catch (error) {
    if (!(error instanceof SetupCancelled)) throw error;
    endFlow("Setup cancelled", { cancelled: true });
    return false;
  }
  endFlow("Done");
  return true;
}
