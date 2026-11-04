import { describe, it, expect } from "vitest";
import { collectingContext } from "../../test-helpers.js";
import { mapFrontmatter } from "../../../src/core/generate/frontmatter.js";
import cursor from "../../../src/targets/cursor/index.js";
import type {
  UniversalFrontmatter,
  UniversalHookHandler,
  UniversalMCPServer,
} from "../../../src/types.js";

const { ctx } = collectingContext();

describe("cursor target", () => {
  it("has correct name and output dir", () => {
    expect(cursor.name).toBe("cursor");
    expect(cursor.outputDir).toBe(".cursor");
  });

  describe("agents", () => {
    const config = cursor.agents!;

    it("supports agents at .cursor/agents/<name>.md", () => {
      expect(cursor.supportedTypes).toContain("agents");
      expect(config.outputPath("reviewer", {}, { outputDir: ".cursor" })).toBe(
        ".cursor/agents/reviewer.md",
      );
    });

    it("maps name, description, model, readonly and background → is_background", () => {
      expect(
        mapFrontmatter(
          {
            name: "reviewer",
            description: "Reviews",
            model: "composer-2.5",
            readonly: true,
            background: true,
            tools: ["Read"],
            permissionMode: "plan",
          },
          config,
        ),
      ).toEqual({
        name: "reviewer",
        description: "Reviews",
        model: "composer-2.5",
        readonly: true,
        is_background: true,
      });
    });

    it("writes line-safe frontmatter for Cursor's line-based agent parser", () => {
      expect(config.frontmatterStyle).toBe("line-safe");
    });
  });

  describe("instructions", () => {
    const config = cursor.instructions!;

    it("maps description directly", () => {
      expect(config.frontmatterMap.description).toBe("description");
    });

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
      expect(config.outputPath("my-rule", fm, { outputDir: ".cursor" })).toBe(
        ".cursor/rules/my-rule.mdc",
      );
    });
  });

  describe("skills", () => {
    const config = cursor.skills!;

    it("maps name and description directly", () => {
      expect(config.frontmatterMap.name).toBe("name");
      expect(config.frontmatterMap.description).toBe("description");
    });

    it("maps disableAutoInvocation to disable-model-invocation", () => {
      expect(config.frontmatterMap.disableAutoInvocation).toBe("disable-model-invocation");
    });

    it("maps license field", () => {
      expect(config.frontmatterMap.license).toBe("license");
    });

    it("maps compatibility field", () => {
      expect(config.frontmatterMap.compatibility).toBe("compatibility");
    });

    it("maps metadata field", () => {
      expect(config.frontmatterMap.metadata).toBe("metadata");
    });

    it("maps user-invocable, paths (from skillPaths), icon and color", () => {
      expect(
        mapFrontmatter(
          {
            userInvocable: false,
            skillPaths: ["src/**", "docs/**"],
            icon: "rocket",
            color: "cyan",
          },
          config,
        ),
      ).toEqual({
        "user-invocable": false,
        paths: ["src/**", "docs/**"],
        icon: "rocket",
        color: "cyan",
      });
    });

    it("does not map claude-only skill fields", () => {
      expect(config.frontmatterMap).not.toHaveProperty("argumentHint");
      expect(config.frontmatterMap).not.toHaveProperty("allowedTools");
      expect(config.frontmatterMap).not.toHaveProperty("model");
      expect(config.frontmatterMap).not.toHaveProperty("subagentType");
      expect(config.frontmatterMap).not.toHaveProperty("forkContext");
      expect(config.frontmatterMap).not.toHaveProperty("hooks");
      expect(config.frontmatterMap).not.toHaveProperty("whenToUse");
      expect(config.frontmatterMap).not.toHaveProperty("arguments");
      expect(config.frontmatterMap).not.toHaveProperty("effort");
      expect(config.frontmatterMap).not.toHaveProperty("skillShell");
    });

    it("generates correct output path", () => {
      const fm: UniversalFrontmatter = {};
      expect(config.outputPath("test-gen", fm, { outputDir: ".cursor" })).toBe(
        ".cursor/skills/test-gen/SKILL.md",
      );
    });
  });

  describe("hooks", () => {
    const config = cursor.hooks!;

    it("has correct output path and no merge key", () => {
      expect(config.outputPath({ outputDir: ".cursor" })).toBe(".cursor/hooks.json");
      expect(config.mergeKey).toBeUndefined();
    });

    it("wraps output with version 1", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [{ command: "test.sh" }],
      };
      const result = config.transform(hooks, ctx) as { version: number };
      expect(result.version).toBe(1);
    });

    it("maps userPromptSubmit to beforeSubmitPrompt", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        userPromptSubmit: [{ command: "validate.sh" }],
      };
      const result = config.transform(hooks, ctx) as { hooks: Record<string, unknown[]> };
      expect(result.hooks).toHaveProperty("beforeSubmitPrompt");
      expect(result.hooks).not.toHaveProperty("userPromptSubmit");
    });

    it("preserves matcher and timeout in flat handler structure", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [{ matcher: "Bash", command: "test.sh", timeout: 30 }],
      };
      const result = config.transform(hooks, ctx) as { hooks: Record<string, unknown[]> };
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
      const result = config.transform(hooks, ctx) as { hooks: Record<string, unknown[]> };
      expect(result.hooks).toHaveProperty("afterFileEdit");
      expect(result.hooks).toHaveProperty("beforeShellExecution");
    });

    it("drops unsupported events (claude-only and copilot-only)", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [{ command: "test.sh" }],
        permissionRequest: [{ command: "perm.sh" }],
        errorOccurred: [{ command: "error.sh" }],
        notification: [{ command: "n.sh" }],
        postToolBatch: [{ command: "b.sh" }],
      };
      const result = config.transform(hooks, ctx) as { hooks: Record<string, unknown[]> };
      expect(result.hooks).toHaveProperty("preToolUse");
      expect(result.hooks).not.toHaveProperty("permissionRequest");
      expect(result.hooks).not.toHaveProperty("errorOccurred");
      expect(result.hooks).not.toHaveProperty("notification");
      expect(result.hooks).not.toHaveProperty("postToolBatch");
    });

    it("maps all universal events supported by cursor", () => {
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
      };
      const result = config.transform(hooks, ctx) as { hooks: Record<string, unknown[]> };
      expect(result.hooks).toHaveProperty("sessionStart");
      expect(result.hooks).toHaveProperty("sessionEnd");
      expect(result.hooks).toHaveProperty("beforeSubmitPrompt");
      expect(result.hooks).not.toHaveProperty("userPromptSubmit");
      expect(result.hooks).toHaveProperty("preToolUse");
      expect(result.hooks).toHaveProperty("postToolUse");
      expect(result.hooks).toHaveProperty("postToolUseFailure");
      expect(result.hooks).toHaveProperty("stop");
      expect(result.hooks).toHaveProperty("subagentStart");
      expect(result.hooks).toHaveProperty("subagentStop");
      expect(result.hooks).toHaveProperty("preCompact");
    });

    it("passes through all cursor-specific events", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        workspaceOpen: [{ command: "a.sh" }],
        beforeShellExecution: [{ command: "a.sh" }],
        afterShellExecution: [{ command: "a.sh" }],
        beforeMCPExecution: [{ command: "a.sh" }],
        afterMCPExecution: [{ command: "a.sh" }],
        beforeReadFile: [{ command: "a.sh" }],
        afterFileEdit: [{ command: "a.sh" }],
        afterAgentResponse: [{ command: "a.sh" }],
        afterAgentThought: [{ command: "a.sh" }],
        beforeTabFileRead: [{ command: "a.sh" }],
        afterTabFileEdit: [{ command: "a.sh" }],
      };
      const result = config.transform(hooks, ctx) as { hooks: Record<string, unknown[]> };
      expect(result.hooks).toHaveProperty("workspaceOpen");
      expect(result.hooks).toHaveProperty("beforeShellExecution");
      expect(result.hooks).toHaveProperty("afterShellExecution");
      expect(result.hooks).toHaveProperty("beforeMCPExecution");
      expect(result.hooks).toHaveProperty("afterMCPExecution");
      expect(result.hooks).toHaveProperty("beforeReadFile");
      expect(result.hooks).toHaveProperty("afterFileEdit");
      expect(result.hooks).toHaveProperty("afterAgentResponse");
      expect(result.hooks).toHaveProperty("afterAgentThought");
      expect(result.hooks).toHaveProperty("beforeTabFileRead");
      expect(result.hooks).toHaveProperty("afterTabFileEdit");
    });

    it("strips claude-only handler fields (async, asyncRewake, shell, if, once, statusMessage, args)", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [
          {
            command: "check.sh",
            async: true,
            asyncRewake: true,
            shell: "bash",
            if: "Bash(*)",
            once: true,
            statusMessage: "checking",
            args: ["--strict"],
          },
        ],
      };
      const result = config.transform(hooks, ctx) as { hooks: Record<string, unknown[]> };
      const handler = result.hooks.preToolUse[0] as Record<string, unknown>;
      expect(handler).not.toHaveProperty("async");
      expect(handler).not.toHaveProperty("asyncRewake");
      expect(handler).not.toHaveProperty("shell");
      expect(handler).not.toHaveProperty("if");
      expect(handler).not.toHaveProperty("once");
      expect(handler).not.toHaveProperty("statusMessage");
      expect(handler).not.toHaveProperty("args");
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
      const result = config.transform(hooks, ctx) as { hooks: Record<string, unknown[]> };
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

  describe("mcp", () => {
    const config = cursor.mcp!;

    it("has correct output path", () => {
      expect(config.outputPath({ outputDir: ".cursor" })).toBe(".cursor/mcp.json");
    });

    it("passes through all basic fields", () => {
      const servers = {
        "my-server": {
          type: "stdio" as const,
          command: "npx",
          args: ["-y", "@my/server"],
          env: { TOKEN: "abc" },
        },
        "http-server": {
          type: "http" as const,
          url: "https://mcp.example.com",
          headers: { Authorization: "Bearer tok" },
        },
      };
      const result = config.transform(servers, undefined, ctx) as {
        mcpServers: Record<string, Record<string, unknown>>;
      };
      const s = result.mcpServers["my-server"]!;
      expect(s.type).toBe("stdio");
      expect(s.command).toBe("npx");
      expect(s.args).toEqual(["-y", "@my/server"]);
      expect(s.env).toEqual({ TOKEN: "abc" });
      const h = result.mcpServers["http-server"]!;
      expect(h.url).toBe("https://mcp.example.com");
      expect(h.headers).toEqual({ Authorization: "Bearer tok" });
    });

    it("passes through envFile and auth", () => {
      const servers = {
        "my-server": {
          type: "stdio" as const,
          command: "npx",
          args: ["-y", "@my/server"],
          envFile: ".env.local",
          auth: { CLIENT_ID: "id", scopes: ["read"] },
        },
      };
      const result = config.transform(servers, undefined, ctx) as {
        mcpServers: Record<string, Record<string, unknown>>;
      };
      const s = result.mcpServers["my-server"]!;
      expect(s.envFile).toBe(".env.local");
      expect(s.auth).toEqual({ CLIENT_ID: "id", scopes: ["read"] });
    });

    it("writes type stdio for a command server without a type (Cursor requires it)", () => {
      const result = config.transform(
        { local: { command: "npx" }, remote: { url: "https://x" } },
        undefined,
        ctx,
      ) as { mcpServers: Record<string, Record<string, unknown>> };
      expect(result.mcpServers.local!.type).toBe("stdio");
      expect(result.mcpServers.remote).not.toHaveProperty("type");
    });

    it("emits auth only as an object (a string is Codex's auth mode)", () => {
      const result = config.transform(
        {
          a: { url: "https://x", auth: "chatgpt" },
          b: { url: "https://x", auth: { CLIENT_ID: "x" } },
        },
        undefined,
        ctx,
      ) as { mcpServers: Record<string, Record<string, unknown>> };
      expect(result.mcpServers.a).not.toHaveProperty("auth");
      expect(result.mcpServers.b!.auth).toEqual({ CLIENT_ID: "x" });
    });

    it("strips claude-only fields (oauth, alwaysLoad, headersHelper) from output", () => {
      const servers = {
        "my-server": {
          command: "npx",
          oauth: { clientId: "abc" },
          alwaysLoad: true,
          headersHelper: "./gen.sh",
        } as UniversalMCPServer,
      };
      const result = config.transform(servers, undefined, ctx) as {
        mcpServers: Record<string, Record<string, unknown>>;
      };
      const s = result.mcpServers["my-server"]!;
      expect(s).not.toHaveProperty("oauth");
      expect(s).not.toHaveProperty("alwaysLoad");
      expect(s).not.toHaveProperty("headersHelper");
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
      const result = config.transform(servers, undefined, ctx) as {
        mcpServers: Record<string, Record<string, unknown>>;
      };
      const s = result.mcpServers["my-server"]!;
      expect(s).not.toHaveProperty("sandboxEnabled");
      expect(s).not.toHaveProperty("sandbox");
      expect(s).not.toHaveProperty("dev");
    });

    it("wraps output in mcpServers key", () => {
      const result = config.transform({ s: { command: "node" } }, undefined, ctx) as Record<
        string,
        unknown
      >;
      expect(result).toHaveProperty("mcpServers");
    });
  });
});
