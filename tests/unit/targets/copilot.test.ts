import { describe, it, expect } from "vitest";
import copilot from "../../../src/targets/copilot/index.js";
import type {
  UniversalFrontmatter,
  UniversalHookHandler,
  UniversalMCPServer,
} from "../../../src/types.js";

describe("copilot target", () => {
  it("has correct name and output dir", () => {
    expect(copilot.name).toBe("copilot");
    expect(copilot.outputDir).toBe(".github");
  });

  describe("instructions", () => {
    const config = copilot.instructions!;

    it("maps description directly", () => {
      expect(config.frontmatterMap.description).toBe("description");
    });

    it("maps name directly", () => {
      expect(config.frontmatterMap.name).toBe("name");
    });

    it("maps excludeAgent directly", () => {
      expect(config.frontmatterMap.excludeAgent).toBe("excludeAgent");
    });

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

    it("alwaysApply mapper returns empty object (handled by getOutputPath)", () => {
      const mapper = config.frontmatterMap.alwaysApply as Function;
      expect(mapper(true)).toEqual({});
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

    it("maps disableAutoInvocation, userInvocable, and argumentHint", () => {
      expect(config.frontmatterMap.disableAutoInvocation).toBe("disable-model-invocation");
      expect(config.frontmatterMap.userInvocable).toBe("user-invocable");
      expect(config.frontmatterMap.argumentHint).toBe("argument-hint");
    });

    it("generates correct output path", () => {
      const fm: UniversalFrontmatter = {};
      expect(config.getOutputPath("test-gen", fm)).toBe("skills/test-gen/SKILL.md");
    });
  });

  describe("skills (new fields)", () => {
    const config = copilot.skills!;

    it("maps forkContext to context: fork", () => {
      const mapper = config.frontmatterMap.forkContext as Function;
      expect(mapper(true)).toEqual({ context: "fork" });
      expect(mapper(false)).toEqual({});
    });

    it("does not map claude-only skill fields", () => {
      expect(config.frontmatterMap).not.toHaveProperty("allowedTools");
      expect(config.frontmatterMap).not.toHaveProperty("model");
      expect(config.frontmatterMap).not.toHaveProperty("subagentType");
      expect(config.frontmatterMap).not.toHaveProperty("hooks");
      expect(config.frontmatterMap).not.toHaveProperty("whenToUse");
      expect(config.frontmatterMap).not.toHaveProperty("arguments");
      expect(config.frontmatterMap).not.toHaveProperty("effort");
      expect(config.frontmatterMap).not.toHaveProperty("skillPaths");
      expect(config.frontmatterMap).not.toHaveProperty("skillShell");
    });
  });

  describe("agents", () => {
    const config = copilot.agents!;

    it("maps name and description directly", () => {
      expect(config.frontmatterMap.name).toBe("name");
      expect(config.frontmatterMap.description).toBe("description");
    });

    it("maps model and tools directly", () => {
      expect(config.frontmatterMap.model).toBe("model");
      expect(config.frontmatterMap.tools).toBe("tools");
    });

    it("maps target and handoffs directly", () => {
      expect(config.frontmatterMap.target).toBe("target");
      expect(config.frontmatterMap.handoffs).toBe("handoffs");
    });

    it("maps mcpServers to mcp-servers", () => {
      expect(config.frontmatterMap.mcpServers).toBe("mcp-servers");
    });

    it("maps argumentHint, userInvocable, disableAutoInvocation, subAgents, hooks", () => {
      expect(config.frontmatterMap.argumentHint).toBe("argument-hint");
      expect(config.frontmatterMap.userInvocable).toBe("user-invocable");
      expect(config.frontmatterMap.disableAutoInvocation).toBe("disable-model-invocation");
      expect(config.frontmatterMap.subAgents).toBe("agents");
      expect(config.frontmatterMap.hooks).toBe("hooks");
    });

    it("does not map claude-only agent fields", () => {
      expect(config.frontmatterMap).not.toHaveProperty("maxTurns");
      expect(config.frontmatterMap).not.toHaveProperty("background");
      expect(config.frontmatterMap).not.toHaveProperty("effort");
      expect(config.frontmatterMap).not.toHaveProperty("isolation");
      expect(config.frontmatterMap).not.toHaveProperty("color");
      expect(config.frontmatterMap).not.toHaveProperty("initialPrompt");
      expect(config.frontmatterMap).not.toHaveProperty("memory");
      expect(config.frontmatterMap).not.toHaveProperty("disallowedTools");
      expect(config.frontmatterMap).not.toHaveProperty("permissionMode");
      expect(config.frontmatterMap).not.toHaveProperty("skills");
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

    it("maps all six supported events", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        sessionStart: [{ command: "a.sh" }],
        sessionEnd: [{ command: "a.sh" }],
        userPromptSubmit: [{ command: "a.sh" }],
        preToolUse: [{ command: "a.sh" }],
        postToolUse: [{ command: "a.sh" }],
        errorOccurred: [{ command: "a.sh" }],
      };
      const result = config.transform(hooks) as { hooks: Record<string, unknown[]> };
      expect(result.hooks).toHaveProperty("sessionStart");
      expect(result.hooks).toHaveProperty("sessionEnd");
      expect(result.hooks).toHaveProperty("userPromptSubmitted");
      expect(result.hooks).toHaveProperty("preToolUse");
      expect(result.hooks).toHaveProperty("postToolUse");
      expect(result.hooks).toHaveProperty("errorOccurred");
    });

    it("produces flat handler list (no matcher grouping)", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [
          { matcher: "Bash", command: "check.sh" },
          { matcher: "Edit", command: "lint.sh" },
        ],
      };
      const result = config.transform(hooks) as { hooks: Record<string, unknown[]> };
      // flat array of handlers, not nested by matcher
      expect(result.hooks.preToolUse).toHaveLength(2);
      const first = result.hooks.preToolUse[0] as Record<string, unknown>;
      expect(first).not.toHaveProperty("hooks"); // not the Claude nested shape
      expect(first.bash).toBe("check.sh");
    });

    it("always wraps output in version + hooks keys", () => {
      const result = config.transform({}) as Record<string, unknown>;
      expect(result.version).toBe("1");
      expect(result).toHaveProperty("hooks");
    });
  });

  describe("mcp", () => {
    const config = copilot.mcp!;

    it("has correct output path", () => {
      expect(config.outputPath).toBe(".vscode/mcp.json");
    });

    it("passes through all basic fields", () => {
      const servers = {
        "my-server": {
          type: "stdio" as const,
          command: "npx",
          args: ["-y", "@my/mcp"],
          env: { TOKEN: "abc" },
          envFile: ".env",
        },
        "http-server": {
          type: "http" as const,
          url: "https://mcp.example.com",
          headers: { Authorization: "Bearer tok" },
        },
      };
      const result = config.transform(servers) as {
        servers: Record<string, Record<string, unknown>>;
      };
      const s = result.servers["my-server"]!;
      expect(s.type).toBe("stdio");
      expect(s.command).toBe("npx");
      expect(s.args).toEqual(["-y", "@my/mcp"]);
      expect(s.env).toEqual({ TOKEN: "abc" });
      expect(s.envFile).toBe(".env");
      const h = result.servers["http-server"]!;
      expect(h.url).toBe("https://mcp.example.com");
      expect(h.headers).toEqual({ Authorization: "Bearer tok" });
    });

    it("passes through sandboxEnabled, sandbox, dev", () => {
      const servers = {
        "my-server": {
          type: "stdio" as const,
          command: "npx",
          sandboxEnabled: true,
          sandbox: { "filesystem.allowWrite": ["/tmp"] },
          dev: { watch: "src/**", debug: true },
        },
      };
      const result = config.transform(servers) as {
        servers: Record<string, Record<string, unknown>>;
      };
      const s = result.servers["my-server"]!;
      expect(s.sandboxEnabled).toBe(true);
      expect(s.sandbox).toEqual({ "filesystem.allowWrite": ["/tmp"] });
      expect(s.dev).toEqual({ watch: "src/**", debug: true });
    });

    it("includes inputs array in output when provided", () => {
      const servers = { s: { command: "npx" } };
      const inputs = [
        { type: "promptString" as const, id: "token", description: "API token", password: true },
      ];
      const result = config.transform(servers, inputs) as Record<string, unknown>;
      expect(result.inputs).toEqual(inputs);
    });

    it("omits inputs key when no inputs provided", () => {
      const result = config.transform({ s: { command: "npx" } }) as Record<string, unknown>;
      expect(result).not.toHaveProperty("inputs");
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
      const result = config.transform(servers) as {
        servers: Record<string, Record<string, unknown>>;
      };
      const s = result.servers["my-server"]!;
      expect(s).not.toHaveProperty("oauth");
      expect(s).not.toHaveProperty("alwaysLoad");
      expect(s).not.toHaveProperty("headersHelper");
    });

    it("strips cursor-only field (auth) from output", () => {
      const servers = {
        "my-server": {
          command: "npx",
          auth: { CLIENT_ID: "id", CLIENT_SECRET: "sec", scopes: ["read"] },
        } as UniversalMCPServer,
      };
      const result = config.transform(servers) as {
        servers: Record<string, Record<string, unknown>>;
      };
      const s = result.servers["my-server"]!;
      expect(s).not.toHaveProperty("auth");
    });

    it("wraps output in servers key", () => {
      const result = config.transform({ s: { command: "node" } }) as Record<string, unknown>;
      expect(result).toHaveProperty("servers");
    });
  });
});
