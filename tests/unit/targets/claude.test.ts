import { describe, it, expect } from "vitest";
import claude from "../../../src/targets/claude/index.js";
import type { UniversalFrontmatter } from "../../../src/types.js";

describe("claude target", () => {
  it("has correct name and output dir", () => {
    expect(claude.name).toBe("claude");
    expect(claude.outputDir).toBe(".claude");
  });

  it("supports all three types", () => {
    expect(claude.supportedTypes).toEqual(["instructions", "skills", "agents"]);
  });

  describe("instructions", () => {
    const config = claude.instructions!;

    it("maps description directly", () => {
      const map = config.frontmatterMap.description as string;
      expect(map).toBe("description");
    });

    it("maps globs to paths when not alwaysApply", () => {
      const mapper = config.frontmatterMap.globs as Function;
      const fm: UniversalFrontmatter = { globs: ["**/*.ts"] };
      const result = mapper(["**/*.ts"], fm);
      expect(result).toEqual({ paths: ["**/*.ts"] });
    });

    it("omits paths when alwaysApply is true", () => {
      const mapper = config.frontmatterMap.globs as Function;
      const fm: UniversalFrontmatter = { globs: ["**/*.ts"], alwaysApply: true };
      const result = mapper(["**/*.ts"], fm);
      expect(result).toEqual({});
    });

    it("generates correct output path", () => {
      const fm: UniversalFrontmatter = {};
      expect(config.getOutputPath("my-rule", fm)).toBe("rules/my-rule.md");
    });
  });

  describe("skills", () => {
    const config = claude.skills!;

    it("maps disableAutoInvocation to disable-model-invocation", () => {
      expect(config.frontmatterMap.disableAutoInvocation).toBe("disable-model-invocation");
    });

    it("maps forkContext to context: fork", () => {
      const mapper = config.frontmatterMap.forkContext as Function;
      expect(mapper(true)).toEqual({ context: "fork" });
      expect(mapper(false)).toEqual({});
    });

    it("generates correct output path", () => {
      const fm: UniversalFrontmatter = {};
      expect(config.getOutputPath("test-gen", fm)).toBe("skills/test-gen/SKILL.md");
    });
  });

  describe("agents", () => {
    const config = claude.agents!;

    it("maps agent fields correctly", () => {
      expect(config.frontmatterMap.model).toBe("model");
      expect(config.frontmatterMap.tools).toBe("tools");
      expect(config.frontmatterMap.permissionMode).toBe("permissionMode");
    });

    it("generates correct output path", () => {
      const fm: UniversalFrontmatter = {};
      expect(config.getOutputPath("reviewer", fm)).toBe("agents/reviewer.md");
    });
  });
});
