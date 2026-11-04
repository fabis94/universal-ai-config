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

    it("maps allowedTools to allowed-tools", () => {
      expect(config.frontmatterMap.allowedTools).toBe("allowed-tools");
    });

    it("does not map claude-only skill fields", () => {
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

    it("maps the Copilot-harness fields with the CLI's kebab-case keys", () => {
      const { ctx, diagnostics } = collectingContext();
      expect(
        mapFrontmatter(
          {
            name: "reviewer",
            description: "Reviews",
            model: "gpt-6.1-sol",
            tools: ["read", "edit"],
            target: "github-copilot",
            mcpServers: { s: { command: "x" } },
            userInvocable: true,
            disableAutoInvocation: false,
            hooks: { stop: [] },
            skills: ["deploy"],
            effort: "high",
            modelPolicy: "required",
            metadata: { team: "core" },
            includeCustomInstructions: true,
            deferredToolLoading: true,
            strictToolsList: false,
            github: { permissions: { contents: "read" } },
          },
          config,
          ctx,
        ),
      ).toEqual({
        name: "reviewer",
        description: "Reviews",
        model: "gpt-6.1-sol",
        tools: ["read", "edit"],
        target: "github-copilot",
        "mcp-servers": { s: { command: "x" } },
        "user-invocable": true,
        "disable-model-invocation": false,
        hooks: { stop: [] },
        skills: ["deploy"],
        "reasoning-effort": "high",
        "model-policy": "required",
        metadata: { team: "core" },
        "include-custom-instructions": true,
        "deferred-tool-loading": true,
        "strict-tools-list": false,
        github: { permissions: { contents: "read" } },
      });
      expect(diagnostics).toEqual([]);
    });

    it("drops Local-harness-only fields with a legacy-field warning", () => {
      const { ctx, diagnostics } = collectingContext();
      expect(
        mapFrontmatter(
          {
            handoffs: [{ label: "Go", agent: "x", prompt: "p" }],
            subAgents: ["helper"],
            argumentHint: "<file>",
          },
          config,
          ctx,
        ),
      ).toEqual({});
      expect(diagnostics.map((d) => (d.detail as { field: string }).field)).toEqual([
        "handoffs",
        "agents",
        "argument-hint",
      ]);
    });

    it("drops a target that isn't an editor schema", () => {
      const { ctx, diagnostics } = collectingContext();
      expect(mapFrontmatter({ target: "anything" as "vscode" }, config, ctx)).toEqual({});
      expect(diagnostics.map((d) => d.code)).toEqual(["suspicious-value"]);
    });

    it("does not map claude-only agent fields", () => {
      for (const field of [
        "disallowedTools",
        "permissionMode",
        "memory",
        "maxTurns",
        "background",
      ]) {
        expect(config.frontmatterMap).not.toHaveProperty(field);
      }
    });

    it("generates correct output path with .agent.md extension", () => {
      expect(config.outputPath("reviewer", {}, { outputDir: ".github" })).toBe(
        ".github/agents/reviewer.agent.md",
      );
    });
  });

  describe("hooks", () => {
    const config = copilot.hooks!;
    const transform = (hooks: Record<string, UniversalHookHandler[]>) =>
      config.transform(hooks, collectingContext().ctx) as {
        version: unknown;
        hooks: Record<string, Array<Record<string, unknown>>>;
      };

    it("writes .github/hooks/hooks.json with no merge key", () => {
      expect(config.outputPath({ outputDir: ".github" })).toBe(".github/hooks/hooks.json");
      expect(config.mergeKey).toBeUndefined();
    });

    it("writes the number 1 as version (Copilot rejects the file otherwise)", () => {
      expect(transform({}).version).toBe(1);
    });

    it("maps every universal event Copilot runs", () => {
      const events = [
        "sessionStart",
        "sessionEnd",
        "userPromptSubmit",
        "preToolUse",
        "postToolUse",
        "postToolUseFailure",
        "stop",
        "subagentStart",
        "subagentStop",
        "preCompact",
        "permissionRequest",
        "notification",
        "errorOccurred",
        "userPromptTransformed",
        "preMcpToolCall",
        "postResult",
        "prePRDescription",
      ];
      const result = transform(Object.fromEntries(events.map((e) => [e, [{ command: "x" }]])));
      expect(Object.keys(result.hooks)).toEqual([
        "sessionStart",
        "sessionEnd",
        "userPromptSubmitted",
        "preToolUse",
        "postToolUse",
        "postToolUseFailure",
        "agentStop",
        "subagentStart",
        "subagentStop",
        "preCompact",
        "permissionRequest",
        "notification",
        "errorOccurred",
        "userPromptTransformed",
        "preMcpToolCall",
        "postResult",
        "prePRDescription",
      ]);
    });

    it("drops events Copilot doesn't have", () => {
      expect(transform({ setup: [{ command: "x" }] }).hooks).toEqual({});
    });

    it("writes the cross-platform command with args folded in, plus matcher, cwd, env and timeoutSec", () => {
      const result = transform({
        preToolUse: [
          {
            command: "node",
            args: ["guard.js", "a b"],
            matcher: "bash|edit",
            cwd: "scripts",
            env: { MODE: "strict" },
            timeout: 10,
          },
        ],
      });
      expect(result.hooks.preToolUse).toEqual([
        {
          type: "command",
          command: "node guard.js 'a b'",
          cwd: "scripts",
          env: { MODE: "strict" },
          matcher: "bash|edit",
          timeoutSec: 10,
        },
      ]);
    });

    it("emits a flat handler list (no matcher grouping)", () => {
      const result = transform({
        preToolUse: [
          { command: "a", matcher: "bash" },
          { command: "b", matcher: "bash" },
        ],
      });
      expect(result.hooks.preToolUse).toHaveLength(2);
    });

    it("emits http handlers, and prompt handlers on sessionStart only", () => {
      const { ctx, diagnostics } = collectingContext();
      const result = config.transform(
        {
          preToolUse: [
            {
              type: "http",
              url: "https://x",
              headers: { A: "b" },
              allowedEnvVars: ["T"],
              timeout: 5,
            },
          ],
          sessionStart: [{ type: "prompt", prompt: "hi" }],
          stop: [{ type: "prompt", prompt: "bye" }],
        },
        ctx,
      ) as { hooks: Record<string, unknown[]> };
      expect(result.hooks.preToolUse).toEqual([
        {
          type: "http",
          url: "https://x",
          headers: { A: "b" },
          allowedEnvVars: ["T"],
          timeoutSec: 5,
        },
      ]);
      expect(result.hooks.sessionStart).toEqual([{ type: "prompt", prompt: "hi" }]);
      expect(result.hooks).not.toHaveProperty("agentStop");
      expect(diagnostics.map((d) => d.code)).toEqual(["unsupported"]);
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
