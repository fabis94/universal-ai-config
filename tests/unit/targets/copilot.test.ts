import { describe, it, expect } from "vitest";
import copilot from "../../../src/targets/copilot/index.js";
import type { UniversalFrontmatter, UniversalHookHandler } from "../../../src/types.js";

describe("copilot target", () => {
  it("has correct name and output dir", () => {
    expect(copilot.name).toBe("copilot");
    expect(copilot.outputDir).toBe(".github");
  });

  describe("instructions", () => {
    const config = copilot.instructions!;

    it("maps globs to comma-separated applyTo string", () => {
      const mapper = config.frontmatterMap.globs as Function;
      const result = mapper(["**/*.ts", "**/*.tsx"]);
      expect(result).toEqual({ applyTo: "**/*.ts,**/*.tsx" });
    });

    it("maps single glob to applyTo string", () => {
      const mapper = config.frontmatterMap.globs as Function;
      const result = mapper("**/*.ts");
      expect(result).toEqual({ applyTo: "**/*.ts" });
    });

    it("normalizes comma-separated globs string to applyTo", () => {
      const mapper = config.frontmatterMap.globs as Function;
      const result = mapper("**/*.ts,**/*.tsx");
      expect(result).toEqual({ applyTo: "**/*.ts,**/*.tsx" });
    });

    it("routes alwaysApply templates to copilot-instructions.md", () => {
      const fm: UniversalFrontmatter = { alwaysApply: true };
      expect(config.getOutputPath("my-rule", fm)).toBe("copilot-instructions.md");
    });

    it("routes normal templates to instructions/", () => {
      const fm: UniversalFrontmatter = {};
      expect(config.getOutputPath("my-rule", fm)).toBe("instructions/my-rule.instructions.md");
    });
  });

  describe("skills", () => {
    const config = copilot.skills!;

    it("maps name, description, compatibility, license, and metadata", () => {
      expect(config.frontmatterMap.name).toBe("name");
      expect(config.frontmatterMap.description).toBe("description");
      expect(config.frontmatterMap.compatibility).toBe("compatibility");
      expect(config.frontmatterMap.license).toBe("license");
      expect(config.frontmatterMap.metadata).toBe("metadata");
    });

    it("generates correct output path", () => {
      const fm: UniversalFrontmatter = {};
      expect(config.getOutputPath("test-gen", fm)).toBe("skills/test-gen/SKILL.md");
    });
  });

  describe("agents", () => {
    const config = copilot.agents!;

    it("maps mcpServers to mcp-servers", () => {
      expect(config.frontmatterMap.mcpServers).toBe("mcp-servers");
    });

    it("generates correct output path with .agent.md extension", () => {
      const fm: UniversalFrontmatter = {};
      expect(config.getOutputPath("reviewer", fm)).toBe("agents/reviewer.agent.md");
    });
  });

  describe("hooks", () => {
    const config = copilot.hooks!;

    it("has correct output path and no merge key", () => {
      expect(config.outputPath).toBe("hooks/hooks.json");
      expect(config.mergeKey).toBeUndefined();
    });

    it("maps command to bash field", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [{ command: "test.sh", timeout: 30 }],
      };
      const result = config.transform(hooks) as {
        version: string;
        hooks: Record<string, unknown[]>;
      };
      expect(result.version).toBe("1");
      expect(result.hooks.preToolUse[0]).toEqual({
        type: "command",
        bash: "test.sh",
        timeoutSec: 30,
      });
    });

    it("maps userPromptSubmit to userPromptSubmitted", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        userPromptSubmit: [{ command: "validate.sh" }],
      };
      const result = config.transform(hooks) as { hooks: Record<string, unknown[]> };
      expect(result.hooks).toHaveProperty("userPromptSubmitted");
      expect(result.hooks).not.toHaveProperty("userPromptSubmit");
    });

    it("drops unsupported events", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [{ command: "test.sh" }],
        stop: [{ command: "stop.sh" }],
        subagentStart: [{ command: "agent.sh" }],
      };
      const result = config.transform(hooks) as { hooks: Record<string, unknown[]> };
      expect(result.hooks).toHaveProperty("preToolUse");
      expect(result.hooks).not.toHaveProperty("stop");
      expect(result.hooks).not.toHaveProperty("subagentStart");
    });

    it("drops matcher field", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [{ matcher: "Bash", command: "test.sh" }],
      };
      const result = config.transform(hooks) as { hooks: Record<string, unknown[]> };
      const handler = result.hooks.preToolUse[0] as Record<string, unknown>;
      expect(handler).not.toHaveProperty("matcher");
    });
  });
});
