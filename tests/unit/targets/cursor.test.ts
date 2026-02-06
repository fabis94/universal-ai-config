import { describe, it, expect } from "vitest";
import cursor from "../../../src/targets/cursor/index.js";
import type { UniversalFrontmatter } from "../../../src/types.js";

describe("cursor target", () => {
  it("has correct name and output dir", () => {
    expect(cursor.name).toBe("cursor");
    expect(cursor.outputDir).toBe(".cursor");
  });

  it("does not support agents", () => {
    expect(cursor.supportedTypes).not.toContain("agents");
    expect(cursor.agents).toBeUndefined();
  });

  describe("instructions", () => {
    const config = cursor.instructions!;

    it("maps globs directly", () => {
      expect(config.frontmatterMap.globs).toBe("globs");
    });

    it("maps alwaysApply directly", () => {
      expect(config.frontmatterMap.alwaysApply).toBe("alwaysApply");
    });

    it("generates .mdc output path", () => {
      const fm: UniversalFrontmatter = {};
      expect(config.getOutputPath("my-rule", fm)).toBe("rules/my-rule.mdc");
    });
  });

  describe("skills", () => {
    const config = cursor.skills!;

    it("maps compatibility field", () => {
      expect(config.frontmatterMap.compatibility).toBe("compatibility");
    });

    it("maps metadata field", () => {
      expect(config.frontmatterMap.metadata).toBe("metadata");
    });

    it("generates correct output path", () => {
      const fm: UniversalFrontmatter = {};
      expect(config.getOutputPath("test-gen", fm)).toBe("skills/test-gen/SKILL.md");
    });
  });
});
