import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/config/defaults.js";
import type { SetupState } from "../../src/commands/init/state.js";
import { setupMenu } from "../../src/commands/init/wizard.js";
import { UAC_VERSION } from "../../src/version.js";

/** A project where nothing is due. */
function state(over: Partial<SetupState> = {}): SetupState {
  return {
    root: "/project",
    config: DEFAULT_CONFIG,
    configFile: "universal-ai-config.config.ts",
    firstTime: false,
    overrides: { file: "universal-ai-config.overrides.ts", keys: ["targets"], targets: ["claude"] },
    gitignore: { status: "current" },
    stamp: UAC_VERSION,
    drift: { missing: 0, differ: 0 },
    ...over,
  };
}

function item(s: SetupState, value: string) {
  const { choices, initial } = setupMenu(s);
  const choice = choices.find((c) => c.value === value);
  return {
    hint: choice?.hint,
    disabled: choice?.disabled ?? false,
    preselected: initial.includes(value as never),
  };
}

describe("setup menu: each item is preselected exactly when it would change something", () => {
  it("nothing is preselected when nothing is due", () => {
    expect(setupMenu(state()).initial).toEqual([]);
    expect(item(state(), "examples")).toEqual({
      hint: "one of each type, to copy from",
      disabled: false,
      preselected: false,
    });
  });

  describe("coding agents", () => {
    it("no overrides file: preselected, says you're generating for all", () => {
      expect(item(state({ overrides: undefined }), "agents")).toEqual({
        hint: "not set — generating for all 4; pick just yours for best results",
        disabled: false,
        preselected: true,
      });
    });

    it("an overrides file without targets counts as not set", () => {
      const overrides = {
        file: "universal-ai-config.overrides.ts",
        keys: ["variables"],
        targets: undefined,
      };
      expect(item(state({ overrides }), "agents").preselected).toBe(true);
    });

    it("one agent: names it", () => {
      expect(item(state(), "agents")).toMatchObject({
        hint: "currently: Claude Code",
        preselected: false,
      });
    });

    it("several agents: suggests one", () => {
      const overrides = {
        file: "universal-ai-config.overrides.ts",
        keys: ["targets"],
        targets: ["claude" as const, "cursor" as const],
      };
      expect(item(state({ overrides }), "agents").hint).toBe(
        "currently: Claude Code, Cursor — one works best",
      );
    });
  });

  describe("meta-instructions", () => {
    it("stamp older than uac: preselected", () => {
      expect(item(state({ stamp: "0.9.0" }), "meta")).toEqual({
        hint: `seeded by uac 0.9.0, you have ${UAC_VERSION} — overwrites edits to them`,
        disabled: false,
        preselected: true,
      });
    });

    it("no stamp and files missing or different: preselected", () => {
      const s = state({ stamp: undefined, drift: { missing: 1, differ: 2 } });
      expect(item(s, "meta")).toMatchObject({
        hint: "2 out of date, 1 missing — overwrites edits to them",
        preselected: true,
      });
    });

    it("no stamp and every file matches: up to date", () => {
      expect(item(state({ stamp: undefined }), "meta")).toMatchObject({
        hint: "up to date",
        preselected: false,
      });
    });

    it("stamp equals uac: up to date, even if files were edited", () => {
      const s = state({ drift: { missing: 0, differ: 3 } });
      expect(item(s, "meta")).toMatchObject({ hint: "up to date", preselected: false });
    });

    it("stamp newer than uac: disabled", () => {
      expect(item(state({ stamp: "999.0.0" }), "meta")).toEqual({
        hint: "seeded by newer uac 999.0.0 — update uac first",
        disabled: true,
        preselected: false,
      });
    });
  });

  describe(".gitignore block", () => {
    it("missing: preselected", () => {
      expect(item(state({ gitignore: { status: "missing" } }), "gitignore")).toMatchObject({
        hint: "missing — keeps generated files and your overrides file out of git",
        preselected: true,
      });
    });

    it("stale: preselected, counting the changes", () => {
      const gitignore = { status: "stale" as const, added: ["a", "b"], removed: ["c"] };
      expect(item(state({ gitignore }), "gitignore")).toMatchObject({
        hint: "out of date: 2 paths to add, 1 path to remove",
        preselected: true,
      });
    });

    it("current: up to date", () => {
      expect(item(state(), "gitignore")).toMatchObject({ hint: "up to date", preselected: false });
    });
  });
});
