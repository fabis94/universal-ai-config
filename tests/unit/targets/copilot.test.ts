import { describe, it, expect } from "vitest";
import copilot from "../../../src/targets/copilot/index.js";
import type { UniversalFrontmatter } from "../../../src/types.js";

describe("copilot target", () => {
  it("has correct name and output dir", () => {
    expect(copilot.name).toBe("copilot");
    expect(copilot.outputDir).toBe(".github");
  });

  describe("instructions", () => {
    const config = copilot.instructions!;

    it("maps globs to comma-joined applyTo string", () => {
      const mapper = config.frontmatterMap.globs as Function;
      const result = mapper(["**/*.ts", "**/*.tsx"]);
      expect(result).toEqual({ applyTo: "**/*.ts, **/*.tsx" });
    });

    it("maps single glob to applyTo string", () => {
      const mapper = config.frontmatterMap.globs as Function;
      const result = mapper("**/*.ts");
      expect(result).toEqual({ applyTo: "**/*.ts" });
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
});
