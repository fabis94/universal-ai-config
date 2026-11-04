import { describe, expect, it } from "vitest";
import { buildPlan } from "../../../src/core/plan/build-plan.js";
import type { ForeignRead, TargetDefinition } from "../../../src/targets/define-target.js";
import type { ResolvedConfig, Target, TemplateType } from "../../../src/types.js";

const ALL_TYPES: TemplateType[] = ["instructions", "skills", "agents", "hooks", "mcp"];

function config(
  targets: Target[],
  agentsMd: ResolvedConfig["agentsMd"] = { variation: "nested", indexDir: ".agents/x" },
  types: TemplateType[] = ALL_TYPES,
): Pick<ResolvedConfig, "targets" | "types" | "agentsMd"> {
  return { targets, types, agentsMd };
}

describe("buildPlan with the real targets — instructions", () => {
  it("leaves every target on its own instructions without codex or enable", () => {
    const plan = buildPlan(config(["claude", "copilot", "cursor"]));
    expect(plan.agentsMd).toBeUndefined();
    expect(plan.servedBy.filter((s) => s.type === "instructions")).toEqual([]);
  });

  it("forces AGENTS.md with codex, viewed by codex, read by every reader in the run", () => {
    const plan = buildPlan(config(["claude", "codex", "cursor"]));
    expect(plan.agentsMd).toMatchObject({
      view: "codex",
      consumers: ["claude", "codex", "cursor"],
      forced: true,
    });
    expect(
      plan.servedBy.filter((s) => s.type === "instructions").map((s) => [s.target, s.by]),
    ).toEqual([
      ["claude", "agentsMd"],
      ["cursor", "agentsMd"],
    ]);
    expect(plan.consumersOf("claude", "instructions")).toEqual(["claude", "codex", "cursor"]);
  });

  it("generates AGENTS.md without codex when enable is true, viewed by the first reader", () => {
    const plan = buildPlan(
      config(["cursor", "claude"], { enable: true, variation: "index", indexDir: "x" }),
    );
    expect(plan.agentsMd).toEqual({
      variation: "index",
      indexDir: "x",
      view: "cursor",
      consumers: ["cursor", "claude"],
      forced: false,
    });
  });

  it("generates nothing for instructions when the type isn't in the run", () => {
    const plan = buildPlan(config(["claude", "codex"], undefined, ["skills"]));
    expect(plan.agentsMd).toBeUndefined();
    expect(plan.servedBy).toEqual([]);
  });

  it("plans from the run's targets only (a -t subset)", () => {
    const plan = buildPlan(config(["copilot"]));
    expect(plan.agentsMd).toBeUndefined();
    expect(plan.servedBy).toEqual([]);
    expect(plan.consumersOf("copilot", "mcp")).toEqual(["copilot"]);
  });
});

describe("buildPlan policy (synthetic targets)", () => {
  const read = (from: Target, reconcile: ForeignRead["reconcile"]): ForeignRead => ({
    from,
    reconcile,
    loses: `loses to ${from}`,
  });
  const def = (
    name: Target,
    reads: TargetDefinition["reads"] = {},
    supportedTypes: TemplateType[] = ["hooks", "mcp", "skills"],
  ): TargetDefinition => ({ name, outputDir: `.${name}`, supportedTypes, reads });

  it("yields to a loads-both or same-file source that is in the run", () => {
    const registry = {
      claude: def("claude"),
      copilot: def("copilot", {
        hooks: [read("claude", "loads-both")],
        mcp: [read("claude", "same-file")],
        skills: [read("claude", "prefers-own")],
      }),
    };
    const plan = buildPlan(config(["claude", "copilot"]), registry);
    expect(plan.servedBy.map((s) => [s.target, s.type, s.by, s.reconcile])).toEqual([
      ["copilot", "hooks", "claude", "loads-both"],
      ["copilot", "mcp", "claude", "same-file"],
    ]);
    expect(plan.consumersOf("claude", "mcp")).toEqual(["claude", "copilot"]);
    expect(plan.consumersOf("claude", "skills")).toEqual(["claude"]);
  });

  it("doesn't yield when the source isn't in the run or doesn't support the type", () => {
    const registry = {
      claude: def("claude", {}, ["skills"]),
      copilot: def("copilot", { hooks: [read("claude", "loads-both")] }),
    };
    expect(buildPlan(config(["copilot"]), registry).servedBy).toEqual([]);
    expect(buildPlan(config(["claude", "copilot"]), registry).servedBy).toEqual([]);
  });

  it("records dedupes-identical reads as duplicate-run checks, keeping both outputs", () => {
    const registry = {
      claude: def("claude"),
      cursor: def("cursor", {
        hooks: [{ ...read("claude", "dedupes-identical"), events: ["preToolUse", "stop"] }],
      }),
    };
    const plan = buildPlan(config(["claude", "cursor"]), registry);
    expect(plan.servedBy).toEqual([]);
    expect(plan.duplicateRunChecks).toEqual([
      { target: "cursor", against: "claude", events: ["preToolUse", "stop"] },
    ]);
  });

  it("resolves a mutual read without a cycle: the later target yields", () => {
    const registry = {
      claude: def("claude", { mcp: [read("copilot", "same-file")] }),
      copilot: def("copilot", { mcp: [read("claude", "same-file")] }),
    };
    const plan = buildPlan(config(["claude", "copilot"]), registry);
    expect(plan.servedBy.map((s) => [s.target, s.by])).toEqual([["copilot", "claude"]]);
  });

  it("never chains: a source that yields isn't a source", () => {
    const registry = {
      claude: def("claude", { mcp: [read("cursor", "same-file")] }),
      copilot: def("copilot", { mcp: [read("claude", "same-file")] }),
      cursor: def("cursor"),
    };
    const plan = buildPlan(config(["claude", "copilot", "cursor"]), registry);
    expect(plan.servedBy.map((s) => [s.target, s.by])).toEqual([["claude", "cursor"]]);
  });
});
