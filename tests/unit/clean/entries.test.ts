import { describe, expect, it } from "vitest";
import { ownedEntries } from "../../../src/core/clean/entries.js";
import { legacyEntries } from "../../../src/core/clean/legacy.js";
import { DEFAULT_CONFIG } from "../../../src/config/defaults.js";
import { createLocator } from "../../../src/core/plan/locate.js";

const locator = createLocator(DEFAULT_CONFIG);
const describeEntries = (target: "claude" | "copilot" | "cursor" | "codex") =>
  ownedEntries(target, locator).map((e) =>
    e.kind === "key" ? `${e.type}: ${e.path} [${e.key}]` : `${e.type}: ${e.path}`,
  );

describe("clean entries derived from target definitions", () => {
  it("claude", () => {
    expect(describeEntries("claude")).toEqual([
      "instructions: .claude/rules",
      "skills: .claude/skills",
      "agents: .claude/agents",
      "hooks: .claude/settings.json [hooks]",
      "mcp: .mcp.json",
    ]);
  });

  it("copilot owns only its own hooks file, not the whole .github/hooks folder", () => {
    expect(describeEntries("copilot")).toEqual([
      "instructions: .github/copilot-instructions.md",
      "instructions: .github/instructions",
      "skills: .github/skills",
      "agents: .github/agents",
      "hooks: .github/hooks/hooks.json",
      "mcp: .mcp.json",
    ]);
    expect(legacyEntries("copilot").map((e) => e.path)).toEqual([".vscode/mcp.json"]);
  });

  it("cursor", () => {
    expect(describeEntries("cursor")).toEqual([
      "instructions: .cursor/rules",
      "skills: .cursor/skills",
      "hooks: .cursor/hooks.json",
      "mcp: .cursor/mcp.json",
    ]);
  });

  it("codex (AGENTS.md files are found by a scan, not listed)", () => {
    expect(describeEntries("codex")).toEqual([
      "skills: .agents/skills",
      "agents: .codex/agents",
      "hooks: .codex/hooks.json",
      "mcp: .codex/config.toml [mcp_servers]",
    ]);
  });

  it("follows outputDirs", () => {
    const custom = createLocator({
      ...DEFAULT_CONFIG,
      outputDirs: { ...DEFAULT_CONFIG.outputDirs, claude: ".ai/claude" },
    });
    expect(ownedEntries("claude", custom).map((e) => e.path)).toEqual([
      ".ai/claude/rules",
      ".ai/claude/skills",
      ".ai/claude/agents",
      ".ai/claude/settings.json",
      ".mcp.json",
    ]);
  });
});
