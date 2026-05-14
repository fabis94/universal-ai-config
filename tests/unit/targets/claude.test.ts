import { describe, it, expect } from "vitest";
import claude from "../../../src/targets/claude/index.js";
import type { UniversalFrontmatter, UniversalHookHandler } from "../../../src/types.js";

describe("claude target", () => {
  it("has correct name and output dir", () => {
    expect(claude.name).toBe("claude");
    expect(claude.outputDir).toBe(".claude");
  });

  it("supports all five types", () => {
    expect(claude.supportedTypes).toEqual(["instructions", "skills", "agents", "hooks", "mcp"]);
  });

  describe("instructions", () => {
    const config = claude.instructions!;

    it("maps description directly", () => {
      const map = config.frontmatterMap.description as string;
      expect(map).toBe("description");
    });

    it("maps globs to paths array when not alwaysApply", () => {
      const mapper = config.frontmatterMap.globs as Function;
      const fm: UniversalFrontmatter = { globs: ["**/*.ts"] };
      const result = mapper(["**/*.ts"], fm);
      expect(result).toEqual({ paths: ["**/*.ts"] });
    });

    it("normalizes comma-separated globs string to paths array", () => {
      const mapper = config.frontmatterMap.globs as Function;
      const fm: UniversalFrontmatter = { globs: "**/*.ts,**/*.tsx" };
      const result = mapper("**/*.ts,**/*.tsx", fm);
      expect(result).toEqual({ paths: ["**/*.ts", "**/*.tsx"] });
    });

    it("normalizes single string glob to paths array", () => {
      const mapper = config.frontmatterMap.globs as Function;
      const fm: UniversalFrontmatter = { globs: "**/*.ts" };
      const result = mapper("**/*.ts", fm);
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

  describe("hooks", () => {
    const config = claude.hooks!;

    it("has correct output path and merge key", () => {
      expect(config.outputPath).toBe("settings.json");
      expect(config.mergeKey).toBe("hooks");
    });

    it("converts event names to PascalCase", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [{ command: "test.sh" }],
        sessionStart: [{ command: "init.sh" }],
      };
      const result = config.transform(hooks) as { hooks: Record<string, unknown> };
      expect(result.hooks).toHaveProperty("PreToolUse");
      expect(result.hooks).toHaveProperty("SessionStart");
      expect(result.hooks).not.toHaveProperty("preToolUse");
    });

    it("groups handlers by matcher into nested structure", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [
          { matcher: "Bash", command: "check-bash.sh", timeout: 30 },
          { matcher: "Bash", command: "log-bash.sh" },
          { command: "global-check.sh" },
        ],
      };
      const result = config.transform(hooks) as { hooks: Record<string, unknown[]> };
      const groups = result.hooks.PreToolUse as Array<{ matcher?: string; hooks: unknown[] }>;
      expect(groups).toHaveLength(2);

      const bashGroup = groups.find((g) => g.matcher === "Bash");
      expect(bashGroup).toBeDefined();
      expect(bashGroup!.hooks).toHaveLength(2);
      expect(bashGroup!.hooks[0]).toEqual({
        type: "command",
        command: "check-bash.sh",
        timeout: 30,
      });

      const globalGroup = groups.find((g) => !g.matcher);
      expect(globalGroup).toBeDefined();
      expect(globalGroup!.hooks).toHaveLength(1);
    });

    it("drops unsupported events", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [{ command: "test.sh" }],
        errorOccurred: [{ command: "error.sh" }],
      };
      const result = config.transform(hooks) as { hooks: Record<string, unknown> };
      expect(result.hooks).toHaveProperty("PreToolUse");
      expect(result.hooks).not.toHaveProperty("errorOccurred");
    });

    it("maps new hook events to PascalCase", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        setup: [{ command: "setup.sh" }],
        postCompact: [{ command: "compact.sh" }],
        taskCreated: [{ command: "task.sh" }],
        worktreeCreate: [{ command: "wt.sh" }],
        elicitation: [{ command: "elicit.sh" }],
      };
      const result = config.transform(hooks) as { hooks: Record<string, unknown> };
      expect(result.hooks).toHaveProperty("Setup");
      expect(result.hooks).toHaveProperty("PostCompact");
      expect(result.hooks).toHaveProperty("TaskCreated");
      expect(result.hooks).toHaveProperty("WorktreeCreate");
      expect(result.hooks).toHaveProperty("Elicitation");
    });

    it("passes through handler type and type-specific fields", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [
          { type: "http", url: "https://example.com/hook", allowedEnvVars: ["TOKEN"] },
          { type: "mcp_tool", server: "my-server", tool: "run", input: { key: "val" } },
          { type: "prompt", prompt: "Summarize the change", model: "claude-opus-4-7" },
          {
            command: "check.sh",
            async: true,
            asyncRewake: false,
            shell: "bash",
            if: "Bash(git *)",
            statusMessage: "checking…",
            once: true,
          },
        ],
      };
      const result = config.transform(hooks) as { hooks: Record<string, unknown[]> };
      const groups = result.hooks.PreToolUse as Array<{ hooks: unknown[] }>;
      const entries = groups[0]!.hooks as Record<string, unknown>[];

      expect(entries[0]).toEqual({
        type: "http",
        url: "https://example.com/hook",
        allowedEnvVars: ["TOKEN"],
      });
      expect(entries[1]).toEqual({
        type: "mcp_tool",
        server: "my-server",
        tool: "run",
        input: { key: "val" },
      });
      expect(entries[2]).toEqual({
        type: "prompt",
        prompt: "Summarize the change",
        model: "claude-opus-4-7",
      });
      expect(entries[3]).toMatchObject({
        type: "command",
        command: "check.sh",
        async: true,
        asyncRewake: false,
        shell: "bash",
        if: "Bash(git *)",
        statusMessage: "checking…",
        once: true,
      });
      // only explicitly set fields are present — description not set, so absent
      expect(entries[3]).not.toHaveProperty("description");
    });
  });

  describe("skills (new fields)", () => {
    const config = claude.skills!;

    it("maps whenToUse to when_to_use", () => {
      expect(config.frontmatterMap.whenToUse).toBe("when_to_use");
    });

    it("maps arguments, effort, skillShell", () => {
      expect(config.frontmatterMap.arguments).toBe("arguments");
      expect(config.frontmatterMap.effort).toBe("effort");
      expect(config.frontmatterMap.skillShell).toBe("shell");
    });

    it("maps skillPaths to paths", () => {
      expect(config.frontmatterMap.skillPaths).toBe("paths");
    });
  });

  describe("agents (new fields)", () => {
    const config = claude.agents!;

    it("maps maxTurns, background, effort, isolation, color, initialPrompt", () => {
      expect(config.frontmatterMap.maxTurns).toBe("maxTurns");
      expect(config.frontmatterMap.background).toBe("background");
      expect(config.frontmatterMap.effort).toBe("effort");
      expect(config.frontmatterMap.isolation).toBe("isolation");
      expect(config.frontmatterMap.color).toBe("color");
      expect(config.frontmatterMap.initialPrompt).toBe("initialPrompt");
    });

    it("maps mcpServers for agents", () => {
      expect(config.frontmatterMap.mcpServers).toBe("mcpServers");
    });
  });

  describe("mcp (new fields)", () => {
    const config = claude.mcp!;

    it("passes through alwaysLoad, headersHelper, oauth", () => {
      const servers = {
        "my-server": {
          type: "http",
          url: "https://mcp.example.com",
          alwaysLoad: true,
          headersHelper: "./gen-headers.sh",
          oauth: { clientId: "abc", scopes: ["read"] },
        },
      };
      const result = config.transform(servers) as {
        mcpServers: Record<string, Record<string, unknown>>;
      };
      const s = result.mcpServers["my-server"]!;
      expect(s.alwaysLoad).toBe(true);
      expect(s.headersHelper).toBe("./gen-headers.sh");
      expect(s.oauth).toEqual({ clientId: "abc", scopes: ["read"] });
    });
  });
});
