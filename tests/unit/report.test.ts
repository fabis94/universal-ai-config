import { afterEach, describe, expect, it, vi } from "vitest";
import { consola } from "consola";
import {
  formatFileLine,
  formatTargetSummary,
  printDiagnostics,
} from "../../src/commands/report.js";
import type { Diagnostic } from "../../src/core/diagnostics.js";
import type { GeneratedFile } from "../../src/types.js";

afterEach(() => vi.restoreAllMocks());

const file = (over: Partial<GeneratedFile>): GeneratedFile => ({
  path: "x",
  content: "",
  target: "claude",
  type: "instructions",
  sourcePath: "src",
  ...over,
});

describe("formatTargetSummary", () => {
  it("lists shared files under their readers", () => {
    expect(
      formatTargetSummary([
        file({ path: "AGENTS.md", target: "codex", consumers: ["claude", "codex"] }),
        file({ path: ".claude/skills/a/SKILL.md", type: "skills" }),
        file({ path: ".mcp.json", type: "mcp", consumers: ["claude", "copilot"], inputCount: 2 }),
      ]),
    ).toEqual([
      "shared by claude, codex — 1 instruction",
      "claude — 1 skill",
      "shared by claude, copilot — 1 mcp (2 inputs)",
    ]);
  });
});

describe("formatFileLine", () => {
  it("names the other readers of a shared file", () => {
    expect(
      formatFileLine(file({ path: "AGENTS.md", target: "codex", consumers: ["claude", "codex"] })),
    ).toBe("  AGENTS.md (codex/instructions ← src, read by claude, codex)");
  });
});

describe("printDiagnostics", () => {
  const served = (
    target: "claude" | "copilot",
    type: "hooks" | "instructions",
    by: string,
  ): Diagnostic => ({
    code: "served-by",
    severity: "warn",
    target,
    type,
    message: "m",
    detail: { by: by as "claude", loses: `${target} loses ${type}`, reason: "overlap" },
  });

  function capture(diagnostics: Diagnostic[], verbose = false) {
    const lines: string[] = [];
    for (const level of ["warn", "info", "log"] as const) {
      vi.spyOn(consola, level).mockImplementation((msg: unknown) => {
        lines.push(`${level}: ${String(msg)}`);
      });
    }
    printDiagnostics(diagnostics, { verbose, allTargets: new Set(["claude", "copilot"]) });
    return lines;
  }

  it("groups switch-overs into one warning that leads with the per-machine targets fix", () => {
    const lines = capture([
      served("copilot", "hooks", "claude"),
      served("claude", "instructions", "agentsMd"),
    ]);
    expect(lines[0]).toMatch(
      /^warn: Several targets .* set `targets` in universal-ai-config\.overrides\.ts\./,
    );
    expect(lines.slice(1).join("\n")).toContain(
      "claude and copilot both read claude's hooks — generating only claude's",
    );
    expect(lines.slice(1).join("\n")).toContain("claude read the generated AGENTS.md files");
    expect(lines.at(-1)).toContain("--verbose");
  });

  it("words an agentsMd.enable opt-in without the fewer-targets advice", () => {
    const optIn: Diagnostic = {
      ...served("claude", "instructions", "agentsMd"),
      detail: { by: "agentsMd", loses: "x", reason: "agents-md-enabled" },
    } as Diagnostic;
    const lines = capture([optIn]);
    expect(lines[0]).toBe(
      "warn: agentsMd.enable is on, so these targets use AGENTS.md for instructions:",
    );
    expect(lines.join("\n")).not.toContain("overrides.ts");
  });

  it("lists what each target loses under --verbose", () => {
    const lines = capture([served("copilot", "hooks", "claude")], true);
    expect(lines.join("\n")).toContain("copilot loses: copilot loses hooks");
  });

  it("prints other warnings one by one and counts info", () => {
    const lines = capture([
      {
        code: "missing-doc",
        severity: "warn",
        message: "docPath('x') matched no file",
        detail: { name: "x" },
      },
      {
        code: "shared-divergence",
        severity: "info",
        target: "claude",
        message: "renders differently",
        detail: { view: "codex", reader: "claude", name: "a", kind: "different" },
      },
    ]);
    expect(lines).toEqual([
      "warn: [uac] docPath('x') matched no file",
      "info: 1 instruction(s) render differently for a target that reads the shared AGENTS.md (--verbose to list)",
    ]);
  });
});
