import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { generate } from "../../src/core/generate/index.js";
import { expectYamlField } from "../test-helpers.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures/complete-project");

describe("complete-project (all frontmatter fields)", () => {
  describe("instructions", () => {
    it("claude: maps globs to paths and drops excludeAgent", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["instructions"],
      });

      const globRule = files.find((f) => f.path.includes("glob-with-exclude"));
      expect(globRule).toBeDefined();
      expect(globRule!.path).toBe(".claude/rules/glob-with-exclude.md");
      expectYamlField(globRule!.content, "description", "Security review rules");
      expect(globRule!.content).toContain("paths:");
      // Claude doesn't support excludeAgent
      expect(globRule!.content).not.toContain("excludeAgent");
      expect(globRule!.content).not.toContain("code-review");
    });

    it("copilot: maps globs to applyTo and preserves excludeAgent", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["instructions"],
      });

      const globRule = files.find((f) => f.path.includes("glob-with-exclude"));
      expect(globRule).toBeDefined();
      expect(globRule!.path).toBe(".github/instructions/glob-with-exclude.instructions.md");
      // Allow for quoted values - yaml quotes strings with special chars
      expect(globRule!.content).toMatch(/applyTo:\s*"?.*\*\*\/\*\.ts.*\*\*\/\*\.js"?/);
      expect(globRule!.content).toMatch(/excludeAgent:\s*"?code-review"?/);
    });

    it("cursor: maps globs directly and drops excludeAgent", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["cursor"],
        types: ["instructions"],
      });

      const globRule = files.find((f) => f.path.includes("glob-with-exclude"));
      expect(globRule).toBeDefined();
      expect(globRule!.path).toBe(".cursor/rules/glob-with-exclude.mdc");
      expect(globRule!.content).toContain("globs:");
      expect(globRule!.content).not.toContain("excludeAgent");
    });

    it("copilot: routes alwaysApply to copilot-instructions.md", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["instructions"],
      });

      const always = files.find((f) => f.path.includes("copilot-instructions.md"));
      expect(always).toBeDefined();
      expect(always!.path).toBe(".github/copilot-instructions.md");
    });

    it("cursor: renders EJS with alwaysApply field", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["cursor"],
        types: ["instructions"],
      });

      const always = files.find((f) => f.path.includes("always-applied"));
      expect(always).toBeDefined();
      expect(always!.content).toContain("alwaysApply: true");
      expect(always!.content).toContain("Use Cursor's built-in refactoring tools");
    });
  });

  describe("skills", () => {
    it("claude: maps all claude-specific skill fields", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["skills"],
      });

      const skill = files.find((f) => f.type === "skills");
      expect(skill).toBeDefined();
      expect(skill!.path).toBe(".claude/skills/deploy-helper/SKILL.md");
      const c = skill!.content;

      expectYamlField(c, "name", "deploy-helper");
      expectYamlField(c, "description", "Assists with deployment tasks");
      expect(c).toContain("disable-model-invocation: true");
      expect(c).toContain("user-invocable: true");
      expect(c).toContain("allowed-tools:");
      expect(c).toContain("  - ");
      expectYamlField(c, "model", "sonnet");
      expectYamlField(c, "agent", "task");
      expectYamlField(c, "context", "fork");
      expectYamlField(c, "argument-hint", "<environment> [--dry-run]");
      expect(c).toContain("hooks:");

      // Agent Skills spec fields Claude accepts
      expect(c).toContain("license:");
      expect(c).toContain("compatibility:");
      expect(c).toContain("metadata:");
    });

    it("copilot: maps copilot-specific skill fields only", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["skills"],
      });

      const skill = files.find((f) => f.type === "skills");
      expect(skill).toBeDefined();
      expect(skill!.path).toBe(".github/skills/deploy-helper/SKILL.md");
      const c = skill!.content;

      expectYamlField(c, "name", "deploy-helper");
      expectYamlField(c, "description", "Assists with deployment tasks");
      expect(c).toContain("disable-model-invocation: true");
      expect(c).toContain("user-invocable: true");
      expectYamlField(c, "argument-hint", "<environment> [--dry-run]");
      expectYamlField(c, "license", "MIT");
      expectYamlField(c, "compatibility", ">=1.0.0");
      expect(c).toContain("metadata:");

      // Copilot now maps forkContext as context: "fork"
      expect(c).toContain('context: "fork"');

      // Copilot doesn't map claude-specific fields
      expect(c).toContain("allowed-tools");
      expect(c).not.toContain("agent:");
      expect(c).not.toContain("hooks:");
    });

    it("cursor: maps cursor-specific skill fields only", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["cursor"],
        types: ["skills"],
      });

      const skill = files.find((f) => f.type === "skills");
      expect(skill).toBeDefined();
      expect(skill!.path).toBe(".cursor/skills/deploy-helper/SKILL.md");
      const c = skill!.content;

      expectYamlField(c, "name", "deploy-helper");
      expectYamlField(c, "description", "Assists with deployment tasks");
      expect(c).toContain("disable-model-invocation: true");
      expectYamlField(c, "license", "MIT");
      expectYamlField(c, "compatibility", ">=1.0.0");
      expect(c).toContain("metadata:");

      // Cursor doesn't map claude-specific fields
      // Cursor (CLI) honours user-invocable
      expect(c).toContain("user-invocable");
      expect(c).not.toContain("allowed-tools");
      expect(c).not.toContain("agent:");
      expect(c).not.toContain("context:");
      expect(c).not.toContain("argument-hint");
      expect(c).not.toContain("hooks:");
    });
  });

  describe("agents", () => {
    it("claude: maps all claude-specific agent fields", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["agents"],
      });

      const agent = files.find((f) => f.type === "agents");
      expect(agent).toBeDefined();
      expect(agent!.path).toBe(".claude/agents/full-agent.md");
      const c = agent!.content;

      expectYamlField(c, "name", "project-manager");
      expectYamlField(c, "description", "Manages project tasks and coordination");
      expectYamlField(c, "model", "opus");
      expect(c).toContain("tools:");
      expect(c).toContain("  - ");
      expect(c).toContain("disallowedTools:");
      expectYamlField(c, "permissionMode", "acceptEdits");
      expect(c).toContain("skills:");
      expect(c).toContain("hooks:");
      expectYamlField(c, "memory", "project");

      // Claude doesn't map target, mcpServers, handoffs
      expect(c).not.toMatch(/^target:/m);
      expect(c).not.toContain("mcp-servers:");
      expect(c).not.toContain("handoffs:");
    });

    it("copilot: maps all copilot-specific agent fields", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["agents"],
      });

      const agent = files.find((f) => f.type === "agents");
      expect(agent).toBeDefined();
      expect(agent!.path).toBe(".github/agents/full-agent.agent.md");
      const c = agent!.content;

      expectYamlField(c, "name", "project-manager");
      expectYamlField(c, "description", "Manages project tasks and coordination");
      expectYamlField(c, "model", "opus");
      expect(c).toContain("tools:");
      expectYamlField(c, "target", "github-copilot");
      expect(c).toContain("mcp-servers:");
      expect(c).toContain("hooks:");
      expect(c).toContain("skills:");
      // Local-harness only: dropped for the default Copilot harness
      expect(c).not.toContain("handoffs:");

      // Copilot doesn't map claude-specific fields
      expect(c).not.toContain("disallowedTools:");
      expect(c).not.toContain("permissionMode:");
      expect(c).not.toContain("memory:");
    });

    it("cursor: writes .cursor/agents with Cursor's fields, line-safe", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["cursor"],
        types: ["agents"],
      });

      const agent = files.find((f) => f.type === "agents" && f.target === "cursor");
      expect(agent!.path).toBe(".cursor/agents/full-agent.md");
      expect(agent!.content).toBe(
        "---\nname: project-manager\ndescription: Manages project tasks and coordination\nmodel: opus\n---\n" +
          "You are a project manager agent. Coordinate tasks across the team and ensure quality.\n",
      );
    });
  });

  describe("hooks", () => {
    it("merges multiple JSON files and generates for all targets", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude", "cursor"],
        types: ["hooks"],
      });
      expect(files.filter((f) => f.type === "hooks")).toHaveLength(2);

      const copilotOnly = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["hooks"],
      });
      expect(copilotOnly.filter((f) => f.type === "hooks")).toHaveLength(1);
    });

    it("claude + copilot: only Claude's hooks file, read by both", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude", "copilot"],
        types: ["hooks"],
        onDiagnostic: () => {},
      });
      expect(files.map((f) => [f.path, f.consumers])).toEqual([
        [".claude/settings.json", ["claude", "copilot"]],
      ]);
    });

    it("claude: PascalCase events, nested matcher groups, merged into settings.json", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["hooks"],
      });

      const hooks = files.find((f) => f.type === "hooks");
      expect(hooks).toBeDefined();
      expect(hooks!.path).toBe(".claude/settings.json");
      expect(hooks!.mergeKey).toBe("hooks");

      const parsed = JSON.parse(hooks!.content);
      const h = parsed.hooks;

      // From security.json
      expect(h).toHaveProperty("PreToolUse");
      expect(h).toHaveProperty("SessionStart");
      // From quality.json
      expect(h).toHaveProperty("PostToolUse");
      expect(h).toHaveProperty("Stop");
      expect(h).toHaveProperty("UserPromptSubmit");

      // Verify nested structure
      const preToolUse = h.PreToolUse[0];
      expect(preToolUse.matcher).toBe("Bash");
      expect(preToolUse.hooks[0].type).toBe("command");
      expect(preToolUse.hooks[0].command).toBe(".hooks/block-rm.sh");
      expect(preToolUse.hooks[0].timeout).toBe(30);

      // SessionStart has no matcher
      const sessionStart = h.SessionStart[0];
      expect(sessionStart.matcher).toBeUndefined();
      expect(sessionStart.hooks[0].command).toBe(".hooks/load-env.sh");
    });

    it("copilot: maps events, uses the cross-platform command field, drops unsupported events", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["hooks"],
      });

      const hooks = files.find((f) => f.type === "hooks");
      expect(hooks).toBeDefined();
      expect(hooks!.path).toBe(".github/hooks/hooks.json");

      const parsed = JSON.parse(hooks!.content);
      expect(parsed.version).toBe(1);

      const h = parsed.hooks;
      expect(h).toHaveProperty("preToolUse");
      expect(h).toHaveProperty("postToolUse");
      expect(h).toHaveProperty("sessionStart");
      // Copilot maps userPromptSubmit → userPromptSubmitted, stop → agentStop
      expect(h).toHaveProperty("userPromptSubmitted");
      expect(h).not.toHaveProperty("userPromptSubmit");
      expect(h).toHaveProperty("agentStop");
      expect(h).not.toHaveProperty("stop");

      expect(h.preToolUse[0].command).toBe(".hooks/block-rm.sh");
      expect(h.preToolUse[0]).not.toHaveProperty("bash");
      expect(h.preToolUse[0].timeoutSec).toBe(30);
      expect(h.preToolUse[0].matcher).toBe("Bash");
    });

    it("cursor: camelCase events, flat handlers, version 1", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["cursor"],
        types: ["hooks"],
      });

      const hooks = files.find((f) => f.type === "hooks");
      expect(hooks).toBeDefined();
      expect(hooks!.path).toBe(".cursor/hooks.json");

      const parsed = JSON.parse(hooks!.content);
      expect(parsed.version).toBe(1);

      const h = parsed.hooks;
      expect(h).toHaveProperty("preToolUse");
      expect(h).toHaveProperty("postToolUse");
      expect(h).toHaveProperty("sessionStart");
      expect(h).toHaveProperty("stop");
      // Cursor maps userPromptSubmit → beforeSubmitPrompt
      expect(h).toHaveProperty("beforeSubmitPrompt");
      expect(h).not.toHaveProperty("userPromptSubmit");

      // Verify flat handler structure with matcher
      expect(h.preToolUse[0]).toEqual({
        type: "command",
        command: ".hooks/block-rm.sh",
        matcher: "Bash",
        timeout: 30,
      });
    });
  });
});
