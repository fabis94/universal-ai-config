import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { generate } from "../../src/core/generate.js";
import { expectYamlField } from "../test-helpers.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures/basic-project");

describe("generate", () => {
  it("generates files for all targets", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["claude", "copilot", "cursor"],
      types: ["instructions", "skills", "agents"],
    });

    expect(files.length).toBeGreaterThan(0);

    // Check each file has required properties
    for (const file of files) {
      expect(file.path).toBeTruthy();
      expect(file.content).toBeTruthy();
      expect(file.target).toBeTruthy();
      expect(file.type).toBeTruthy();
      expect(file.sourcePath).toBeTruthy();
    }
  });

  it("generates claude instruction files correctly", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["claude"],
      types: ["instructions"],
    });

    const alwaysRule = files.find((f) => f.path.includes("always-rule"));
    expect(alwaysRule).toBeDefined();
    expect(alwaysRule!.path).toBe(".claude/rules/always-rule.md");
    expectYamlField(alwaysRule!.content, "description", "Always applied coding standards");
    // alwaysApply should result in no paths field for claude
    expect(alwaysRule!.content).not.toContain("paths:");
    // EJS should render claude-specific content
    expect(alwaysRule!.content).toContain("Use the Read tool");

    const globRule = files.find((f) => f.path.includes("glob-rule"));
    expect(globRule).toBeDefined();
    expect(globRule!.path).toBe(".claude/rules/glob-rule.md");
    expect(globRule!.content).toContain("paths:");
  });

  it("generates copilot instruction files correctly", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["copilot"],
      types: ["instructions"],
    });

    // alwaysApply should go to copilot-instructions.md
    const alwaysRule = files.find((f) => f.path.includes("copilot-instructions.md"));
    expect(alwaysRule).toBeDefined();
    expect(alwaysRule!.content).toContain("Check existing patterns");
    expect(alwaysRule!.content).not.toContain("Use the Read tool");

    // glob rule should go to instructions/
    const globRule = files.find((f) => f.path.includes("glob-rule"));
    expect(globRule).toBeDefined();
    expect(globRule!.path).toBe(".github/instructions/glob-rule.instructions.md");
    expect(globRule!.content).toContain("applyTo:");
  });

  it("generates cursor instruction files with .mdc extension", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["cursor"],
      types: ["instructions"],
    });

    const globRule = files.find((f) => f.path.includes("glob-rule"));
    expect(globRule).toBeDefined();
    expect(globRule!.path).toBe(".cursor/rules/glob-rule.mdc");
    expect(globRule!.content).toContain("globs:");
  });

  it("skips agents for cursor target", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["cursor"],
      types: ["agents"],
    });

    const agentFiles = files.filter((f) => f.type === "agents" && f.target === "cursor");
    expect(agentFiles).toHaveLength(0);
  });

  it("generates skills correctly", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["claude"],
      types: ["skills"],
    });

    const skill = files.find((f) => f.type === "skills" && f.path.endsWith("SKILL.md"));
    expect(skill).toBeDefined();
    expect(skill!.path).toBe(".claude/skills/test-gen/SKILL.md");
    expect(skill!.content).toContain("disable-model-invocation: true");
    expectYamlField(skill!.content, "user-invocable", "/test");
  });

  describe("skill extra files", () => {
    it("copies .md extra files with EJS rendering", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["skills"],
      });

      const extraMd = files.find((f) => f.path.includes("references/example.md"));
      expect(extraMd).toBeDefined();
      expect(extraMd!.path).toBe(".claude/skills/test-gen/references/example.md");
      expect(extraMd!.target).toBe("claude");
      expect(extraMd!.type).toBe("skills");
      // EJS should be rendered — target variable replaced
      expect(extraMd!.content).toContain("Target: claude");
      expect(extraMd!.content).not.toContain("<%= target %>");
    });

    it("copies non-.md extra files as raw content", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["skills"],
      });

      const extraTxt = files.find((f) => f.path.includes("data/sample.txt"));
      expect(extraTxt).toBeDefined();
      expect(extraTxt!.path).toBe(".claude/skills/test-gen/references/data/sample.txt");
      expect(extraTxt!.content).toBe(
        "This is raw sample data.\nIt should be copied as-is with no processing.\n",
      );
    });

    it("generates extra files for all targets that support skills", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude", "copilot", "cursor"],
        types: ["skills"],
      });

      for (const target of ["claude", "copilot", "cursor"] as const) {
        const targetDirs: Record<string, string> = {
          claude: ".claude",
          copilot: ".github",
          cursor: ".cursor",
        };
        const dir = targetDirs[target];

        const extraMd = files.find(
          (f) => f.target === target && f.path.includes("references/example.md"),
        );
        expect(extraMd, `${target} should have example.md`).toBeDefined();
        expect(extraMd!.path).toBe(`${dir}/skills/test-gen/references/example.md`);
        // EJS renders target-specific content
        expect(extraMd!.content).toContain(`Target: ${target}`);

        const extraTxt = files.find(
          (f) => f.target === target && f.path.includes("data/sample.txt"),
        );
        expect(extraTxt, `${target} should have sample.txt`).toBeDefined();
        expect(extraTxt!.path).toBe(`${dir}/skills/test-gen/references/data/sample.txt`);
      }
    });
  });

  it("generates agents correctly for claude", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["claude"],
      types: ["agents"],
    });

    const agent = files.find((f) => f.type === "agents");
    expect(agent).toBeDefined();
    expect(agent!.path).toBe(".claude/agents/reviewer.md");
    expectYamlField(agent!.content, "model", "sonnet");
    expect(agent!.content).toContain("tools:");
  });

  it("generates agents correctly for copilot", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["copilot"],
      types: ["agents"],
    });

    const agent = files.find((f) => f.type === "agents");
    expect(agent).toBeDefined();
    expect(agent!.path).toBe(".github/agents/reviewer.agent.md");
  });

  it("filters by type", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["claude"],
      types: ["instructions"],
    });

    expect(files.every((f) => f.type === "instructions")).toBe(true);
  });

  it("throws on unknown target", async () => {
    await expect(
      generate({
        root: FIXTURES_DIR,
        targets: ["nonexistent" as "claude"],
      }),
    ).rejects.toThrow('Unknown target "nonexistent"');
  });

  describe("mcp", () => {
    it("generates claude MCP at .mcp.json with mcpServers wrapper", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["mcp"],
      });

      const mcp = files.find((f) => f.type === "mcp" && f.target === "claude");
      expect(mcp).toBeDefined();
      expect(mcp!.path).toBe(".mcp.json");

      const parsed = JSON.parse(mcp!.content);
      expect(parsed.mcpServers).toHaveProperty("github");
      expect(parsed.mcpServers.github.type).toBe("stdio");
      expect(parsed.mcpServers.github.command).toBe("npx");
      expect(parsed.mcpServers.github.args).toEqual(["-y", "@modelcontextprotocol/server-github"]);
      expect(parsed.mcpServers.github.env.GITHUB_TOKEN).toBe("${GITHUB_TOKEN}");
    });

    it("generates copilot MCP at .vscode/mcp.json with servers wrapper", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["mcp"],
      });

      const mcp = files.find((f) => f.type === "mcp" && f.target === "copilot");
      expect(mcp).toBeDefined();
      expect(mcp!.path).toBe(".vscode/mcp.json");

      const parsed = JSON.parse(mcp!.content);
      expect(parsed.servers).toHaveProperty("github");
      expect(parsed.servers.github.type).toBe("stdio");
      expect(parsed.servers.github.command).toBe("npx");
    });

    it("sets inputCount on merged types (mcp, hooks) but not 1:1 types", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["mcp", "hooks"],
      });

      const mcp = files.find((f) => f.type === "mcp" && f.target === "claude");
      expect(mcp).toBeDefined();
      // basic-project has 1 input file under .universal-ai-config/mcp
      expect(mcp!.inputCount).toBe(1);

      const hooks = files.find((f) => f.type === "hooks" && f.target === "claude");
      expect(hooks).toBeDefined();
      // basic-project has 1 input file under .universal-ai-config/hooks
      expect(hooks!.inputCount).toBe(1);

      // 1:1 template types should not set inputCount
      const instructionFiles = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["instructions"],
      });
      expect(instructionFiles[0]!.inputCount).toBeUndefined();
    });

    it("generates cursor MCP at .cursor/mcp.json with type field passed through", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["cursor"],
        types: ["mcp"],
      });

      const mcp = files.find((f) => f.type === "mcp" && f.target === "cursor");
      expect(mcp).toBeDefined();
      expect(mcp!.path).toBe(".cursor/mcp.json");

      const parsed = JSON.parse(mcp!.content);
      expect(parsed.mcpServers).toHaveProperty("github");
      // Cursor passes through type when present
      expect(parsed.mcpServers.github.type).toBe("stdio");
      expect(parsed.mcpServers.github.command).toBe("npx");
    });
  });

  describe("inline overrides", () => {
    it("uses inline exclude to filter templates", async () => {
      const allFiles = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["instructions"],
      });
      const filteredFiles = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["instructions"],
        overrides: {
          exclude: ["instructions/always-rule.md"],
        },
      });
      expect(filteredFiles.length).toBeLessThan(allFiles.length);
      expect(filteredFiles.find((f) => f.path.includes("always-rule"))).toBeUndefined();
      expect(filteredFiles.find((f) => f.path.includes("glob-rule"))).toBeDefined();
    });

    it("uses inline outputDirs to change output paths", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["instructions"],
        overrides: {
          outputDirs: { claude: ".custom-claude" },
        },
      });
      expect(files.length).toBeGreaterThan(0);
      expect(files.every((f) => f.path.startsWith(".custom-claude/"))).toBe(true);
    });

    it("uses inline variables in template rendering", async () => {
      const VARIABLES_DIR = join(import.meta.dirname, "../fixtures/variables-project");
      const files = await generate({
        root: VARIABLES_DIR,
        targets: ["claude"],
        types: ["mcp"],
        overrides: {
          variables: { apiHost: "overridden.com" },
        },
      });

      const mcp = files.find((f) => f.type === "mcp" && f.target === "claude");
      expect(mcp).toBeDefined();
      const parsed = JSON.parse(mcp!.content);
      // The overridden variable should take effect
      expect(parsed.mcpServers.api.env.HOST).toBe("host-overridden.com-suffix");
    });
  });

  describe("hooks", () => {
    it("generates claude hooks merged into settings.json format", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["hooks"],
      });

      const hooks = files.find((f) => f.type === "hooks" && f.target === "claude");
      expect(hooks).toBeDefined();
      expect(hooks!.path).toBe(".claude/settings.json");
      expect(hooks!.mergeKey).toBe("hooks");

      const parsed = JSON.parse(hooks!.content);
      expect(parsed.hooks).toHaveProperty("PostToolUse");

      // Should use Claude's nested matcher group structure
      const postToolUse = parsed.hooks.PostToolUse;
      expect(postToolUse[0].matcher).toBe("Write|Edit");
      expect(postToolUse[0].hooks[0]).toEqual({
        type: "command",
        command: ".hooks/lint.sh",
        timeout: 30,
      });
    });

    it("generates cursor hooks with version field", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["cursor"],
        types: ["hooks"],
      });

      const hooks = files.find((f) => f.type === "hooks" && f.target === "cursor");
      expect(hooks).toBeDefined();
      expect(hooks!.path).toBe(".cursor/hooks.json");

      const parsed = JSON.parse(hooks!.content);
      expect(parsed.version).toBe(1);
      expect(parsed.hooks.postToolUse[0]).toEqual({
        type: "command",
        command: ".hooks/lint.sh",
        matcher: "Write|Edit",
        timeout: 30,
      });
    });

    it("generates copilot hooks with bash field", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["hooks"],
      });

      const hooks = files.find((f) => f.type === "hooks" && f.target === "copilot");
      expect(hooks).toBeDefined();
      expect(hooks!.path).toBe(".github/hooks/hooks.json");

      const parsed = JSON.parse(hooks!.content);
      expect(parsed.version).toBe("1");
      expect(parsed.hooks.postToolUse[0]).toEqual({
        type: "command",
        bash: ".hooks/lint.sh",
        timeoutSec: 30,
      });
    });
  });

  describe("codex", () => {
    it("emits AGENTS.md at root for alwaysApply instructions", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["codex"],
        types: ["instructions"],
      });

      const agentsMd = files.find((f) => f.path === "AGENTS.md");
      expect(agentsMd).toBeDefined();
      expect(agentsMd!.target).toBe("codex");
      expect(agentsMd!.type).toBe("instructions");
      expect(agentsMd!.content).toContain("## Always applied coding standards");
    });

    it("emits AGENTS.override.md for glob-scoped instructions", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["codex"],
        types: ["instructions"],
      });

      // basic-project's glob-rule has globs: ["**/*.ts", "**/*.tsx"] (leading
      // wildcards) so it routes to root AGENTS.md, NOT a separate override.
      // Verify it's concatenated into the root file alongside always-rule.
      const agentsMd = files.find((f) => f.path === "AGENTS.md");
      expect(agentsMd).toBeDefined();
      // Both alwaysApply and leading-wildcard contributors are at root
      expect(agentsMd!.content).toContain("Always applied coding standards");
      expect(agentsMd!.content).toContain("TypeScript specific rules");
    });

    it("emits skills at .agents/skills/<name>/SKILL.md (root-relative)", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["codex"],
        types: ["skills"],
      });

      const skill = files.find((f) => f.path.endsWith("SKILL.md"));
      expect(skill).toBeDefined();
      expect(skill!.path).toBe(".agents/skills/test-gen/SKILL.md");
      expect(skill!.target).toBe("codex");
    });

    it("copies skill extra files preserving structure under .agents/skills/", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["codex"],
        types: ["skills"],
      });

      const example = files.find((f) => f.path.includes("references/example.md"));
      const data = files.find((f) => f.path.includes("references/data/sample.txt"));
      expect(example).toBeDefined();
      expect(example!.path).toBe(".agents/skills/test-gen/references/example.md");
      expect(data).toBeDefined();
      expect(data!.path).toBe(".agents/skills/test-gen/references/data/sample.txt");
    });

    it("emits agents as standalone .codex/agents/<name>.toml", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["codex"],
        types: ["agents"],
      });

      const agent = files.find((f) => f.type === "agents" && f.target === "codex");
      expect(agent).toBeDefined();
      expect(agent!.path).toBe(".codex/agents/reviewer.toml");
      // body becomes developer_instructions; standalone TOML format
      expect(agent!.content).toContain('name = "reviewer"');
      expect(agent!.content).toContain("developer_instructions");
      expect(agent!.content).toContain("code reviewer");
    });

    it("emits hooks as plain .codex/hooks.json (no mergeKey)", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["codex"],
        types: ["hooks"],
      });

      const hooks = files.find((f) => f.type === "hooks" && f.target === "codex");
      expect(hooks).toBeDefined();
      expect(hooks!.path).toBe(".codex/hooks.json");
      expect(hooks!.mergeKey).toBeUndefined();

      const parsed = JSON.parse(hooks!.content);
      // PascalCase event names (same casing as Claude). basic-project only
      // has postToolUse defined.
      expect(parsed.hooks).toHaveProperty("PostToolUse");
      expect(parsed.hooks.PostToolUse[0].matcher).toBe("Write|Edit");
      expect(parsed.hooks.PostToolUse[0].hooks[0]).toMatchObject({
        type: "command",
        command: ".hooks/lint.sh",
        timeout: 30,
      });
    });

    it("emits MCP as TOML in .codex/config.toml with mergeKey: mcp_servers", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["codex"],
        types: ["mcp"],
      });

      const mcp = files.find((f) => f.type === "mcp" && f.target === "codex");
      expect(mcp).toBeDefined();
      expect(mcp!.path).toBe(".codex/config.toml");
      expect(mcp!.mergeKey).toBe("mcp_servers");
      expect(mcp!.mergeFormat).toBe("toml");
      // TOML content contains the [mcp_servers.github] table
      expect(mcp!.content).toContain("[mcp_servers.github]");
      expect(mcp!.content).toContain('command = "npx"');
    });
  });
});
