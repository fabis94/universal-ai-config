import { describe, it, expect } from "vitest";
import cursor from "../../../src/targets/cursor/index.js";
import type { UniversalFrontmatter, UniversalHookHandler } from "../../../src/types.js";

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

  describe("hooks", () => {
    const config = cursor.hooks!;

    it("has correct output path and no merge key", () => {
      expect(config.outputPath).toBe("hooks.json");
      expect(config.mergeKey).toBeUndefined();
    });

    it("wraps output with version 1", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [{ command: "test.sh" }],
      };
      const result = config.transform(hooks) as { version: number };
      expect(result.version).toBe(1);
    });

    it("maps userPromptSubmit to beforeSubmitPrompt", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        userPromptSubmit: [{ command: "validate.sh" }],
      };
      const result = config.transform(hooks) as { hooks: Record<string, unknown[]> };
      expect(result.hooks).toHaveProperty("beforeSubmitPrompt");
      expect(result.hooks).not.toHaveProperty("userPromptSubmit");
    });

    it("preserves matcher and timeout in flat handler structure", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [{ matcher: "Bash", command: "test.sh", timeout: 30 }],
      };
      const result = config.transform(hooks) as { hooks: Record<string, unknown[]> };
      expect(result.hooks.preToolUse[0]).toEqual({
        type: "command",
        command: "test.sh",
        matcher: "Bash",
        timeout: 30,
      });
    });

    it("passes through cursor-specific events", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        afterFileEdit: [{ command: "format.sh" }],
        beforeShellExecution: [{ command: "check.sh" }],
      };
      const result = config.transform(hooks) as { hooks: Record<string, unknown[]> };
      expect(result.hooks).toHaveProperty("afterFileEdit");
      expect(result.hooks).toHaveProperty("beforeShellExecution");
    });

    it("drops unsupported events", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [{ command: "test.sh" }],
        permissionRequest: [{ command: "perm.sh" }],
        errorOccurred: [{ command: "error.sh" }],
      };
      const result = config.transform(hooks) as { hooks: Record<string, unknown[]> };
      expect(result.hooks).toHaveProperty("preToolUse");
      expect(result.hooks).not.toHaveProperty("permissionRequest");
      expect(result.hooks).not.toHaveProperty("errorOccurred");
    });
  });
});
