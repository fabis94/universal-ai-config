import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { parse as parseYAML } from "yaml";
import { generateProject } from "../../src/core/generate/index.js";
import type { Diagnostic } from "../../src/core/diagnostics.js";
import type { GeneratedFile, Target, TemplateType } from "../../src/types.js";
import { text } from "../test-helpers.js";

const FIXTURE = join(import.meta.dirname, "../fixtures/fields-project");

/** Generate one target alone — the intended setup, with no shared outputs. */
async function run(target: Target, type: TemplateType) {
  const diagnostics: Diagnostic[] = [];
  const { files } = await generateProject({
    root: FIXTURE,
    targets: [target],
    types: [type],
    onDiagnostic: (d) => diagnostics.push(d),
  });
  const byPath = (path: string): GeneratedFile => {
    const file = files.find((f) => f.path === path);
    if (!file) throw new Error(`${path} not generated: ${files.map((f) => f.path).join(", ")}`);
    return file;
  };
  return { files, diagnostics, byPath };
}

function frontmatterOf(file: GeneratedFile): Record<string, unknown> {
  return parseYAML(text(file).split("---\n")[1] ?? "") as Record<string, unknown>;
}

/** What a first-colon line parser (Cursor's agent loader) reads from the frontmatter. */
function lineParsed(file: GeneratedFile): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of (text(file).split("---\n")[1] ?? "").split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0 && !line.startsWith(" ")) result[line.slice(0, idx)] = line.slice(idx + 1).trim();
  }
  return result;
}

function fieldsOf(diagnostics: Diagnostic[], code: Diagnostic["code"]): string[] {
  return diagnostics
    .filter((d) => d.code === code)
    .map((d) => {
      const detail = d.detail as { name?: string; field?: string };
      return detail.name ?? detail.field ?? "";
    });
}

