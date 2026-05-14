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

    it("maps globs array to comma-separated string (no spaces)", () => {
      const mapper = config.frontmatterMap.globs as Function;
      const result = mapper(["**/*.ts", "**/*.tsx"]);
      expect(result).toEqual({ globs: "**/*.ts,**/*.tsx" });
    });

    it("normalizes single glob string", () => {
      const mapper = config.frontmatterMap.globs as Function;
      const result = mapper("**/*.ts");
      expect(result).toEqual({ globs: "**/*.ts" });
    });

    it("normalizes comma-separated globs string", () => {
      const mapper = config.frontmatterMap.globs as Function;
      const result = mapper("**/*.ts,**/*.tsx");
      expect(result).toEqual({ globs: "**/*.ts,**/*.tsx" });
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

    it("passes through workspaceOpen event", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        workspaceOpen: [{ command: "init.sh" }],
      };
      const result = config.transform(hooks) as { hooks: Record<string, unknown[]> };
      expect(result.hooks).toHaveProperty("workspaceOpen");
    });

    it("passes through handler type and maps loopLimit / failClosed", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [
          {
            type: "prompt",
            prompt: "Review this change",
            loopLimit: 3,
            failClosed: true,
          },
          {
            command: "check.sh",
            loopLimit: null,
          },
        ],
      };
      const result = config.transform(hooks) as { hooks: Record<string, unknown[]> };
      const handlers = result.hooks.preToolUse as Record<string, unknown>[];
      expect(handlers[0]).toEqual({
        type: "prompt",
        prompt: "Review this change",
        loop_limit: 3,
        failClosed: true,
      });
      expect(handlers[1]).toMatchObject({ type: "command", command: "check.sh", loop_limit: null });
    });
  });

  describe("mcp (new fields)", () => {
    const config = cursor.mcp!;

    it("passes through type, envFile, auth", () => {
      const servers = {
        "my-server": {
          type: "stdio",
          command: "npx",
          args: ["-y", "@my/server"],
          envFile: ".env.local",
          auth: { CLIENT_ID: "id", scopes: ["read"] },
        },
      };
      const result = config.transform(servers) as {
        mcpServers: Record<string, Record<string, unknown>>;
      };
      const s = result.mcpServers["my-server"]!;
      expect(s.type).toBe("stdio");
      expect(s.envFile).toBe(".env.local");
      expect(s.auth).toEqual({ CLIENT_ID: "id", scopes: ["read"] });
    });

    it("omits type when not provided", () => {
      const servers = {
        "my-server": { command: "npx" },
      };
      const result = config.transform(servers) as {
        mcpServers: Record<string, Record<string, unknown>>;
      };
      expect(result.mcpServers["my-server"]).not.toHaveProperty("type");
    });
  });
});
