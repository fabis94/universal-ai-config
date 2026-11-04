import { beforeEach, describe, it, expect, vi } from "vitest";
import type { DiagnosticInput } from "../../../src/core/diagnostics.js";
import { parse as parseToml } from "smol-toml";
import { parse as parseYAML } from "yaml";
import codex from "../../../src/targets/codex/index.js";
import { posix } from "node:path";
import type { RenderedFile, TemplateTypeConfig } from "../../../src/targets/define-target.js";
import type {
  UniversalFrontmatter,
  UniversalHookHandler,
  UniversalMCPServer,
} from "../../../src/types.js";

interface TestTemplate {
  name: string;
  sourcePath: string;
  frontmatter: UniversalFrontmatter;
  body: string;
  extraFiles?: Array<{ relativePath: string; content: string }>;
}

/** Build a template entry. Test helper. */
function makeTemplate(name: string, frontmatter: UniversalFrontmatter, body: string): TestTemplate {
  return {
    name,
    sourcePath: `.universal-ai-config/instructions/${name}.md`,
    frontmatter,
    body,
  };
}

function makeInput(templates: TestTemplate[], outputDir = ".codex") {
  return { templates, outputDir };
}

/**
 * Drive a type config the way the generate pipeline does: render each
 * template at its outputPath, place skill extra files next to it, and join
 * same-path renders with `combine`.
 */
function renderAll(typeConfig: TemplateTypeConfig) {
  return ({ templates, outputDir }: { templates: TestTemplate[]; outputDir: string }) => {
    const groups = new Map<string, Array<RenderedFile & { entry?: TestTemplate }>>();
    const add = (file: RenderedFile & { entry?: TestTemplate }) => {
      const group = groups.get(file.path) ?? [];
      group.push(file);
      groups.set(file.path, group);
    };
    for (const t of templates) {
      const outputPath = typeConfig.outputPath(t.name, t.frontmatter, { outputDir });
      for (const file of typeConfig.render!({ ...t, outputPath }, ctx)) add({ ...file, entry: t });
      for (const extra of t.extraFiles ?? []) {
        add({
          path: posix.join(posix.dirname(outputPath), extra.relativePath),
          content: extra.content,
        });
      }
    }
    return [...groups.entries()].map(([path, group]) => {
      if (group.length === 1) return { path, content: group[0]!.content as string };
      const entries = group.map((f) => ({ ...f.entry!, content: f.content as string }));
      return { path, content: typeConfig.combine!(entries, ctx) };
    });
  };
}

/** Diagnostics reported by the last target call — reset before each test. */
let diagnostics: DiagnosticInput[] = [];
const ctx = { report: (d: DiagnosticInput) => diagnostics.push(d) };
beforeEach(() => {
  diagnostics = [];
});

