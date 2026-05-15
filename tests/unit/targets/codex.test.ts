import { describe, it, expect, vi } from "vitest";
import { parse as parseToml } from "smol-toml";
import { parse as parseYAML } from "yaml";
import codex, { globRootDir } from "../../../src/targets/codex/index.js";
import type { ConsolidateInput, TemplateTypeConfig } from "../../../src/targets/define-target.js";
import type {
  UniversalFrontmatter,
  UniversalHookHandler,
  UniversalMCPServer,
} from "../../../src/types.js";

/** Build a ConsolidateInput template entry. Test helper. */
function makeTemplate(
  name: string,
  frontmatter: UniversalFrontmatter,
  body: string,
): ConsolidateInput["templates"][number] {
  return {
    name,
    sourcePath: `.universal-ai-config/instructions/${name}.md`,
    frontmatter,
    body,
  };
}

function makeInput(
  templates: ConsolidateInput["templates"],
  outputDir = ".codex",
): ConsolidateInput {
  return { templates, outputDir, root: "/tmp/fixture" };
}

describe("codex target", () => {
  it("has correct name, outputDir, and supportedTypes", () => {
    expect(codex.name).toBe("codex");
    expect(codex.outputDir).toBe(".codex");
    expect(codex.supportedTypes).toEqual(["instructions", "skills", "agents", "hooks", "mcp"]);
  });

  it("registers consolidate functions for instructions, skills, and agents", () => {
    expect(codex.instructions?.consolidate).toBeTypeOf("function");
    expect(codex.skills?.consolidate).toBeTypeOf("function");
    expect(codex.agents?.consolidate).toBeTypeOf("function");
  });

  it("hooks output to .codex/hooks.json with no mergeKey (whole-file uac-managed)", () => {
    expect(codex.hooks?.outputPath).toBe("hooks.json");
    expect(codex.hooks?.mergeKey).toBeUndefined();
  });

  it("mcp output to .codex/config.toml with mergeKey: mcp_servers and toml format", () => {
    expect(codex.mcp?.outputPath).toBe(".codex/config.toml");
    expect(codex.mcp?.mergeKey).toBe("mcp_servers");
    expect(codex.mcp?.format).toBe("toml");
  });

  describe("globRootDir helper", () => {
    it("returns first segments before the wildcard", () => {
      expect(globRootDir("packages/frontend/**/*.ts")).toBe("packages/frontend");
      expect(globRootDir("src/**")).toBe("src");
      expect(globRootDir("src/api/**/*.ts")).toBe("src/api");
    });

    it("returns null for leading-wildcard globs", () => {
      expect(globRootDir("**/*.ts")).toBeNull();
      expect(globRootDir("*.md")).toBeNull();
      expect(globRootDir("**/AGENTS.md")).toBeNull();
    });

    it("returns null for globs with no wildcard at all", () => {
      expect(globRootDir("plain-file.ts")).toBeNull();
      expect(globRootDir("src/foo")).toBeNull();
    });
  });

  describe("instructions consolidate", () => {
    const consolidate = codex.instructions!.consolidate as NonNullable<
      TemplateTypeConfig["consolidate"]
    >;

    it("single alwaysApply: true → root AGENTS.md", async () => {
      const files = await consolidate(
        makeInput([makeTemplate("rule-a", { alwaysApply: true, description: "Rule A" }, "Body A")]),
      );
      expect(files).toHaveLength(1);
      expect(files[0]!.path).toBe("AGENTS.md");
      expect(files[0]!.content).toContain("## Rule A");
      expect(files[0]!.content).toContain("Body A");
    });

    it("multiple alwaysApply templates → alpha-sorted, separated by ---", async () => {
      const files = await consolidate(
        makeInput([
          makeTemplate("zeta", { alwaysApply: true, description: "Zeta rule" }, "Zeta body"),
          makeTemplate("alpha", { alwaysApply: true, description: "Alpha rule" }, "Alpha body"),
        ]),
      );
      expect(files).toHaveLength(1);
      const content = files[0]!.content;
      // alpha comes before zeta
      const alphaIdx = content.indexOf("Alpha body");
      const zetaIdx = content.indexOf("Zeta body");
      expect(alphaIdx).toBeGreaterThan(-1);
      expect(zetaIdx).toBeGreaterThan(-1);
      expect(alphaIdx).toBeLessThan(zetaIdx);
      expect(content).toContain("\n---\n");
    });

    it("resolvable-dir glob → <dir>/AGENTS.override.md", async () => {
      const files = await consolidate(
        makeInput([
          makeTemplate(
            "frontend",
            { globs: ["packages/frontend/**/*.ts"], description: "Frontend" },
            "Frontend body",
          ),
        ]),
      );
      expect(files).toHaveLength(1);
      expect(files[0]!.path).toBe("packages/frontend/AGENTS.override.md");
      expect(files[0]!.content).toContain("Frontend body");
    });

    it("multi-segment dir prefix preserved", async () => {
      const files = await consolidate(
        makeInput([
          makeTemplate("api", { globs: ["src/api/**/*.ts"], description: "API" }, "API body"),
        ]),
      );
      expect(files[0]!.path).toBe("src/api/AGENTS.override.md");
    });

    it("multiple distinct-dir globs in one template → multiple override files (same body)", async () => {
      const files = await consolidate(
        makeInput([
          makeTemplate(
            "shared",
            { globs: ["src/foo/**", "src/bar/**"], description: "Shared" },
            "Shared body",
          ),
        ]),
      );
      expect(files).toHaveLength(2);
      const paths = files.map((f) => f.path).sort();
      expect(paths).toEqual(["src/bar/AGENTS.override.md", "src/foo/AGENTS.override.md"]);
      for (const file of files) {
        expect(file.content).toContain("Shared body");
      }
    });

    it("multiple templates targeting the same dir → one file, alpha-sorted", async () => {
      const files = await consolidate(
        makeInput([
          makeTemplate("zebra", { globs: ["src/**"], description: "Zebra" }, "Zebra body"),
          makeTemplate("apple", { globs: ["src/**"], description: "Apple" }, "Apple body"),
        ]),
      );
      expect(files).toHaveLength(1);
      expect(files[0]!.path).toBe("src/AGENTS.override.md");
      const content = files[0]!.content;
      expect(content.indexOf("Apple body")).toBeLessThan(content.indexOf("Zebra body"));
    });

    it("leading-wildcard globs route to root AGENTS.md", async () => {
      const files = await consolidate(
        makeInput([
          makeTemplate("tests", { globs: ["**/*.test.ts"], description: "Tests" }, "Tests body"),
        ]),
      );
      expect(files).toHaveLength(1);
      expect(files[0]!.path).toBe("AGENTS.md");
      expect(files[0]!.content).toContain("Tests body");
    });

    it("template with neither alwaysApply nor globs → root AGENTS.md", async () => {
      const files = await consolidate(
        makeInput([makeTemplate("loose", { description: "Loose" }, "Loose body")]),
      );
      expect(files).toHaveLength(1);
      expect(files[0]!.path).toBe("AGENTS.md");
    });

    it("alwaysApply: true + globs set → alwaysApply wins (root)", async () => {
      const files = await consolidate(
        makeInput([
          makeTemplate(
            "both",
            { alwaysApply: true, globs: ["src/**"], description: "Both" },
            "Both body",
          ),
        ]),
      );
      expect(files).toHaveLength(1);
      expect(files[0]!.path).toBe("AGENTS.md");
    });

    it("mixed alwaysApply + glob templates → root AGENTS.md + per-dir AGENTS.override.md", async () => {
      const files = await consolidate(
        makeInput([
          makeTemplate("global", { alwaysApply: true, description: "Global" }, "Global body"),
          makeTemplate("scoped", { globs: ["src/**"], description: "Scoped" }, "Scoped body"),
        ]),
      );
      expect(files).toHaveLength(2);
      const paths = files.map((f) => f.path).sort();
      expect(paths).toEqual(["AGENTS.md", "src/AGENTS.override.md"]);
    });

    it("description falls back to template name when missing", async () => {
      const files = await consolidate(
        makeInput([makeTemplate("nameless", { alwaysApply: true }, "Body")]),
      );
      expect(files[0]!.content).toContain("## nameless");
    });
  });

  describe("skills consolidate", () => {
    const consolidate = codex.skills!.consolidate as NonNullable<TemplateTypeConfig["consolidate"]>;

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

    it("frontmatter contains version, author, license when set", async () => {
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
            },
            "Body",
          ),
        ]),
      );
      const skill = files.find((f) => f.path.endsWith("SKILL.md"))!;
      expect(skill.content).toContain('version: "1.0.0"');
      expect(skill.content).toContain('author: "alice"');
      expect(skill.content).toContain('license: "MIT"');
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
      const template: ConsolidateInput["templates"][number] = {
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

  describe("agents consolidate", () => {
    const consolidate = codex.agents!.consolidate as NonNullable<TemplateTypeConfig["consolidate"]>;

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
        makeInput([makeTemplate("a", { description: "A", model: "gpt-5.4" }, "Body")]),
      );
      const parsed = parseToml(files[0]!.content) as Record<string, unknown>;
      expect(parsed.model).toBe("gpt-5.4");
    });

    it("Claude-shaped model emits warning but value still passes through", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const files = await consolidate(
        makeInput([makeTemplate("a", { description: "A", model: "claude-sonnet-4-6" }, "Body")]),
      );
      const parsed = parseToml(files[0]!.content) as Record<string, unknown>;
      expect(parsed.model).toBe("claude-sonnet-4-6");
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

    it("sandboxMode → sandbox_mode", async () => {
      const files = await consolidate(
        makeInput([
          makeTemplate("a", { description: "A", sandboxMode: "workspace-write" }, "Body"),
        ]),
      );
      const parsed = parseToml(files[0]!.content) as Record<string, unknown>;
      expect(parsed.sandbox_mode).toBe("workspace-write");
    });

    it("effort: 'medium' auto-maps to model_reasoning_effort", async () => {
      const files = await consolidate(
        makeInput([makeTemplate("a", { description: "A", effort: "medium" }, "Body")]),
      );
      const parsed = parseToml(files[0]!.content) as Record<string, unknown>;
      expect(parsed.model_reasoning_effort).toBe("medium");
    });

    it("effort: 'max' (Claude-only) dropped with warning, no model_reasoning_effort emitted", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const files = await consolidate(
        makeInput([makeTemplate("a", { description: "A", effort: "max" }, "Body")]),
      );
      const parsed = parseToml(files[0]!.content) as Record<string, unknown>;
      expect(parsed.model_reasoning_effort).toBeUndefined();
      warnSpy.mockRestore();
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

    it("mcpServers → mcp_servers", async () => {
      const files = await consolidate(
        makeInput([
          makeTemplate(
            "a",
            { description: "A", mcpServers: { github: { url: "https://x" } } },
            "Body",
          ),
        ]),
      );
      const parsed = parseToml(files[0]!.content) as Record<string, unknown>;
      expect(parsed.mcp_servers).toEqual({ github: { url: "https://x" } });
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

    it("uses outputDir from ConsolidateInput when overriding default", async () => {
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
      const result = transform(hooks) as { hooks: Record<string, unknown> };
      expect(result.hooks).toHaveProperty("SessionStart");
      expect(result.hooks).toHaveProperty("UserPromptSubmit");
      expect(result.hooks).toHaveProperty("PreToolUse");
      expect(result.hooks).toHaveProperty("PostToolUse");
      expect(result.hooks).toHaveProperty("PermissionRequest");
      expect(result.hooks).toHaveProperty("Stop");
    });

    it("drops unsupported events silently", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        sessionEnd: [{ command: "a.sh" }],
        subagentStart: [{ command: "b.sh" }],
        preCompact: [{ command: "c.sh" }],
        preToolUse: [{ command: "d.sh" }],
      };
      const result = transform(hooks) as { hooks: Record<string, unknown> };
      expect(result.hooks).toHaveProperty("PreToolUse");
      expect(result.hooks).not.toHaveProperty("SessionEnd");
      expect(result.hooks).not.toHaveProperty("SubagentStart");
      expect(result.hooks).not.toHaveProperty("PreCompact");
    });

    it("type: 'command' handlers pass through", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [{ type: "command", command: "x.sh", timeout: 30 }],
      };
      const result = transform(hooks) as {
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
      const result = transform(hooks) as {
        hooks: { PreToolUse: Array<{ hooks: Array<Record<string, unknown>> }> };
      };
      expect(result.hooks.PreToolUse[0]!.hooks[0]!.type).toBe("command");
    });

    it("non-command handler types dropped with warning", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [
          { type: "http", url: "https://x", command: "n/a" },
          { type: "mcp_tool", server: "s", tool: "t", command: "n/a" },
          { type: "prompt", prompt: "go", command: "n/a" },
          { type: "command", command: "kept.sh" },
        ],
      };
      const result = transform(hooks) as {
        hooks: { PreToolUse: Array<{ hooks: Array<Record<string, unknown>> }> };
      };
      // Only one handler should survive (the type: "command" one)
      expect(result.hooks.PreToolUse[0]!.hooks).toHaveLength(1);
      expect(result.hooks.PreToolUse[0]!.hooks[0]!.command).toBe("kept.sh");
      warnSpy.mockRestore();
    });

    it("command + args flattened into single shell-escaped string", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [{ command: "echo", args: ["hello world", "it's me"] }],
      };
      const result = transform(hooks) as {
        hooks: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> };
      };
      const cmd = result.hooks.PreToolUse[0]!.hooks[0]!.command;
      expect(cmd).toBe(`echo 'hello world' 'it'\\''s me'`);
    });

    it("simple args don't need quoting", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [{ command: "lint", args: ["--fix", "src/main.ts"] }],
      };
      const result = transform(hooks) as {
        hooks: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> };
      };
      expect(result.hooks.PreToolUse[0]!.hooks[0]!.command).toBe("lint --fix src/main.ts");
    });

    it("statusMessage passes through", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [{ command: "x.sh", statusMessage: "checking…" }],
      };
      const result = transform(hooks) as {
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
      const result = transform(hooks) as {
        hooks: { PreToolUse: Array<{ matcher?: string; hooks: unknown[] }> };
      };
      const groups = result.hooks.PreToolUse;
      expect(groups).toHaveLength(2);
      const bashGroup = groups.find((g) => g.matcher === "Bash");
      const globalGroup = groups.find((g) => !g.matcher);
      expect(bashGroup?.hooks).toHaveLength(2);
      expect(globalGroup?.hooks).toHaveLength(1);
    });

    it("Claude-specific handler fields dropped silently", () => {
      const hooks: Record<string, UniversalHookHandler[]> = {
        preToolUse: [
          {
            command: "x.sh",
            async: true,
            asyncRewake: true,
            shell: "bash",
            if: "Bash(*)",
            once: true,
          },
        ],
      };
      const result = transform(hooks) as {
        hooks: { PreToolUse: Array<{ hooks: Array<Record<string, unknown>> }> };
      };
      const entry = result.hooks.PreToolUse[0]!.hooks[0]!;
      expect(entry.async).toBeUndefined();
      expect(entry.asyncRewake).toBeUndefined();
      expect(entry.shell).toBeUndefined();
      expect(entry.if).toBeUndefined();
      expect(entry.once).toBeUndefined();
    });
  });

  describe("mcp transform", () => {
    const transform = codex.mcp!.transform;

    it("wraps output in mcp_servers key (TOML-shaped)", () => {
      const result = transform({}) as Record<string, unknown>;
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
      const result = transform(servers) as {
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
      const result = transform(servers) as {
        mcp_servers: Record<string, Record<string, unknown>>;
      };
      expect(result.mcp_servers.s!.http_headers).toEqual({ Authorization: "Bearer x" });
      expect(result.mcp_servers.s!.headers).toBeUndefined();
    });

    it("drops type field silently (Codex infers from command/url)", () => {
      const servers: Record<string, UniversalMCPServer> = {
        s: { type: "stdio", command: "node" },
      };
      const result = transform(servers) as {
        mcp_servers: Record<string, Record<string, unknown>>;
      };
      expect(result.mcp_servers.s!.type).toBeUndefined();
    });

    it("maps all 13 new Codex MCP fields with snake_case keys", () => {
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
          experimentalEnvironment: "remote",
        },
      };
      const result = transform(servers) as {
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
      expect(s.experimental_environment).toBe("remote");
    });

    it("oauth field dropped with warning", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const servers: Record<string, UniversalMCPServer> = {
        s: { url: "https://x", oauth: { clientId: "id" } },
      };
      const result = transform(servers) as {
        mcp_servers: Record<string, Record<string, unknown>>;
      };
      expect(result.mcp_servers.s!.oauth).toBeUndefined();
      warnSpy.mockRestore();
    });

    it("auth field dropped with warning", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const servers: Record<string, UniversalMCPServer> = {
        s: { url: "https://x", auth: { CLIENT_ID: "id" } },
      };
      const result = transform(servers) as {
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
      const result = transform(servers) as {
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
      const result = transform(servers) as {
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
