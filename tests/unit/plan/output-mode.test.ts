import { describe, expect, it } from "vitest";
import {
  agentsMdOwners,
  buildPlan,
  type OutputMode,
  type OutputPlan,
} from "../../../src/core/plan/build-plan.js";
import { DEFAULT_CONFIG } from "../../../src/config/defaults.js";
import type { StandardsSetting, Target, TemplateType } from "../../../src/types.js";

const ALL_TARGETS: Target[] = ["claude", "copilot", "cursor", "codex"];
const ALL_TYPES: TemplateType[] = ["instructions", "skills", "agents", "hooks", "mcp"];

/** A mode as one short word, so a whole plan reads as a table. */
function short(mode: OutputMode): string {
  switch (mode.kind) {
    case "agentsMd":
      return mode.served ? "agentsMd(served)" : "agentsMd";
    case "served":
      return `served:${mode.served.by}`;
    case "native":
    case "copy":
      return `${mode.kind}:${mode.standard}`;
    case "off":
      return `off:${mode.reason}`;
    default:
      return mode.kind;
  }
}

function table(plan: OutputPlan, targets: Target[] = ALL_TARGETS) {
  return Object.fromEntries(
    targets.map((target) => [
      target,
      Object.fromEntries(ALL_TYPES.map((type) => [type, short(plan.outputFor(target, type))])),
    ]),
  );
}

function plan(
  targets: Target[],
  standards: StandardsSetting = false,
  types: TemplateType[] = ALL_TYPES,
  agentsMd = DEFAULT_CONFIG.agentsMd,
): OutputPlan {
  return buildPlan({ targets, types, agentsMd, standards });
}

describe("outputFor — template mode (standards: false)", () => {
  it("every target generating alone renders its own output", () => {
    for (const target of ALL_TARGETS) {
      const expected = target === "codex" ? "agentsMd" : "own";
      expect(table(plan([target]), [target])).toEqual({
        [target]: {
          instructions: expected,
          skills: "own",
          agents: "own",
          hooks: "own",
          mcp: "own",
        },
      });
    }
  });

  it("all four: AGENTS.md serves the readers, claude's hooks and .mcp.json serve copilot", () => {
    expect(table(plan(ALL_TARGETS))).toEqual({
      claude: {
        instructions: "agentsMd(served)",
        skills: "own",
        agents: "own",
        hooks: "own",
        mcp: "own",
      },
      copilot: {
        instructions: "agentsMd(served)",
        skills: "own",
        agents: "own",
        hooks: "served:claude",
        mcp: "served:claude",
      },
      cursor: {
        instructions: "agentsMd(served)",
        skills: "own",
        agents: "own",
        hooks: "own",
        mcp: "own",
      },
      codex: { instructions: "agentsMd", skills: "own", agents: "own", hooks: "own", mcp: "own" },
    });
  });

  it("agentsMd.enable switches the readers to AGENTS.md without codex", () => {
    const enabled = plan(["claude", "cursor"], false, ALL_TYPES, {
      ...DEFAULT_CONFIG.agentsMd,
      enable: true,
    });
    expect(short(enabled.outputFor("claude", "instructions"))).toBe("agentsMd(served)");
    expect(short(enabled.outputFor("cursor", "instructions"))).toBe("agentsMd(served)");
  });

  it("says why a target gets nothing", () => {
    const p = plan(["claude"], false, ["skills"]);
    expect(short(p.outputFor("codex", "skills"))).toBe("off:not-in-run");
    expect(short(p.outputFor("claude", "hooks"))).toBe("off:type-off");
    expect(p.sourced.size).toBe(0);
  });
});

describe("outputFor — standards mode", () => {
  it("standards: true — every tool reads AGENTS.md; only claude needs skill copies", () => {
    const p = plan(ALL_TARGETS, true);
    expect(p.agentsMd).toBeUndefined();
    expect([...p.sourced]).toEqual(["instructions", "skills"]);
    expect(table(p)).toEqual({
      claude: {
        instructions: "native:agentsMd",
        skills: "copy:agentSkills",
        agents: "own",
        hooks: "own",
        mcp: "own",
      },
      copilot: {
        instructions: "native:agentsMd",
        skills: "native:agentSkills",
        agents: "own",
        hooks: "served:claude",
        mcp: "served:claude",
      },
      cursor: {
        instructions: "native:agentsMd",
        skills: "native:agentSkills",
        agents: "own",
        hooks: "own",
        mcp: "own",
      },
      codex: {
        instructions: "native:agentsMd",
        skills: "native:agentSkills",
        agents: "own",
        hooks: "own",
        mcp: "own",
      },
    });
  });

  it('"instructions": AGENTS.md is the project\'s, skills stay templates', () => {
    const p = plan(ALL_TARGETS, "instructions");
    expect(p.agentsMd).toBeUndefined();
    expect([...p.sourced]).toEqual(["instructions"]);
    for (const target of ALL_TARGETS) {
      expect(short(p.outputFor(target, "instructions"))).toBe("native:agentsMd");
      expect(short(p.outputFor(target, "skills"))).toBe("own");
    }
  });

  it('"skills": .agents/skills is the project\'s, instructions stay templates (codex forces AGENTS.md)', () => {
    const p = plan(ALL_TARGETS, "skills");
    expect(p.agentsMd).toMatchObject({ view: "codex", forced: true });
    expect([...p.sourced]).toEqual(["skills"]);
    expect(short(p.outputFor("codex", "instructions"))).toBe("agentsMd");
    expect(short(p.outputFor("claude", "instructions"))).toBe("agentsMd(served)");
    expect(short(p.outputFor("claude", "skills"))).toBe("copy:agentSkills");
    for (const target of ["copilot", "cursor", "codex"] as const) {
      expect(short(p.outputFor(target, "skills"))).toBe("native:agentSkills");
    }
  });

  it("a type left out of `types` is never sourced", () => {
    const p = plan(ALL_TARGETS, true, ["instructions", "hooks"]);
    expect([...p.sourced]).toEqual(["instructions"]);
    expect(short(p.outputFor("claude", "skills"))).toBe("off:type-off");
  });

  it("plans the run's targets only", () => {
    const p = plan(["claude"], true);
    expect(short(p.outputFor("claude", "skills"))).toBe("copy:agentSkills");
    expect(short(p.outputFor("codex", "skills"))).toBe("off:not-in-run");
  });

  it("no served-by entries for sourced types", () => {
    const p = plan(ALL_TARGETS, true);
    expect(p.servedBy.map((s) => s.type)).toEqual(["hooks", "mcp"]);
  });
});

describe("agentsMdOwners — who cleans the AGENTS.md files", () => {
  const facts = (standards: StandardsSetting, enable?: boolean) => ({
    agentsMd: { ...DEFAULT_CONFIG.agentsMd, enable },
    standards,
    types: ALL_TYPES,
  });

  it("codex always, the other readers only with agentsMd.enable", () => {
    expect(agentsMdOwners(ALL_TARGETS, facts(false))).toEqual(["codex"]);
    expect(agentsMdOwners(ALL_TARGETS, facts(false, true))).toEqual(ALL_TARGETS);
    expect(agentsMdOwners(["claude"], facts(false))).toEqual([]);
  });

  it("nobody while the project writes its own AGENTS.md files", () => {
    expect(agentsMdOwners(ALL_TARGETS, facts(true))).toEqual([]);
    expect(agentsMdOwners(ALL_TARGETS, facts("instructions", true))).toEqual([]);
    expect(agentsMdOwners(ALL_TARGETS, facts("skills"))).toEqual(["codex"]);
  });
});
