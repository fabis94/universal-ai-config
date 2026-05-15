import { describe, it, expect } from "vitest";
import claude from "../../../src/targets/claude/index.js";
import type {
  UniversalFrontmatter,
  UniversalHookHandler,
  UniversalMCPServer,
} from "../../../src/types.js";

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

    it("alwaysApply mapper returns empty object (handled by globs mapper)", () => {
      const mapper = config.frontmatterMap.alwaysApply as Function;
      expect(mapper(true)).toEqual({});
      expect(mapper(false)).toEqual({});
    });

    it("generates correct output path", () => {
      const fm: UniversalFrontmatter = {};
      expect(config.getOutputPath("my-rule", fm)).toBe("rules/my-rule.md");
    });
  });

  describe("skills", () => {
    const config = claude.skills!;

    it("maps name and description directly", () => {
      expect(config.frontmatterMap.name).toBe("name");
      expect(config.frontmatterMap.description).toBe("description");
    });

    it("maps disableAutoInvocation to disable-model-invocation", () => {
      expect(config.frontmatterMap.disableAutoInvocation).toBe("disable-model-invocation");
    });

    it("maps userInvocable to user-invocable", () => {
      expect(config.frontmatterMap.userInvocable).toBe("user-invocable");
    });

    it("maps allowedTools to allowed-tools", () => {
      expect(config.frontmatterMap.allowedTools).toBe("allowed-tools");
    });

    it("maps model directly", () => {
      expect(config.frontmatterMap.model).toBe("model");
    });

    it("maps subagentType to agent", () => {
      expect(config.frontmatterMap.subagentType).toBe("agent");
    });

    it("maps forkContext to context: fork", () => {
      const mapper = config.frontmatterMap.forkContext as Function;
      expect(mapper(true)).toEqual({ context: "fork" });
      expect(mapper(false)).toEqual({});
    });

    it("maps argumentHint to argument-hint", () => {
      expect(config.frontmatterMap.argumentHint).toBe("argument-hint");
    });

    it("maps hooks directly", () => {
      expect(config.frontmatterMap.hooks).toBe("hooks");
    });

    it("maps whenToUse to when_to_use", () => {
      expect(config.frontmatterMap.whenToUse).toBe("when_to_use");
    });

    it("maps arguments, effort, skillShell, skillPaths", () => {
      expect(config.frontmatterMap.arguments).toBe("arguments");
      expect(config.frontmatterMap.effort).toBe("effort");
      expect(config.frontmatterMap.skillShell).toBe("shell");
      expect(config.frontmatterMap.skillPaths).toBe("paths");
    });

    it("does not map copilot/cursor-only skill fields", () => {
      expect(config.frontmatterMap).not.toHaveProperty("license");
      expect(config.frontmatterMap).not.toHaveProperty("compatibility");
      expect(config.frontmatterMap).not.toHaveProperty("metadata");
    });

    it("generates correct output path", () => {
      const fm: UniversalFrontmatter = {};
      expect(config.getOutputPath("test-gen", fm)).toBe("skills/test-gen/SKILL.md");
    });
  });

  describe("agents", () => {
    const config = claude.agents!;

    it("maps name and description directly", () => {
      expect(config.frontmatterMap.name).toBe("name");
      expect(config.frontmatterMap.description).toBe("description");
    });

    it("maps model, tools, permissionMode directly", () => {
      expect(config.frontmatterMap.model).toBe("model");
      expect(config.frontmatterMap.tools).toBe("tools");
      expect(config.frontmatterMap.permissionMode).toBe("permissionMode");
    });

    it("maps disallowedTools, skills, hooks, memory directly", () => {
      expect(config.frontmatterMap.disallowedTools).toBe("disallowedTools");
      expect(config.frontmatterMap.skills).toBe("skills");
      expect(config.frontmatterMap.hooks).toBe("hooks");
      expect(config.frontmatterMap.memory).toBe("memory");
    });

    it("maps maxTurns, background, effort, isolation, color, initialPrompt, mcpServers", () => {
      expect(config.frontmatterMap.maxTurns).toBe("maxTurns");
      expect(config.frontmatterMap.background).toBe("background");
      expect(config.frontmatterMap.effort).toBe("effort");
      expect(config.frontmatterMap.isolation).toBe("isolation");
      expect(config.frontmatterMap.color).toBe("color");
      expect(config.frontmatterMap.initialPrompt).toBe("initialPrompt");
      expect(config.frontmatterMap.mcpServers).toBe("mcpServers");
    });

    it("does not map copilot-only agent fields", () => {
      expect(config.frontmatterMap).not.toHaveProperty("target");
      expect(config.frontmatterMap).not.toHaveProperty("handoffs");
      expect(config.frontmatterMap).not.toHaveProperty("subAgents");
      expect(config.frontmatterMap).not.toHaveProperty("userInvocable");
      expect(config.frontmatterMap).not.toHaveProperty("disableAutoInvocation");
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

    it("maps all supported events to PascalCase", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        sessionStart: [{ command: "a.sh" }],
        sessionEnd: [{ command: "a.sh" }],
        userPromptSubmit: [{ command: "a.sh" }],
        preToolUse: [{ command: "a.sh" }],
        postToolUse: [{ command: "a.sh" }],
        postToolUseFailure: [{ command: "a.sh" }],
        stop: [{ command: "a.sh" }],
        subagentStart: [{ command: "a.sh" }],
        subagentStop: [{ command: "a.sh" }],
        preCompact: [{ command: "a.sh" }],
        permissionRequest: [{ command: "a.sh" }],
        notification: [{ command: "a.sh" }],
        setup: [{ command: "a.sh" }],
        userPromptExpansion: [{ command: "a.sh" }],
        permissionDenied: [{ command: "a.sh" }],
        postToolBatch: [{ command: "a.sh" }],
        stopFailure: [{ command: "a.sh" }],
        teammateIdle: [{ command: "a.sh" }],
        instructionsLoaded: [{ command: "a.sh" }],
        configChange: [{ command: "a.sh" }],
        cwdChanged: [{ command: "a.sh" }],
        fileChanged: [{ command: "a.sh" }],
        worktreeCreate: [{ command: "a.sh" }],
        worktreeRemove: [{ command: "a.sh" }],
        postCompact: [{ command: "a.sh" }],
        elicitation: [{ command: "a.sh" }],
        elicitationResult: [{ command: "a.sh" }],
        taskCreated: [{ command: "a.sh" }],
        taskCompleted: [{ command: "a.sh" }],
      };
      const result = config.transform(hooks) as { hooks: Record<string, unknown> };
      expect(result.hooks).toHaveProperty("SessionStart");
      expect(result.hooks).toHaveProperty("SessionEnd");
      expect(result.hooks).toHaveProperty("UserPromptSubmit");
      expect(result.hooks).toHaveProperty("PreToolUse");
      expect(result.hooks).toHaveProperty("PostToolUse");
      expect(result.hooks).toHaveProperty("PostToolUseFailure");
      expect(result.hooks).toHaveProperty("Stop");
      expect(result.hooks).toHaveProperty("SubagentStart");
      expect(result.hooks).toHaveProperty("SubagentStop");
      expect(result.hooks).toHaveProperty("PreCompact");
      expect(result.hooks).toHaveProperty("PermissionRequest");
      expect(result.hooks).toHaveProperty("Notification");
      expect(result.hooks).toHaveProperty("Setup");
      expect(result.hooks).toHaveProperty("UserPromptExpansion");
      expect(result.hooks).toHaveProperty("PermissionDenied");
      expect(result.hooks).toHaveProperty("PostToolBatch");
      expect(result.hooks).toHaveProperty("StopFailure");
      expect(result.hooks).toHaveProperty("TeammateIdle");
      expect(result.hooks).toHaveProperty("InstructionsLoaded");
      expect(result.hooks).toHaveProperty("ConfigChange");
      expect(result.hooks).toHaveProperty("CwdChanged");
      expect(result.hooks).toHaveProperty("FileChanged");
      expect(result.hooks).toHaveProperty("WorktreeCreate");
      expect(result.hooks).toHaveProperty("WorktreeRemove");
      expect(result.hooks).toHaveProperty("PostCompact");
      expect(result.hooks).toHaveProperty("Elicitation");
      expect(result.hooks).toHaveProperty("ElicitationResult");
      expect(result.hooks).toHaveProperty("TaskCreated");
      expect(result.hooks).toHaveProperty("TaskCompleted");
      // camelCase originals are not present
      expect(result.hooks).not.toHaveProperty("sessionStart");
      expect(result.hooks).not.toHaveProperty("preToolUse");
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

    it("passes through description and headers on handlers", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [
          {
            type: "http",
            url: "https://example.com",
            headers: { Authorization: "Bearer tok" },
            description: "my hook",
            timeout: 15,
          },
        ],
      };
      const result = config.transform(hooks) as { hooks: Record<string, unknown[]> };
      const groups = result.hooks.PreToolUse as Array<{ hooks: unknown[] }>;
      const entry = groups[0]!.hooks[0] as Record<string, unknown>;
      expect(entry.headers).toEqual({ Authorization: "Bearer tok" });
      expect(entry.description).toBe("my hook");
      expect(entry.timeout).toBe(15);
    });

    it("passes through args on command handlers", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        sessionStart: [{ command: "node", args: ["./check.js", "--strict"] }],
      };
      const result = config.transform(hooks) as { hooks: Record<string, unknown[]> };
      const groups = result.hooks.SessionStart as Array<{ hooks: unknown[] }>;
      const entry = groups[0]!.hooks[0] as Record<string, unknown>;
      expect(entry.command).toBe("node");
      expect(entry.args).toEqual(["./check.js", "--strict"]);
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

  describe("mcp", () => {
    const config = claude.mcp!;

    it("has correct output path", () => {
      expect(config.outputPath).toBe(".mcp.json");
    });

    it("passes through all basic fields", () => {
      const servers = {
        "my-server": {
          type: "stdio" as const,
          command: "npx",
          args: ["-y", "@my/mcp"],
          env: { TOKEN: "abc" },
        },
        "http-server": {
          type: "http" as const,
          url: "https://mcp.example.com",
          headers: { Authorization: "Bearer tok" },
        },
      };
      const result = config.transform(servers) as {
        mcpServers: Record<string, Record<string, unknown>>;
      };
      const s = result.mcpServers["my-server"]!;
      expect(s.type).toBe("stdio");
      expect(s.command).toBe("npx");
      expect(s.args).toEqual(["-y", "@my/mcp"]);
      expect(s.env).toEqual({ TOKEN: "abc" });
      const h = result.mcpServers["http-server"]!;
      expect(h.url).toBe("https://mcp.example.com");
      expect(h.headers).toEqual({ Authorization: "Bearer tok" });
    });

    it("passes through alwaysLoad, headersHelper, oauth", () => {
      const servers = {
        "my-server": {
          type: "http" as const,
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

    it("strips copilot-only fields (sandboxEnabled, sandbox, dev) from output", () => {
      const servers = {
        "my-server": {
          command: "npx",
          sandboxEnabled: true,
          sandbox: { filesystem: { allowWrite: ["/tmp"] } },
          dev: { watch: "./src" },
        } as UniversalMCPServer,
      };
      const result = config.transform(servers) as {
        mcpServers: Record<string, Record<string, unknown>>;
      };
      const s = result.mcpServers["my-server"]!;
      expect(s).not.toHaveProperty("sandboxEnabled");
      expect(s).not.toHaveProperty("sandbox");
      expect(s).not.toHaveProperty("dev");
    });

    it("strips cursor-only fields (envFile, auth) from output", () => {
      const servers = {
        "my-server": {
          command: "npx",
          envFile: ".env.local",
          auth: { CLIENT_ID: "id", CLIENT_SECRET: "sec", scopes: ["read"] },
        } as UniversalMCPServer,
      };
      const result = config.transform(servers) as {
        mcpServers: Record<string, Record<string, unknown>>;
      };
      const s = result.mcpServers["my-server"]!;
      expect(s).not.toHaveProperty("envFile");
      expect(s).not.toHaveProperty("auth");
    });

    it("wraps output in mcpServers key", () => {
      const result = config.transform({ s: { command: "node" } }) as Record<string, unknown>;
      expect(result).toHaveProperty("mcpServers");
      expect(result).not.toHaveProperty("s");
    });
  });
});
