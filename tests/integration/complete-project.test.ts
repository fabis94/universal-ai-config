import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { generate } from "../../src/core/generate.js";

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
      expect(globRule!.content).toContain("description: Security review rules");
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
      expect(globRule!.content).toContain("applyTo: **/*.ts, **/*.js");
      expect(globRule!.content).toContain("excludeAgent: code-review");
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

      expect(c).toContain("name: deploy-helper");
      expect(c).toContain("description: Assists with deployment tasks");
      expect(c).toContain("disable-model-invocation: true");
      expect(c).toContain("user-invocable: /deploy");
      expect(c).toContain("allowed-tools:");
      expect(c).toContain("  - bash");
      expect(c).toContain("  - read");
      expect(c).toContain("  - write");
      expect(c).toContain("model: sonnet");
      expect(c).toContain("agent: task");
      expect(c).toContain("context: fork");
      expect(c).toContain("argument-hint: <environment> [--dry-run]");
      expect(c).toContain("hooks:");

      // Claude doesn't map license, compatibility, or metadata
      expect(c).not.toContain("license:");
      expect(c).not.toContain("compatibility:");
      expect(c).not.toContain("metadata:");
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

      expect(c).toContain("name: deploy-helper");
      expect(c).toContain("description: Assists with deployment tasks");
      expect(c).toContain("license: MIT");
      expect(c).toContain("compatibility: >=1.0.0");
      expect(c).toContain("metadata:");

      // Copilot doesn't map claude-specific fields
      expect(c).not.toContain("disable-model-invocation");
      expect(c).not.toContain("user-invocable");
      expect(c).not.toContain("allowed-tools");
      expect(c).not.toContain("agent:");
      expect(c).not.toContain("context:");
      expect(c).not.toContain("argument-hint");
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

      expect(c).toContain("name: deploy-helper");
      expect(c).toContain("description: Assists with deployment tasks");
      expect(c).toContain("disable-model-invocation: true");
      expect(c).toContain("license: MIT");
      expect(c).toContain("compatibility: >=1.0.0");
      expect(c).toContain("metadata:");

      // Cursor doesn't map claude-specific fields
      expect(c).not.toContain("user-invocable");
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

      expect(c).toContain("name: project-manager");
      expect(c).toContain("description: Manages project tasks and coordination");
      expect(c).toContain("model: opus");
      expect(c).toContain("tools:");
      expect(c).toContain("  - read");
      expect(c).toContain("  - write");
      expect(c).toContain("  - bash");
      expect(c).toContain("  - glob");
      expect(c).toContain("disallowedTools:");
      expect(c).toContain("  - web-search");
      expect(c).toContain("permissionMode: acceptEdits");
      expect(c).toContain("skills:");
      expect(c).toContain("  - deploy-helper");
      expect(c).toContain("  - test-generation");
      expect(c).toContain("hooks:");
      expect(c).toContain("memory: project");

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

      expect(c).toContain("name: project-manager");
      expect(c).toContain("description: Manages project tasks and coordination");
      expect(c).toContain("model: opus");
      expect(c).toContain("tools:");
      expect(c).toContain("target: Manage and coordinate project tasks");
      expect(c).toContain("mcp-servers:");
      expect(c).toContain("handoffs:");
      expect(c).toContain("  - code-reviewer");
      expect(c).toContain("  - deploy-helper");

      // Copilot doesn't map claude-specific fields
      expect(c).not.toContain("disallowedTools:");
      expect(c).not.toContain("permissionMode:");
      expect(c).not.toContain("skills:");
      expect(c).not.toContain("hooks:");
      expect(c).not.toContain("memory:");
    });

    it("cursor: skips agents entirely", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["cursor"],
        types: ["agents"],
      });

      const cursorAgents = files.filter((f) => f.type === "agents" && f.target === "cursor");
      expect(cursorAgents).toHaveLength(0);
    });
  });
});
