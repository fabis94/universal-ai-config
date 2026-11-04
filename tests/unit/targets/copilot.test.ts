import { describe, it, expect } from "vitest";
import { collectingContext } from "../../test-helpers.js";
import { mapFrontmatter } from "../../../src/core/generate/frontmatter.js";
import copilot from "../../../src/targets/copilot/index.js";
import type {
  UniversalFrontmatter,
  UniversalHookHandler,
  UniversalMCPServer,
} from "../../../src/types.js";

const { ctx } = collectingContext();

describe("copilot target", () => {
  it("has correct name and output dir", () => {
    expect(copilot.name).toBe("copilot");
    expect(copilot.outputDir).toBe(".github");
  });

  describe("instructions", () => {
    const config = copilot.instructions!;

    it("maps description, name and excludeAgent directly for scoped instructions", () => {
      expect(
        mapFrontmatter(
          { description: "D", name: "N", excludeAgent: "code-review", globs: "src/**" },
          config,
        ),
      ).toEqual({ description: "D", name: "N", excludeAgent: "code-review", applyTo: "src/**" });
    });

    it("maps nothing for always-on instructions (copilot-instructions.md has no frontmatter)", () => {
      expect(
        mapFrontmatter(
          { alwaysApply: true, description: "D", name: "N", excludeAgent: "x", globs: "src/**" },
          config,
        ),
      ).toEqual({});
    });

    it("combines several always-on instructions alphabetically, bodies only", () => {
      const entry = (name: string, body: string) => ({
        name,
        sourcePath: `i/${name}.md`,
        frontmatter: { alwaysApply: true },
        body,
        content: body,
      });
      expect(config.combine!([entry("zeta", "\nZ body\n"), entry("alpha", "A body")], ctx)).toBe(
        "A body\n\nZ body\n",
      );
    });

    it("maps globs to comma-separated applyTo string", () => {
      expect(mapFrontmatter({ globs: ["**/*.ts", "**/*.tsx"] }, config)).toEqual({
        applyTo: "**/*.ts,**/*.tsx",
      });
    });

    it("maps single glob to applyTo string", () => {
      expect(mapFrontmatter({ globs: "**/*.ts" }, config)).toEqual({ applyTo: "**/*.ts" });
    });

    it("normalizes comma-separated globs string to applyTo", () => {
      expect(mapFrontmatter({ globs: "**/*.ts,**/*.tsx" }, config)).toEqual({
        applyTo: "**/*.ts,**/*.tsx",
      });
    });

    it("routes alwaysApply templates to copilot-instructions.md", () => {
      const fm: UniversalFrontmatter = { alwaysApply: true };
      expect(config.outputPath("my-rule", fm, { outputDir: ".github" })).toBe(
        ".github/copilot-instructions.md",
      );
    });

    it("routes normal templates to instructions/", () => {
      const fm: UniversalFrontmatter = {};
      expect(config.outputPath("my-rule", fm, { outputDir: ".github" })).toBe(
        ".github/instructions/my-rule.instructions.md",
      );
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
      expect(config.outputPath("test-gen", fm, { outputDir: ".github" })).toBe(
        ".github/skills/test-gen/SKILL.md",
      );
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
      expect(config.outputPath("reviewer", fm, { outputDir: ".github" })).toBe(
        ".github/agents/reviewer.agent.md",
      );
    });
  });

  describe("hooks", () => {
    const config = copilot.hooks!;

    it("has correct output path and no merge key", () => {
      expect(config.outputPath({ outputDir: ".github" })).toBe(".github/hooks/hooks.json");
      expect(config.mergeKey).toBeUndefined();
    });

    it("maps command to bash field", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [{ command: "test.sh", timeout: 30 }],
      };
      const result = config.transform(hooks, ctx) as {
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
      const result = config.transform(hooks, ctx) as { hooks: Record<string, unknown[]> };
      expect(result.hooks).toHaveProperty("userPromptSubmitted");
      expect(result.hooks).not.toHaveProperty("userPromptSubmit");
    });

    it("drops unsupported events", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [{ command: "test.sh" }],
        stop: [{ command: "stop.sh" }],
        subagentStart: [{ command: "agent.sh" }],
      };
      const result = config.transform(hooks, ctx) as { hooks: Record<string, unknown[]> };
      expect(result.hooks).toHaveProperty("preToolUse");
      expect(result.hooks).not.toHaveProperty("stop");
      expect(result.hooks).not.toHaveProperty("subagentStart");
    });

    it("drops matcher field", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [{ matcher: "Bash", command: "test.sh" }],
      };
      const result = config.transform(hooks, ctx) as { hooks: Record<string, unknown[]> };
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
      const result = config.transform(hooks, ctx) as { hooks: Record<string, unknown[]> };
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
      const result = config.transform(hooks, ctx) as { hooks: Record<string, unknown[]> };
      // flat array of handlers, not nested by matcher
      expect(result.hooks.preToolUse).toHaveLength(2);
      const first = result.hooks.preToolUse[0] as Record<string, unknown>;
      expect(first).not.toHaveProperty("hooks"); // not the Claude nested shape
      expect(first.bash).toBe("check.sh");
    });

    it("always wraps output in version + hooks keys", () => {
      const result = config.transform({}, ctx) as Record<string, unknown>;
      expect(result.version).toBe("1");
      expect(result).toHaveProperty("hooks");
    });
  });

  describe("mcp", () => {
    const config = copilot.mcp!;
    const fresh = () => collectingContext();

    it("writes the portable root .mcp.json", () => {
      expect(config.outputPath({ outputDir: ".github" })).toBe(".mcp.json");
    });

    it("passes through the portable fields, and enables every tool by default", () => {
      const { ctx } = fresh();
      const servers = {
        "my-server": {
          type: "stdio" as const,
          command: "npx",
          args: ["-y", "@my/mcp"],
          env: { TOKEN: "${TOKEN}" },
          cwd: "tools",
          timeout: 30000,
          deferTools: true,
        },
        "http-server": {
          type: "http" as const,
          url: "https://mcp.example.com",
          headers: { Authorization: "Bearer ${TOKEN}" },
          enabledTools: ["search"],
        },
      };
      const result = config.transform(servers, undefined, ctx) as {
        mcpServers: Record<string, Record<string, unknown>>;
      };
      expect(result.mcpServers["my-server"]).toEqual({
        type: "stdio",
        command: "npx",
        args: ["-y", "@my/mcp"],
        env: { TOKEN: "${TOKEN}" },
        cwd: "tools",
        tools: ["*"],
        timeout: 30000,
        deferTools: true,
      });
      expect(result.mcpServers["http-server"]).toEqual({
        type: "http",
        url: "https://mcp.example.com",
        headers: { Authorization: "Bearer ${TOKEN}" },
        tools: ["search"],
      });
    });

    it("maps the OAuth client id and scopes", () => {
      const { ctx } = fresh();
      const result = config.transform(
        { s: { url: "https://x", oauth: { clientId: "abc" }, scopes: ["read"] } },
        undefined,
        ctx,
      ) as { mcpServers: Record<string, Record<string, unknown>> };
      expect(result.mcpServers.s).toMatchObject({ oauthClientId: "abc", oauthScopes: ["read"] });
      expect(result.mcpServers.s).not.toHaveProperty("oauth");
    });

    it("drops VS Code-only fields with a legacy-field warning", () => {
      const { ctx, diagnostics } = fresh();
      const result = config.transform(
        {
          s: {
            command: "npx",
            envFile: ".env",
            sandboxEnabled: true,
            sandbox: { "filesystem.allowWrite": ["/tmp"] },
            dev: { watch: "src/**", debug: true },
          },
        },
        undefined,
        ctx,
      ) as { mcpServers: Record<string, Record<string, unknown>> };
      expect(result.mcpServers.s).toEqual({ command: "npx", tools: ["*"] });
      expect(diagnostics.map((d) => [d.code, (d.detail as { field: string }).field])).toEqual([
        ["legacy-field", "envFile"],
        ["legacy-field", "sandbox"],
        ["legacy-field", "sandboxEnabled"],
        ["legacy-field", "dev"],
      ]);
    });

    it("drops inputs and warns about ${input:} references", () => {
      const { ctx, diagnostics } = fresh();
      const inputs = [{ type: "promptString", id: "token", description: "API token" }];
      const result = config.transform(
        { s: { command: "npx", env: { TOKEN: "${input:token}" } } },
        inputs,
        ctx,
      ) as Record<string, unknown>;
      expect(result).not.toHaveProperty("inputs");
      expect(diagnostics.map((d) => (d.detail as { field: string }).field)).toEqual([
        "inputs",
        "${input:}",
      ]);
    });

    it("strips fields other targets own (alwaysLoad, headersHelper, auth)", () => {
      const { ctx } = fresh();
      const servers = {
        "my-server": {
          command: "npx",
          alwaysLoad: true,
          headersHelper: "./gen.sh",
          auth: { CLIENT_ID: "id" },
        } as UniversalMCPServer,
      };
      const result = config.transform(servers, undefined, ctx) as {
        mcpServers: Record<string, Record<string, unknown>>;
      };
      expect(result.mcpServers["my-server"]).toEqual({ command: "npx", tools: ["*"] });
    });
  });
});