describe("3.0 fields, per target", () => {
  describe("skills", () => {
    it("claude", async () => {
      const { byPath } = await run("claude", "skills");
      expect(frontmatterOf(byPath(".claude/skills/field-skill/SKILL.md"))).toEqual({
        name: "field-skill",
        description: "Exercises every 3.0 skill field",
        "allowed-tools": ["Read", "Grep"],
        "disallowed-tools": ["Bash"],
        background: false,
        context: "fork",
        "user-invocable": false,
        paths: ["src/**", "docs/**"],
        license: "MIT",
        compatibility: "Requires git",
        metadata: { owner: "platform" },
      });
    });

    it("copilot", async () => {
      const { byPath } = await run("copilot", "skills");
      expect(frontmatterOf(byPath(".github/skills/field-skill/SKILL.md"))).toEqual({
        name: "field-skill",
        description: "Exercises every 3.0 skill field",
        "user-invocable": false,
        compatibility: "Requires git",
        license: "MIT",
        metadata: { owner: "platform" },
        "allowed-tools": ["Read", "Grep"],
        context: "fork",
      });
    });

    it("cursor", async () => {
      const { byPath } = await run("cursor", "skills");
      expect(frontmatterOf(byPath(".cursor/skills/field-skill/SKILL.md"))).toEqual({
        name: "field-skill",
        description: "Exercises every 3.0 skill field",
        license: "MIT",
        compatibility: "Requires git",
        metadata: { owner: "platform" },
        "user-invocable": false,
        paths: ["src/**", "docs/**"],
        icon: "rocket",
        color: "cyan",
      });
    });

    it("codex: version and author move under metadata", async () => {
      const { byPath } = await run("codex", "skills");
      expect(frontmatterOf(byPath(".agents/skills/field-skill/SKILL.md"))).toEqual({
        name: "field-skill",
        description: "Exercises every 3.0 skill field",
        license: "MIT",
        compatibility: "Requires git",
        metadata: { owner: "platform", version: "2.1.0", author: "Platform team" },
      });
    });
  });

  describe("agents", () => {
    it("claude: new fields, line-safe so Cursor reads it cleanly", async () => {
      const { byPath } = await run("claude", "agents");
      const agent = byPath(".claude/agents/field-agent.md");
      expect(frontmatterOf(agent)).toMatchObject({
        name: "field-agent",
        model: "claude-sonnet-5-5",
        tools: "Read, Grep",
        disallowedTools: "Write",
        effort: "high",
        background: true,
        autoCompactWindow: 200000,
        omitClaudeMd: true,
        experimental: { cacheTtl: "1h" },
      });
      expect(lineParsed(agent)).toMatchObject({
        name: "field-agent",
        description: "Exercises every 3.0 agent field",
        model: "claude-sonnet-5-5",
        tools: "Read, Grep",
      });
    });

    it("copilot: Copilot-harness fields; Local-harness ones dropped with warnings", async () => {
      const { byPath, diagnostics } = await run("copilot", "agents");
      expect(frontmatterOf(byPath(".github/agents/field-agent.agent.md"))).toEqual({
        name: "field-agent",
        description: "Exercises every 3.0 agent field",
        model: "gpt-6.1-sol",
        tools: ["Read", "Grep"],
        target: "github-copilot",
        "mcp-servers": { docs: { command: "npx" } },
        skills: ["field-skill"],
        "reasoning-effort": "high",
        "model-policy": "required",
        metadata: { team: "platform" },
        "include-custom-instructions": true,
        "deferred-tool-loading": true,
        "strict-tools-list": false,
        github: { permissions: { contents: "read" } },
      });
      expect(fieldsOf(diagnostics, "legacy-field")).toEqual([
        "handoffs",
        "agents",
        "argument-hint",
      ]);
    });

    it("cursor: only Cursor's fields, line-safe", async () => {
      const { byPath } = await run("cursor", "agents");
      const agent = byPath(".cursor/agents/field-agent.md");
      expect(text(agent)).toBe(
        "---\nname: field-agent\ndescription: Exercises every 3.0 agent field\nmodel: composer-2.5\nreadonly: true\nis_background: true\n---\nReview the change carefully.\n",
      );
    });

    it("codex: a valid role file with the codex block; unsupported fields reported", async () => {
      const { byPath, diagnostics } = await run("codex", "agents");
      expect(parseToml(text(byPath(".codex/agents/field-agent.toml")))).toEqual({
        name: "field-agent",
        description: "Exercises every 3.0 agent field",
        developer_instructions: "Review the change carefully.",
        model: "gpt-6.1-sol",
        model_reasoning_effort: "high",
        model_reasoning_summary: "concise",
        model_verbosity: "low",
        personality: "pragmatic",
        service_tier: "flex",
        skills: { bundled: { enabled: false }, include_instructions: false },
      });
      expect(fieldsOf(diagnostics, "unsupported").sort()).toEqual([
        "disallowedTools",
        "mcpServers",
        "sandboxMode",
        "skills",
        "tools",
      ]);
    });
  });

  describe("hooks", () => {
    it("claude: onFailure from failClosed, and the new events", async () => {
      const { byPath } = await run("claude", "hooks");
      const hooks = JSON.parse(text(byPath(".claude/settings.json"))).hooks;
      expect(hooks.PreToolUse[0].hooks[0]).toMatchObject({
        command: "node",
        args: ["guard.js", "--strict"],
        onFailure: "block",
        timeout: 20,
      });
      expect(Object.keys(hooks).sort()).toEqual(["MessageDisplay", "PreToolUse", "Stop"]);
    });

    it("copilot: version 1, cross-platform command, cwd/env/matcher, Copilot events", async () => {
      const { byPath } = await run("copilot", "hooks");
      const json = JSON.parse(text(byPath(".github/hooks/hooks.json")));
      expect(json.version).toBe(1);
      expect(json.hooks.preToolUse).toEqual([
        {
          type: "command",
          command: "node guard.js --strict",
          cwd: "scripts",
          env: { MODE: "strict" },
          matcher: "Bash",
          timeoutSec: 20,
        },
      ]);
      expect(Object.keys(json.hooks).sort()).toEqual([
        "agentStop",
        "preToolUse",
        "userPromptTransformed",
      ]);
    });

    it("cursor: flattened args and failClosed", async () => {
      const { byPath } = await run("cursor", "hooks");
      const json = JSON.parse(text(byPath(".cursor/hooks.json")));
      expect(json.hooks.preToolUse).toEqual([
        {
          type: "command",
          command: "node guard.js --strict",
          matcher: "Bash",
          timeout: 20,
          failClosed: true,
        },
      ]);
    });

    it("codex: async, commandWindows, additionalContextLimit and Codex-only events", async () => {
      const { byPath } = await run("codex", "hooks");
      const hooks = JSON.parse(text(byPath(".codex/hooks.json"))).hooks;
      expect(hooks.PreToolUse).toEqual([
        {
          matcher: "Bash",
          hooks: [
            {
              type: "command",
              command: "node guard.js --strict",
              commandWindows: "node guard.js --strict --windows",
              timeout: 20,
              async: false,
              additionalContextLimit: 4000,
            },
          ],
        },
      ]);
      expect(Object.keys(hooks).sort()).toEqual(["PreModelRequest", "PreToolUse", "Stop"]);
    });
  });

  describe("mcp", () => {
    it("claude: timeout in ms, no foreign keys", async () => {
      const { byPath } = await run("claude", "mcp");
      const servers = JSON.parse(text(byPath(".mcp.json"))).mcpServers;
      expect(servers.local).toEqual({ command: "npx", args: ["-y", "local-mcp"], timeout: 30000 });
      expect(servers.remote).toEqual({
        type: "http",
        url: "https://mcp.example.com/mcp",
        headersHelper: "./scripts/headers.sh",
        oauth: { clientId: "uac-client", callbackPort: 7777 },
      });
    });

    it("copilot: portable .mcp.json with tools, timeout, deferTools and OAuth client id", async () => {
      const { byPath } = await run("copilot", "mcp");
      const servers = JSON.parse(text(byPath(".mcp.json"))).mcpServers;
      expect(servers.local).toEqual({
        command: "npx",
        args: ["-y", "local-mcp"],
        tools: ["search"],
        timeout: 30000,
        deferTools: true,
      });
      expect(servers.remote).toEqual({
        type: "http",
        url: "https://mcp.example.com/mcp",
        tools: ["*"],
        oauthClientId: "uac-client",
      });
    });

    it("cursor: stdio type for command servers, object auth", async () => {
      const { byPath } = await run("cursor", "mcp");
      const servers = JSON.parse(text(byPath(".cursor/mcp.json"))).mcpServers;
      expect(servers.local).toEqual({ type: "stdio", command: "npx", args: ["-y", "local-mcp"] });
      expect(servers.remote).toEqual({
        type: "http",
        url: "https://mcp.example.com/mcp",
        auth: { CLIENT_ID: "uac-client" },
      });
    });

    it("codex: the new config keys", async () => {
      const { byPath } = await run("codex", "mcp");
      const servers = parseToml(text(byPath(".codex/config.toml"))).mcp_servers as Record<
        string,
        Record<string, unknown>
      >;
      expect(servers.local).toEqual({
        command: "npx",
        args: ["-y", "local-mcp"],
        env_vars: ["HOME", { name: "TOKEN", source: "remote" }],
        enabled_tools: ["search"],
        startup_readiness: "catalog",
        tools: { search: { approval_mode: "auto" } },
      });
      expect(servers.remote).toEqual({
        url: "https://mcp.example.com/mcp",
        http_headers_helper: "./scripts/headers.sh",
        environment_id: "remote",
        oauth: { client_id: "uac-client", callback_port: 7777 },
        auth: "chatgpt",
      });
    });
  });
});
