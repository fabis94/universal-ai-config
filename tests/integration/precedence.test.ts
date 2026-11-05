import { describe, it, expect } from "vitest";
import { join, resolve } from "node:path";
import { generate } from "../../src/core/generate/index.js";
import type { GenerateOptions, ShadowEvent } from "../../src/types.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures/precedence-project");

/** Run generate against the precedence fixture, collecting shadow events. */
async function run(options: Omit<GenerateOptions, "root"> = {}) {
  const shadows: ShadowEvent[] = [];
  const files = await generate({
    root: FIXTURES_DIR,
    ...options,
    onShadowed: (event) => shadows.push(event),
  });
  return { files, shadows };
}

/** Exclude patterns for one target, as inline overrides. */
function excludeFor(target: string, patterns: string[]): GenerateOptions["overrides"] {
  return { exclude: { [target]: patterns, default: [] } };
}

describe("template precedence", () => {
  describe("first mention wins", () => {
    it("main templatesDir beats every additional dir for instructions", async () => {
      const { files } = await run({ targets: ["claude"], types: ["instructions"] });

      const dup = files.find((f) => f.path.includes("dup.md"));
      expect(dup!.content).toContain("dup from LOCAL");
      expect(dup!.content).not.toContain("SHARED");
      expect(dup!.content).not.toContain("VENDOR");
    });

    it("earlier additional dirs beat later ones", async () => {
      // Drop the main copy: shared-templates comes before vendor-templates
      const { files } = await run({
        targets: ["claude"],
        types: ["instructions"],
        overrides: excludeFor("claude", [".universal-ai-config/instructions/dup.md"]),
      });

      const dup = files.find((f) => f.path.includes("dup.md"));
      expect(dup!.content).toContain("dup from SHARED");
    });

    it("main dir wins for agents", async () => {
      const { files } = await run({ targets: ["claude"], types: ["agents"] });

      const agent = files.find((f) => f.path.includes("dup-agent"));
      expect(agent!.content).toContain("agent from LOCAL");
    });

    it("replaces a skill folder wholesale rather than merging its files", async () => {
      const { files } = await run({ targets: ["claude"], types: ["skills"] });

      const skill = files.find((f) => f.path.endsWith("dup-skill/SKILL.md"));
      expect(skill!.content).toContain("skill from LOCAL");

      // The winner's extra files ship; the loser's never do
      expect(files.some((f) => f.path.endsWith("dup-skill/local-only-extra.md"))).toBe(true);
      expect(files.some((f) => f.path.endsWith("dup-skill/shared-only-extra.md"))).toBe(false);
    });

    it("a skill folder without SKILL.md does not claim the name", async () => {
      const { files } = await run({ targets: ["claude"], types: ["skills"] });

      const hollow = files.find((f) => f.path.endsWith("hollow/SKILL.md"));
      expect(hollow).toBeDefined();
      expect(hollow!.content).toContain("hollow from SHARED");
    });

    it("templates unique to one dir are unaffected", async () => {
      const { files } = await run({ targets: ["claude"], types: ["instructions"] });

      expect(files.some((f) => f.path.includes("only-local"))).toBe(true);
      expect(files.some((f) => f.path.includes("only-shared"))).toBe(true);
    });
  });

  describe("hooks", () => {
    it("a same-named hooks file shadows the whole file, handlers included", async () => {
      const { files } = await run({ targets: ["claude"], types: ["hooks"] });

      const hooks = files.find((f) => f.type === "hooks");
      expect(hooks!.content).not.toContain("never-emitted");
    });

    it("differently-named hook files still merge", async () => {
      const { files } = await run({ targets: ["claude"], types: ["hooks"] });

      const hooks = files.find((f) => f.type === "hooks");
      expect(hooks!.content).toContain("echo local-only");
      expect(hooks!.content).toContain("echo shared-only");
    });

    it("drops a handler a higher-precedence file already declared identically", async () => {
      const { files } = await run({ targets: ["claude"], types: ["hooks"] });

      const hooks = files.find((f) => f.type === "hooks");
      const occurrences = hooks!.content.split("echo dup-handler").length - 1;
      expect(occurrences).toBe(1);
    });

    it("compares handlers after per-target resolution", async () => {
      // The shared handler resolves to the local one's command for claude only
      const claude = await run({ targets: ["claude"], types: ["hooks"] });
      const claudeHooks = claude.files.find((f) => f.type === "hooks");
      expect(claudeHooks!.content.split("echo per-target-dup").length - 1).toBe(1);
      expect(claudeHooks!.content).not.toContain("echo per-target-unique");

      const cursor = await run({ targets: ["cursor"], types: ["hooks"] });
      const cursorHooks = cursor.files.find((f) => f.type === "hooks");
      expect(cursorHooks!.content).toContain("echo per-target-dup");
      expect(cursorHooks!.content).toContain("echo per-target-unique");
    });
  });

  describe("mcp", () => {
    it("the first file to declare a server name wins", async () => {
      const { files } = await run({ targets: ["claude"], types: ["mcp"] });

      const mcp = files.find((f) => f.type === "mcp");
      const parsed = JSON.parse(mcp!.content);
      expect(parsed.mcpServers["dup-server"].command).toBe("local-cmd");
    });

    it("servers unique to a lower-precedence file still merge in", async () => {
      const { files } = await run({ targets: ["claude"], types: ["mcp"] });

      const parsed = JSON.parse(files.find((f) => f.type === "mcp")!.content);
      expect(Object.keys(parsed.mcpServers).sort()).toEqual([
        "dup-server",
        "local-server",
        "same-dir-server",
        "shared-server",
      ]);
      expect(parsed.mcpServers["never-emitted"]).toBeUndefined();
    });

    it("resolves a collision between two files in the same dir, alphabetically", async () => {
      // aardvark.json and servers.json both declare "same-dir-server". Neither
      // file outranks the other by source dir, so the order has to come from
      // somewhere stable — readdir order is filesystem-dependent.
      const { files, shadows } = await run({ targets: ["claude"], types: ["mcp"] });

      const parsed = JSON.parse(files.find((f) => f.type === "mcp")!.content);
      expect(parsed.mcpServers["same-dir-server"].command).toBe("from-aardvark");

      expect(shadows).toContainEqual(
        expect.objectContaining({
          scope: "server",
          name: "same-dir-server",
          losingPath: ".universal-ai-config/mcp/servers.json",
          winningPath: ".universal-ai-config/mcp/aardvark.json",
          losingSource: ".universal-ai-config",
          winningSource: ".universal-ai-config",
        }),
      );
    });

    it("drops inputs for copilot (portable .mcp.json has none), with a warning", async () => {
      const { files } = await run({ targets: ["copilot"], types: ["mcp"] });

      const parsed = JSON.parse(files.find((f) => f.type === "mcp")!.content);
      expect(parsed).not.toHaveProperty("inputs");
    });

    it("excluding the winning file promotes the next one", async () => {
      const { files } = await run({
        targets: ["claude"],
        types: ["mcp"],
        overrides: excludeFor("claude", [".universal-ai-config/mcp/servers.json"]),
      });

      const parsed = JSON.parse(files.find((f) => f.type === "mcp")!.content);
      // The main file is gone, so shared-templates' same-named file is used...
      expect(parsed.mcpServers["never-emitted"]).toBeDefined();
      // ...and its shared-servers.json now owns the contested name
      expect(parsed.mcpServers["dup-server"].command).toBe("shared-cmd");
      expect(parsed.mcpServers["local-server"]).toBeUndefined();
    });
  });

  describe("inputCount", () => {
    it("counts only files that contributed something that survived", async () => {
      const { files } = await run({ targets: ["claude"], types: ["mcp"] });

      // aardvark.json, servers.json and shared-servers.json each contribute a
      // surviving server; vendor.json declares only a shadowed name, and
      // shared-templates/mcp/servers.json lost at the file level.
      expect(files.find((f) => f.type === "mcp")!.inputCount).toBe(3);
    });

    it("still counts a file whose duplicate handlers were dropped", async () => {
      const { files } = await run({ targets: ["claude"], types: ["hooks"] });

      // extra.json loses two handlers to dedup but keeps "echo shared-only"
      expect(files.find((f) => f.type === "hooks")!.inputCount).toBe(2);
    });
  });

  describe("unshadowing via exclude", () => {
    it("excluding the winner promotes the runner-up", async () => {
      const { files } = await run({
        targets: ["claude"],
        types: ["instructions"],
        overrides: excludeFor("claude", [".universal-ai-config/instructions/dup.md"]),
      });

      expect(files.find((f) => f.path.includes("dup.md"))!.content).toContain("dup from SHARED");
    });

    it("chains through every candidate", async () => {
      const { files } = await run({
        targets: ["claude"],
        types: ["instructions"],
        overrides: excludeFor("claude", [
          ".universal-ai-config/instructions/dup.md",
          "shared-templates/instructions/dup.md",
        ]),
      });

      expect(files.find((f) => f.path.includes("dup.md"))!.content).toContain("dup from VENDOR");
    });

    it("an unqualified pattern still drops every candidate", async () => {
      const { files } = await run({
        targets: ["claude"],
        types: ["instructions"],
        overrides: excludeFor("claude", ["instructions/dup.md"]),
      });

      expect(files.some((f) => f.path.includes("dup.md"))).toBe(false);
    });

    it("resolves per target, so targets can disagree", async () => {
      const { files } = await run({
        targets: ["claude", "cursor"],
        types: ["instructions"],
        overrides: excludeFor("claude", [".universal-ai-config/instructions/dup.md"]),
      });

      const claude = files.find((f) => f.target === "claude" && f.path.includes("dup"));
      const cursor = files.find((f) => f.target === "cursor" && f.path.includes("dup"));
      expect(claude!.content).toContain("dup from SHARED");
      expect(cursor!.content).toContain("dup from LOCAL");
    });

    it("accepts any spelling of the same directory", async () => {
      const spellings = [
        ".universal-ai-config/instructions/dup.md",
        "./.universal-ai-config/instructions/dup.md",
        `${resolve(FIXTURES_DIR, ".universal-ai-config")}/instructions/dup.md`,
        ".universal-ai-*/instructions/dup.md",
        ".universal-ai-config/**",
      ];

      for (const pattern of spellings) {
        const { files } = await run({
          targets: ["claude"],
          types: ["instructions"],
          overrides: excludeFor("claude", [pattern]),
        });
        const dup = files.find((f) => f.path.includes("dup.md"));
        expect(dup, `pattern ${pattern} should promote the shared copy`).toBeDefined();
        expect(dup!.content, `pattern ${pattern}`).toContain("dup from SHARED");
      }
    });

    it("matches dot-leading source dirs through a wildcard", async () => {
      const { files } = await run({
        targets: ["claude"],
        types: ["instructions"],
        overrides: excludeFor("claude", ["*/instructions/dup.md"]),
      });

      // Every candidate lives under a source dir, so a wildcard prefix kills them all
      expect(files.some((f) => f.path.includes("dup.md"))).toBe(false);
    });
  });

  describe("onShadowed", () => {
    it("reports each losing candidate with both paths", async () => {
      const { shadows } = await run({ targets: ["claude"], types: ["instructions"] });

      const dup = shadows.filter((e) => e.name === "dup");
      expect(dup).toHaveLength(2);
      expect(dup[0]).toEqual({
        target: "claude",
        type: "instructions",
        scope: "template",
        name: "dup",
        losingPath: "shared-templates/instructions/dup.md",
        winningPath: ".universal-ai-config/instructions/dup.md",
        losingSource: "shared-templates",
        winningSource: ".universal-ai-config",
      });
      expect(dup[1]!.losingPath).toBe("vendor-templates/instructions/dup.md");
      expect(dup[1]!.winningPath).toBe(".universal-ai-config/instructions/dup.md");
    });

    it("reports file, server, input and handler collisions", async () => {
      const { shadows } = await run({ targets: ["copilot"], types: ["hooks", "mcp"] });

      expect(shadows).toContainEqual(
        expect.objectContaining({
          scope: "file",
          type: "mcp",
          name: "servers.json",
          losingPath: "shared-templates/mcp/servers.json",
        }),
      );
      expect(shadows).toContainEqual(
        expect.objectContaining({
          scope: "server",
          name: "dup-server",
          losingPath: "shared-templates/mcp/shared-servers.json",
          winningPath: ".universal-ai-config/mcp/servers.json",
        }),
      );
      expect(shadows).toContainEqual(
        expect.objectContaining({ scope: "input", name: "token", type: "mcp" }),
      );
      expect(shadows).toContainEqual(
        expect.objectContaining({
          scope: "handler",
          type: "hooks",
          name: "preToolUse",
          losingPath: "shared-templates/hooks/extra.json",
          winningPath: ".universal-ai-config/hooks/common.json",
        }),
      );
    });

    it("does not report candidates that exclude removed", async () => {
      const { shadows } = await run({
        targets: ["claude"],
        types: ["instructions"],
        // Only vendor's copy survives, so nothing is shadowed by precedence
        overrides: excludeFor("claude", [
          ".universal-ai-config/instructions/dup.md",
          "shared-templates/instructions/dup.md",
        ]),
      });

      expect(shadows.filter((e) => e.name === "dup")).toHaveLength(0);
    });

    it("stays silent when nothing collides", async () => {
      const { shadows } = await run({
        targets: ["claude"],
        types: ["instructions"],
        overrides: { additionalTemplateDirs: [] },
      });

      expect(shadows).toHaveLength(0);
    });
  });
});