describe("codex target", () => {
  it("has correct name, outputDir, and supportedTypes", () => {
    expect(codex.name).toBe("codex");
    expect(codex.outputDir).toBe(".codex");
    expect(codex.supportedTypes).toEqual(["instructions", "skills", "agents", "hooks", "mcp"]);
  });

  it("reads only AGENTS.md for instructions, and renders skills and agents itself", () => {
    expect(codex.instructions).toBe("agentsMd");
    expect(codex.skills?.render).toBeTypeOf("function");
    expect(codex.agents?.render).toBeTypeOf("function");
  });

  it("hooks output to .codex/hooks.json with no mergeKey (whole-file uac-managed)", () => {
    expect(codex.hooks?.outputPath({ outputDir: ".codex" })).toBe(".codex/hooks.json");
    expect(codex.hooks?.mergeKey).toBeUndefined();
  });

  it("mcp output to .codex/config.toml with mergeKey: mcp_servers and toml format", () => {
    expect(codex.mcp?.outputPath({ outputDir: ".codex" })).toBe(".codex/config.toml");
    expect(codex.mcp?.mergeKey).toBe("mcp_servers");
    expect(codex.mcp?.format).toBe("toml");
  });

  describe("skills render", () => {
    const consolidate = renderAll(codex.skills!);

    it("SKILL.md emitted at root-relative .agents/skills/<name>/SKILL.md", async () => {
      const files = await consolidate(
        makeInput([
          makeTemplate(
            "test-gen",
            { name: "test-gen", description: "Generate tests" },
            "Skill body",
          ),
        ]),
      );
      const skillFile = files.find((f) => f.path.endsWith("SKILL.md"));
      expect(skillFile).toBeDefined();
      expect(skillFile!.path).toBe(".agents/skills/test-gen/SKILL.md");
      expect(skillFile!.content).toContain("Skill body");
      expect(skillFile!.content).toContain('name: "test-gen"');
      expect(skillFile!.content).toContain('description: "Generate tests"');
    });

    it("moves version and author under metadata (they aren't Agent Skills spec fields)", async () => {
      const files = await consolidate(
        makeInput([
          makeTemplate(
            "deploy",
            {
              name: "deploy",
              description: "Deploy",
              version: "1.0.0",
              author: "alice",
              license: "MIT",
              metadata: { team: "ops" },
            },
            "Body",
          ),
        ]),
      );
      const skill = files.find((f) => f.path.endsWith("SKILL.md"))!;
      const fm = parseYAML(skill.content.split("---\n")[1]!) as Record<string, unknown>;
      expect(fm).toEqual({
        name: "deploy",
        description: "Deploy",
        license: "MIT",
        metadata: { team: "ops", version: "1.0.0", author: "alice" },
      });
    });

    it("Claude-only skill fields are stripped from SKILL.md frontmatter", async () => {
      const files = await consolidate(
        makeInput([
          makeTemplate(
            "test",
            {
              name: "test",
              description: "test",
              userInvocable: true,
              allowedTools: ["Read"],
              model: "sonnet",
              forkContext: true,
              argumentHint: "hint",
              whenToUse: "when",
              effort: "high",
            },
            "Body",
          ),
        ]),
      );
      const skill = files.find((f) => f.path.endsWith("SKILL.md"))!;
      expect(skill.content).not.toContain("userInvocable");
      expect(skill.content).not.toContain("allowedTools");
      expect(skill.content).not.toContain("forkContext");
      expect(skill.content).not.toContain("argumentHint");
      expect(skill.content).not.toContain("whenToUse");
      expect(skill.content).not.toContain("effort");
    });

    it("disableAutoInvocation: true → agents/openai.yaml with policy.allow_implicit_invocation: false", async () => {
      const files = await consolidate(
        makeInput([
          makeTemplate(
            "manual",
            { name: "manual", description: "Manual", disableAutoInvocation: true },
            "Body",
          ),
        ]),
      );
      const yamlFile = files.find((f) => f.path.endsWith("agents/openai.yaml"));
      expect(yamlFile).toBeDefined();
      expect(yamlFile!.path).toBe(".agents/skills/manual/agents/openai.yaml");
      const yamlObj = parseYAML(yamlFile!.content) as {
        policy?: { allow_implicit_invocation?: boolean };
      };
      expect(yamlObj.policy?.allow_implicit_invocation).toBe(false);
    });

    it("disableAutoInvocation: false → policy.allow_implicit_invocation: true in YAML (still emitted)", async () => {
      const files = await consolidate(
        makeInput([
          makeTemplate(
            "auto",
            { name: "auto", description: "Auto", disableAutoInvocation: false },
            "Body",
          ),
        ]),
      );
      const yamlFile = files.find((f) => f.path.endsWith("agents/openai.yaml"));
      expect(yamlFile).toBeDefined();
      const yamlObj = parseYAML(yamlFile!.content) as {
        policy?: { allow_implicit_invocation?: boolean };
      };
      expect(yamlObj.policy?.allow_implicit_invocation).toBe(true);
    });

    it("no codex.* and no disableAutoInvocation → no agents/openai.yaml emitted", async () => {
      const files = await consolidate(
        makeInput([makeTemplate("plain", { name: "plain", description: "Plain" }, "Body")]),
      );
      const yamlFile = files.find((f) => f.path.endsWith("openai.yaml"));
      expect(yamlFile).toBeUndefined();
    });

    it("codex.interface.* maps to snake_case in YAML", async () => {
      const files = await consolidate(
        makeInput([
          makeTemplate(
            "ui",
            {
              name: "ui",
              description: "UI skill",
              codex: {
                interface: {
                  displayName: "My UI Skill",
                  shortDescription: "Short desc",
                  iconSmall: "icon.svg",
                  iconLarge: "icon.png",
                  brandColor: "#ff0000",
                  defaultPrompt: "Hello",
                },
              },
            },
            "Body",
          ),
        ]),
      );
      const yamlFile = files.find((f) => f.path.endsWith("openai.yaml"))!;
      const yamlObj = parseYAML(yamlFile.content) as {
        interface?: {
          display_name?: string;
          short_description?: string;
          icon_small?: string;
          icon_large?: string;
          brand_color?: string;
          default_prompt?: string;
        };
      };
      expect(yamlObj.interface?.display_name).toBe("My UI Skill");
      expect(yamlObj.interface?.short_description).toBe("Short desc");
      expect(yamlObj.interface?.icon_small).toBe("icon.svg");
      expect(yamlObj.interface?.icon_large).toBe("icon.png");
      expect(yamlObj.interface?.brand_color).toBe("#ff0000");
      expect(yamlObj.interface?.default_prompt).toBe("Hello");
    });

    it("codex.dependencies.tools[] maps to YAML array", async () => {
      const files = await consolidate(
        makeInput([
          makeTemplate(
            "deps",
            {
              name: "deps",
              description: "Deps",
              codex: {
                dependencies: {
                  tools: [
                    {
                      type: "mcp",
                      value: "github",
                      description: "GitHub",
                      transport: "streamable_http",
                      url: "https://example.com",
                    },
                  ],
                },
              },
            },
            "Body",
          ),
        ]),
      );
      const yamlFile = files.find((f) => f.path.endsWith("openai.yaml"))!;
      const yamlObj = parseYAML(yamlFile.content) as {
        dependencies?: { tools?: Array<Record<string, string>> };
      };
      expect(yamlObj.dependencies?.tools).toHaveLength(1);
      expect(yamlObj.dependencies?.tools?.[0]).toMatchObject({
        type: "mcp",
        value: "github",
        description: "GitHub",
        transport: "streamable_http",
        url: "https://example.com",
      });
    });

    it("disableAutoInvocation + codex.interface together → one YAML with both", async () => {
      const files = await consolidate(
        makeInput([
          makeTemplate(
            "combo",
            {
              name: "combo",
              description: "Combo",
              disableAutoInvocation: true,
              codex: { interface: { displayName: "Combo UI" } },
            },
            "Body",
          ),
        ]),
      );
      const yamlFiles = files.filter((f) => f.path.endsWith("openai.yaml"));
      expect(yamlFiles).toHaveLength(1);
      const yamlObj = parseYAML(yamlFiles[0]!.content) as {
        interface?: { display_name?: string };
        policy?: { allow_implicit_invocation?: boolean };
      };
      expect(yamlObj.interface?.display_name).toBe("Combo UI");
      expect(yamlObj.policy?.allow_implicit_invocation).toBe(false);
    });

    it("extra files copied preserving path structure", async () => {
      const template: TestTemplate = {
        name: "with-refs",
        sourcePath: ".universal-ai-config/skills/with-refs/SKILL.md",
        frontmatter: { name: "with-refs", description: "Has refs" },
        body: "Body",
        extraFiles: [
          { relativePath: "references/example.md", content: "## Example" },
          { relativePath: "data/sample.txt", content: "raw data" },
        ],
      };
      const files = await consolidate(makeInput([template]));
      const refFile = files.find((f) => f.path.endsWith("references/example.md"));
      const dataFile = files.find((f) => f.path.endsWith("data/sample.txt"));
      expect(refFile).toBeDefined();
      expect(refFile!.path).toBe(".agents/skills/with-refs/references/example.md");
      expect(refFile!.content).toBe("## Example");
      expect(dataFile).toBeDefined();
      expect(dataFile!.path).toBe(".agents/skills/with-refs/data/sample.txt");
    });
  });

  describe("agents render", () => {
    const consolidate = renderAll(codex.agents!);

    it("standalone .codex/agents/<name>.toml emitted, valid TOML", async () => {
      const files = await consolidate(
        makeInput([
          makeTemplate("reviewer", { description: "Code reviewer" }, "Review carefully."),
        ]),
      );
      expect(files).toHaveLength(1);
      expect(files[0]!.path).toBe(".codex/agents/reviewer.toml");
      const parsed = parseToml(files[0]!.content) as Record<string, unknown>;
      expect(parsed.name).toBe("reviewer");
      expect(parsed.description).toBe("Code reviewer");
      expect(parsed.developer_instructions).toBe("Review carefully.");
    });

    it("body content becomes developer_instructions (trimmed)", async () => {
      const files = await consolidate(
        makeInput([makeTemplate("a", { description: "A" }, "\n\nLine 1\nLine 2\n\n")]),
      );
      const parsed = parseToml(files[0]!.content) as Record<string, unknown>;
      expect(parsed.developer_instructions).toBe("Line 1\nLine 2");
    });

    it("model passes through", async () => {
      const files = await consolidate(
        makeInput([makeTemplate("a", { description: "A", model: "gpt-6.1-sol" }, "Body")]),
      );
      const parsed = parseToml(files[0]!.content) as Record<string, unknown>;
      expect(parsed.model).toBe("gpt-6.1-sol");
    });

    it("Claude-shaped model emits warning but value still passes through", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const files = await consolidate(
        makeInput([makeTemplate("a", { description: "A", model: "claude-sonnet-5-5" }, "Body")]),
      );
      const parsed = parseToml(files[0]!.content) as Record<string, unknown>;
      expect(parsed.model).toBe("claude-sonnet-5-5");
      warnSpy.mockRestore();
    });

    it("nicknameCandidates → nickname_candidates", async () => {
      const files = await consolidate(
        makeInput([
          makeTemplate("a", { description: "A", nicknameCandidates: ["Alice", "Bob"] }, "Body"),
        ]),
      );
      const parsed = parseToml(files[0]!.content) as Record<string, unknown>;
      expect(parsed.nickname_candidates).toEqual(["Alice", "Bob"]);
    });

    it("drops sandboxMode, mcpServers and skills, which Codex rejects or ignores in agent files", async () => {
      const files = await consolidate(
        makeInput([
          makeTemplate(
            "a",
            {
              description: "A",
              sandboxMode: "workspace-write",
              mcpServers: { github: { url: "https://x" } },
              skills: ["deploy"],
            },
            "Body",
          ),
        ]),
      );
      const parsed = parseToml(files[0]!.content) as Record<string, unknown>;
      expect(Object.keys(parsed).sort()).toEqual(["description", "developer_instructions", "name"]);
      expect(diagnostics.map((d) => (d.detail as { name: string }).name)).toEqual([
        "sandboxMode",
        "mcpServers",
        "skills",
      ]);
    });

    it("skips an agent with no description or an empty body", async () => {
      const files = await consolidate(
        makeInput([
          makeTemplate("no-desc", {}, "Body"),
          makeTemplate("no-body", { description: "D" }, "  \n"),
        ]),
      );
      expect(files).toEqual([]);
      expect(diagnostics.map((d) => (d.detail as { name: string }).name)).toEqual([
        "description",
        "body",
      ]);
    });

    it("writes the codex agent block snake_cased", async () => {
      const files = await consolidate(
        makeInput([
          makeTemplate(
            "a",
            {
              description: "A",
              codex: {
                modelReasoningSummary: "concise",
                modelVerbosity: "low",
                personality: "pragmatic",
                serviceTier: "flex",
                skills: { bundled: { enabled: false }, includeInstructions: false },
              },
            },
            "Body",
          ),
        ]),
      );
      const parsed = parseToml(files[0]!.content) as Record<string, unknown>;
      expect(parsed).toMatchObject({
        model_reasoning_summary: "concise",
        model_verbosity: "low",
        personality: "pragmatic",
        service_tier: "flex",
        skills: { bundled: { enabled: false }, include_instructions: false },
      });
    });

    it("effort: 'medium' auto-maps to model_reasoning_effort", async () => {
      const files = await consolidate(
        makeInput([makeTemplate("a", { description: "A", effort: "medium" }, "Body")]),
      );
      const parsed = parseToml(files[0]!.content) as Record<string, unknown>;
      expect(parsed.model_reasoning_effort).toBe("medium");
    });

    it("maps every Claude effort value, max included, and ultra", async () => {
      for (const effort of ["low", "medium", "high", "xhigh", "max", "ultra"]) {
        const files = await consolidate(
          makeInput([makeTemplate("a", { description: "A", effort }, "Body")]),
        );
        const parsed = parseToml(files[0]!.content) as Record<string, unknown>;
        expect(parsed.model_reasoning_effort).toBe(effort);
      }
    });

    it("drops an effort Codex doesn't know, with a warning", async () => {
      const files = await consolidate(
        makeInput([makeTemplate("a", { description: "A", effort: "extreme" }, "Body")]),
      );
      const parsed = parseToml(files[0]!.content) as Record<string, unknown>;
      expect(parsed.model_reasoning_effort).toBeUndefined();
      expect(diagnostics.map((d) => d.code)).toEqual(["unsupported"]);
    });

    it("tools field dropped with warning", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const files = await consolidate(
        makeInput([makeTemplate("a", { description: "A", tools: ["Read", "Bash"] }, "Body")]),
      );
      const parsed = parseToml(files[0]!.content) as Record<string, unknown>;
      expect(parsed.tools).toBeUndefined();
      warnSpy.mockRestore();
    });

    it("disallowedTools dropped silently", async () => {
      const files = await consolidate(
        makeInput([makeTemplate("a", { description: "A", disallowedTools: ["Bash"] }, "Body")]),
      );
      const parsed = parseToml(files[0]!.content) as Record<string, unknown>;
      expect(parsed.disallowed_tools).toBeUndefined();
      expect(parsed.disallowedTools).toBeUndefined();
    });

    it("permissionMode dropped with warning", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const files = await consolidate(
        makeInput([makeTemplate("a", { description: "A", permissionMode: "acceptEdits" }, "Body")]),
      );
      const parsed = parseToml(files[0]!.content) as Record<string, unknown>;
      expect(parsed.permission_mode).toBeUndefined();
      warnSpy.mockRestore();
    });

    it("Claude-only agent fields dropped silently", async () => {
      const files = await consolidate(
        makeInput([
          makeTemplate(
            "a",
            {
              description: "A",
              maxTurns: 10,
              background: true,
              isolation: "worktree",
              color: "red",
              initialPrompt: "go",
              memory: "session",
              hooks: { onStart: [] },
            },
            "Body",
          ),
        ]),
      );
      const parsed = parseToml(files[0]!.content) as Record<string, unknown>;
      expect(parsed.maxTurns).toBeUndefined();
      expect(parsed.background).toBeUndefined();
      expect(parsed.isolation).toBeUndefined();
      expect(parsed.color).toBeUndefined();
      expect(parsed.initialPrompt).toBeUndefined();
      expect(parsed.memory).toBeUndefined();
      expect(parsed.hooks).toBeUndefined();
    });

    it("honours a custom outputDir", async () => {
      const files = await consolidate(
        makeInput([makeTemplate("a", { description: "A" }, "Body")], ".custom-codex"),
      );
      expect(files[0]!.path).toBe(".custom-codex/agents/a.toml");
    });
  });

  describe("hooks transform", () => {
    const transform = codex.hooks!.transform;

    it("maps all 6 supported events to PascalCase", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        sessionStart: [{ command: "a.sh" }],
        userPromptSubmit: [{ command: "b.sh" }],
        preToolUse: [{ command: "c.sh" }],
        postToolUse: [{ command: "d.sh" }],
        permissionRequest: [{ command: "e.sh" }],
        stop: [{ command: "f.sh" }],
      };
      const result = transform(hooks, ctx) as { hooks: Record<string, unknown> };
      expect(result.hooks).toHaveProperty("SessionStart");
      expect(result.hooks).toHaveProperty("UserPromptSubmit");
      expect(result.hooks).toHaveProperty("PreToolUse");
      expect(result.hooks).toHaveProperty("PostToolUse");
      expect(result.hooks).toHaveProperty("PermissionRequest");
      expect(result.hooks).toHaveProperty("Stop");
    });

    it("maps the newer events, including the Codex-only ones", () => {
      const events = [
        "sessionEnd",
        "subagentStart",
        "subagentStop",
        "preCompact",
        "postCompact",
        "preModelRequest",
        "postModelRequest",
        "interrupt",
      ];
      const result = transform(
        Object.fromEntries(events.map((e) => [e, [{ command: "x" }]])),
        ctx,
      ) as { hooks: Record<string, unknown> };
      expect(Object.keys(result.hooks)).toEqual([
        "SessionEnd",
        "SubagentStart",
        "SubagentStop",
        "PreCompact",
        "PostCompact",
        "PreModelRequest",
        "PostModelRequest",
        "Interrupt",
      ]);
    });

    it("drops events Codex doesn't have", () => {
      const result = transform({ notification: [{ command: "x" }] }, ctx) as {
        hooks: Record<string, unknown>;
      };
      expect(result.hooks).toEqual({});
    });

    it("type: 'command' handlers pass through", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [{ type: "command", command: "x.sh", timeout: 30 }],
      };
      const result = transform(hooks, ctx) as {
        hooks: { PreToolUse: Array<{ hooks: Array<Record<string, unknown>> }> };
      };
      const entry = result.hooks.PreToolUse[0]!.hooks[0]!;
      expect(entry.type).toBe("command");
      expect(entry.command).toBe("x.sh");
      expect(entry.timeout).toBe(30);
    });

    it("undefined type defaults to command and passes through", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [{ command: "x.sh" }],
      };
      const result = transform(hooks, ctx) as {
        hooks: { PreToolUse: Array<{ hooks: Array<Record<string, unknown>> }> };
      };
      expect(result.hooks.PreToolUse[0]!.hooks[0]!.type).toBe("command");
    });

    it("mcp_tool handlers emit server, tool, input, timeout and statusMessage", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [
          {
            type: "mcp_tool",
            server: "audit",
            tool: "log",
            input: { path: "${tool_input.file_path}" },
            timeout: 5,
            statusMessage: "Auditing",
            matcher: "Bash",
          },
        ],
      };
      const result = transform(hooks, ctx) as {
        hooks: { PreToolUse: Array<{ matcher?: string; hooks: Array<Record<string, unknown>> }> };
      };
      expect(result.hooks.PreToolUse[0]!.matcher).toBe("Bash");
      expect(result.hooks.PreToolUse[0]!.hooks[0]).toEqual({
        type: "mcp_tool",
        server: "audit",
        tool: "log",
        input: { path: "${tool_input.file_path}" },
        timeout: 5,
        statusMessage: "Auditing",
      });
    });

    it("command + args flattened into single shell-escaped string", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [{ command: "echo", args: ["hello world", "it's me"] }],
      };
      const result = transform(hooks, ctx) as {
        hooks: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> };
      };
      const cmd = result.hooks.PreToolUse[0]!.hooks[0]!.command;
      expect(cmd).toBe(`echo 'hello world' 'it'\\''s me'`);
    });

    it("simple args don't need quoting", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [{ command: "lint", args: ["--fix", "src/main.ts"] }],
      };
      const result = transform(hooks, ctx) as {
        hooks: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> };
      };
      expect(result.hooks.PreToolUse[0]!.hooks[0]!.command).toBe("lint --fix src/main.ts");
    });

    it("statusMessage passes through", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [{ command: "x.sh", statusMessage: "checking…" }],
      };
      const result = transform(hooks, ctx) as {
        hooks: { PreToolUse: Array<{ hooks: Array<Record<string, unknown>> }> };
      };
      expect(result.hooks.PreToolUse[0]!.hooks[0]!.statusMessage).toBe("checking…");
    });

    it("groups handlers by matcher", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [
          { matcher: "Bash", command: "a.sh" },
          { matcher: "Bash", command: "b.sh" },
          { command: "global.sh" },
        ],
      };
      const result = transform(hooks, ctx) as {
        hooks: { PreToolUse: Array<{ matcher?: string; hooks: unknown[] }> };
      };
      const groups = result.hooks.PreToolUse;
      expect(groups).toHaveLength(2);
      const bashGroup = groups.find((g) => g.matcher === "Bash");
      const globalGroup = groups.find((g) => !g.matcher);
      expect(bashGroup?.hooks).toHaveLength(2);
      expect(globalGroup?.hooks).toHaveLength(1);
    });

    it("emits async, commandWindows and additionalContextLimit", () => {
      const result = transform(
        {
          preToolUse: [
            { command: "x.sh", async: true, commandWindows: "x.ps1", additionalContextLimit: 4000 },
          ],
        },
        ctx,
      ) as { hooks: { PreToolUse: Array<{ hooks: Array<Record<string, unknown>> }> } };
      expect(result.hooks.PreToolUse[0]!.hooks[0]).toEqual({
        type: "command",
        command: "x.sh",
        commandWindows: "x.ps1",
        async: true,
        additionalContextLimit: 4000,
      });
    });

    it("keeps handler order exactly as templated (Codex trust hashes are positional)", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [
          { command: "c", matcher: "Bash" },
          { command: "a" },
          { command: "b", matcher: "Bash" },
          { command: "d", matcher: "Edit" },
        ],
      };
      const first = JSON.stringify(transform(hooks, ctx));
      expect(JSON.stringify(transform(structuredClone(hooks), ctx))).toBe(first);
      const groups = (
        transform(hooks, ctx) as {
          hooks: { PreToolUse: Array<{ matcher?: string; hooks: Array<{ command: string }> }> };
        }
      ).hooks.PreToolUse;
      expect(groups.map((g) => [g.matcher ?? "", g.hooks.map((h) => h.command)])).toEqual([
        ["Bash", ["c", "b"]],
        ["", ["a"]],
        ["Edit", ["d"]],
      ]);
    });

    it("Claude-specific handler fields dropped silently", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [
          {
            command: "x.sh",
            asyncRewake: true,
            shell: "bash",
            if: "Bash(*)",
            once: true,
          },
        ],
      };
      const result = transform(hooks, ctx) as {
        hooks: { PreToolUse: Array<{ hooks: Array<Record<string, unknown>> }> };
      };
      const entry = result.hooks.PreToolUse[0]!.hooks[0]!;
      expect(entry.asyncRewake).toBeUndefined();
      expect(entry.shell).toBeUndefined();
      expect(entry.if).toBeUndefined();
      expect(entry.once).toBeUndefined();
    });
  });

  describe("mcp transform", () => {
    const transform = codex.mcp!.transform;

    it("wraps output in mcp_servers key (TOML-shaped)", () => {
      const result = transform({}, undefined, ctx) as Record<string, unknown>;
      expect(result).toHaveProperty("mcp_servers");
    });

    it("passes through command, args, env, url", () => {
      const servers: Record<string, UniversalMCPServer> = {
        s: {
          command: "node",
          args: ["server.js"],
          env: { KEY: "v" },
          url: "https://x",
        },
      };
      const result = transform(servers, undefined, ctx) as {
        mcp_servers: Record<string, Record<string, unknown>>;
      };
      const s = result.mcp_servers.s!;
      expect(s.command).toBe("node");
      expect(s.args).toEqual(["server.js"]);
      expect(s.env).toEqual({ KEY: "v" });
      expect(s.url).toBe("https://x");
    });

    it("renames headers → http_headers", () => {
      const servers: Record<string, UniversalMCPServer> = {
        s: { url: "https://x", headers: { Authorization: "Bearer x" } },
      };
      const result = transform(servers, undefined, ctx) as {
        mcp_servers: Record<string, Record<string, unknown>>;
      };
      expect(result.mcp_servers.s!.http_headers).toEqual({ Authorization: "Bearer x" });
      expect(result.mcp_servers.s!.headers).toBeUndefined();
    });

    it("drops type field silently (Codex infers from command/url)", () => {
      const servers: Record<string, UniversalMCPServer> = {
        s: { type: "stdio", command: "node" },
      };
      const result = transform(servers, undefined, ctx) as {
        mcp_servers: Record<string, Record<string, unknown>>;
      };
      expect(result.mcp_servers.s!.type).toBeUndefined();
    });

    it("maps every Codex MCP field to its snake_case key", () => {
      const servers: Record<string, UniversalMCPServer> = {
        s: {
          command: "node",
          cwd: "/tmp",
          envVars: ["A", "B"],
          enabled: true,
          required: false,
          enabledTools: ["t1"],
          disabledTools: ["t2"],
          bearerTokenEnvVar: "TOKEN",
          envHttpHeaders: { Auth: "TOKEN" },
          startupTimeoutSec: 10,
          startupTimeoutMs: 5000,
          toolTimeoutSec: 30,
          oauthResource: "https://x",
          scopes: ["read"],
          environmentId: "remote",
          headersHelper: "./headers.sh",
          startupReadiness: "catalog",
          supportsParallelToolCalls: true,
          toolInputSchemaMaxBytes: 2048,
          omitToolsFrom: "deferred",
          defaultToolsApprovalMode: "prompt",
          toolSettings: { search: { approvalMode: "auto", outputTokenLimit: 500 } },
          identity: { url: { match: "prefix", value: "https://x" } },
          auth: "chatgpt",
        },
      };
      const result = transform(servers, undefined, ctx) as {
        mcp_servers: Record<string, Record<string, unknown>>;
      };
      const s = result.mcp_servers.s!;
      expect(s.cwd).toBe("/tmp");
      expect(s.env_vars).toEqual(["A", "B"]);
      expect(s.enabled).toBe(true);
      expect(s.required).toBe(false);
      expect(s.enabled_tools).toEqual(["t1"]);
      expect(s.disabled_tools).toEqual(["t2"]);
      expect(s.bearer_token_env_var).toBe("TOKEN");
      expect(s.env_http_headers).toEqual({ Auth: "TOKEN" });
      expect(s.startup_timeout_sec).toBe(10);
      expect(s.startup_timeout_ms).toBe(5000);
      expect(s.tool_timeout_sec).toBe(30);
      expect(s.oauth_resource).toBe("https://x");
      expect(s.scopes).toEqual(["read"]);
      expect(s.environment_id).toBe("remote");
      expect(s.http_headers_helper).toBe("./headers.sh");
      expect(s.startup_readiness).toBe("catalog");
      expect(s.supports_parallel_tool_calls).toBe(true);
      expect(s.tool_input_schema_max_bytes).toBe(2048);
      expect(s.omit_tools_from).toBe("deferred");
      expect(s.default_tools_approval_mode).toBe("prompt");
      expect(s.tools).toEqual({ search: { approval_mode: "auto", output_token_limit: 500 } });
      expect(s.identity).toEqual({ url: { match: "prefix", value: "https://x" } });
      expect(s.auth).toBe("chatgpt");
      expect(diagnostics).toEqual([]);
    });

    it("accepts { name, source } env_vars entries", () => {
      const result = transform(
        { s: { command: "x", envVars: ["A", { name: "B", source: "remote" }] } },
        undefined,
        ctx,
      ) as { mcp_servers: Record<string, Record<string, unknown>> };
      expect(result.mcp_servers.s!.env_vars).toEqual(["A", { name: "B", source: "remote" }]);
    });

    it("writes the deprecated experimentalEnvironment as environment_id, with a warning", () => {
      const result = transform(
        { s: { command: "x", experimentalEnvironment: "remote" } },
        undefined,
        ctx,
      ) as { mcp_servers: Record<string, Record<string, unknown>> };
      expect(result.mcp_servers.s!.environment_id).toBe("remote");
      expect(result.mcp_servers.s).not.toHaveProperty("experimental_environment");
      expect(diagnostics.map((d) => d.code)).toEqual(["legacy-field"]);
    });

    it("maps oauth to Codex's oauth table, reporting keys Codex lacks", () => {
      const servers: Record<string, UniversalMCPServer> = {
        s: {
          url: "https://x",
          oauth: {
            clientId: "id",
            clientSecret: "secret",
            callbackUrl: "http://127.0.0.1/cb",
            callbackPort: 7777,
            authServerMetadataUrl: "https://meta",
          },
        },
      };
      const result = transform(servers, undefined, ctx) as {
        mcp_servers: Record<string, Record<string, unknown>>;
      };
      expect(result.mcp_servers.s!.oauth).toEqual({
        client_id: "id",
        client_secret: "secret",
        callback_url: "http://127.0.0.1/cb",
        callback_port: 7777,
      });
      expect(diagnostics.map((d) => (d.detail as { name: string }).name)).toEqual([
        "oauth.authServerMetadataUrl",
      ]);
    });

    it("auth field dropped with warning", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const servers: Record<string, UniversalMCPServer> = {
        s: { url: "https://x", auth: { CLIENT_ID: "id" } },
      };
      const result = transform(servers, undefined, ctx) as {
        mcp_servers: Record<string, Record<string, unknown>>;
      };
      expect(result.mcp_servers.s!.auth).toBeUndefined();
      warnSpy.mockRestore();
    });

    it("envFile field dropped with warning", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const servers: Record<string, UniversalMCPServer> = {
        s: { command: "x", envFile: ".env" },
      };
      const result = transform(servers, undefined, ctx) as {
        mcp_servers: Record<string, Record<string, unknown>>;
      };
      expect(result.mcp_servers.s!.envFile).toBeUndefined();
      warnSpy.mockRestore();
    });

    it("Claude/Copilot/Cursor-only fields dropped silently", () => {
      const servers: Record<string, UniversalMCPServer> = {
        s: {
          command: "x",
          alwaysLoad: true,
          headersHelper: "./h.sh",
          sandboxEnabled: true,
          sandbox: { network: {} },
          dev: { debug: true },
        },
      };
      const result = transform(servers, undefined, ctx) as {
        mcp_servers: Record<string, Record<string, unknown>>;
      };
      const s = result.mcp_servers.s!;
      expect(s.alwaysLoad).toBeUndefined();
      expect(s.headersHelper).toBeUndefined();
      expect(s.sandboxEnabled).toBeUndefined();
      expect(s.sandbox).toBeUndefined();
      expect(s.dev).toBeUndefined();
    });
  });
});
