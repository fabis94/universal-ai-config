import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { generate } from "../../src/core/generate.js";
import { expectYamlField } from "../test-helpers.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures/complete-complex-project");

describe("per-target overrides", () => {
  describe("instructions", () => {
    it("claude: resolves per-target description and globs", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["instructions"],
      });

      const rule = files.find((f) => f.path.includes("per-target"));
      expect(rule).toBeDefined();
      expectYamlField(rule!.content, "description", "Use Claude Code conventions");
      expect(rule!.content).toContain("paths:");
      // Allow for quoted array items with special chars
      expect(rule!.content).toMatch(/\s+-\s+"?\*\*\/\*\.ts"?/);
      expect(rule!.content).not.toContain("**/*.tsx");
    });

    it("copilot: resolves per-target description and globs", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["instructions"],
      });

      const rule = files.find((f) => f.path.includes("per-target"));
      expect(rule).toBeDefined();
      expectYamlField(rule!.content, "description", "Use Copilot conventions");
      // Allow for quoted values with special chars
      expect(rule!.content).toMatch(/applyTo:\s*"?.*\*\*\/\*\.ts.*\*\*\/\*\.tsx"?/);
    });

    it("cursor: resolves per-target description and globs", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["cursor"],
        types: ["instructions"],
      });

      const rule = files.find((f) => f.path.includes("per-target"));
      expect(rule).toBeDefined();
      expectYamlField(rule!.content, "description", "Use Cursor conventions");
      // Allow for quoted values with special chars
      expect(rule!.content).toMatch(/globs:\s*"?\*\*\/\*\.ts"?/);
    });
  });

  describe("skills", () => {
    it("claude: resolves per-target description, model, allowedTools, disableAutoInvocation", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["skills"],
      });

      const skill = files.find((f) => f.type === "skills");
      expect(skill).toBeDefined();
      const c = skill!.content;

      expectYamlField(c, "description", "Claude test generation skill");
      expectYamlField(c, "model", "sonnet");
      expect(c).toContain("allowed-tools:");
      expect(c).toContain("  - ");
      expect(c).toContain("disable-model-invocation: true");
    });

    it("copilot: resolves per-target description, disableAutoInvocation, and argumentHint", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["skills"],
      });

      const skill = files.find((f) => f.type === "skills");
      expect(skill).toBeDefined();
      const c = skill!.content;

      expectYamlField(c, "description", "Copilot test generation skill");
      expect(c).toContain("disable-model-invocation: true");
      expectYamlField(c, "argument-hint", "<file> [--verbose]");
      expectYamlField(c, "license", "MIT");
      // model only set for claude, so copilot shouldn't have it
      expect(c).not.toContain("model:");
    });

    it("cursor: resolves per-target disableAutoInvocation", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["cursor"],
        types: ["skills"],
      });

      const skill = files.find((f) => f.type === "skills");
      expect(skill).toBeDefined();
      const c = skill!.content;

      expectYamlField(c, "description", "Cursor test generation skill");
      expect(c).toContain("disable-model-invocation: true");
      expectYamlField(c, "license", "MIT");
    });
  });

  describe("agents", () => {
    it("claude: resolves per-target tools, model, description, and claude-only fields", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["agents"],
      });

      const agent = files.find((f) => f.type === "agents");
      expect(agent).toBeDefined();
      const c = agent!.content;

      expectYamlField(c, "description", "Claude code reviewer");
      expectYamlField(c, "model", "opus");
      expect(c).toContain("tools:");
      expect(c).toContain("  - ");
      expectYamlField(c, "permissionMode", "acceptEdits");
      expect(c).toContain("skills:");
      expectYamlField(c, "memory", "project");
      // Claude shouldn't have copilot fields
      expect(c).not.toMatch(/^target:/m);
      expect(c).not.toContain("mcp-servers:");
      expect(c).not.toContain("handoffs:");
    });

    it("copilot: resolves per-target tools, model, description, and copilot-only fields", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["agents"],
      });

      const agent = files.find((f) => f.type === "agents");
      expect(agent).toBeDefined();
      const c = agent!.content;

      expectYamlField(c, "description", "Copilot code reviewer");
      expectYamlField(c, "model", "gpt-4o");
      // tools falls back to default for copilot
      expect(c).toContain("tools:");
      expect(c).toContain("  - ");
      expectYamlField(c, "target", "Review code for quality");
      expect(c).toContain("mcp-servers:");
      expect(c).toContain("handoffs:");
      // Copilot shouldn't have claude fields
      expect(c).not.toContain("permissionMode:");
      expect(c).not.toContain("skills:");
      expect(c).not.toContain("memory:");
    });
  });

  describe("mcp", () => {
    it("claude: resolves per-target command/args, includes claude-only server", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["mcp"],
      });

      const mcp = files.find((f) => f.type === "mcp");
      expect(mcp).toBeDefined();
      const parsed = JSON.parse(mcp!.content);

      // my-api: uses default command/args
      expect(parsed.mcpServers["my-api"].command).toBe("npx");
      expect(parsed.mcpServers["my-api"].args).toEqual(["-y", "@my/server"]);
      expect(parsed.mcpServers["my-api"].type).toBe("stdio");

      // claude-only: command defined for claude
      expect(parsed.mcpServers).toHaveProperty("claude-only");
      expect(parsed.mcpServers["claude-only"].command).toBe("npx");
    });

    it("copilot: resolves per-target command, drops claude-only server", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["mcp"],
      });

      const mcp = files.find((f) => f.type === "mcp");
      expect(mcp).toBeDefined();
      const parsed = JSON.parse(mcp!.content);

      expect(parsed.servers["my-api"].command).toBe("npx");
      expect(parsed.servers["my-api"].type).toBe("stdio");
      // claude-only has no command for copilot -> dropped
      expect(parsed.servers).not.toHaveProperty("claude-only");
    });

    it("cursor: resolves cursor-specific command and args, drops claude-only", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["cursor"],
        types: ["mcp"],
      });

      const mcp = files.find((f) => f.type === "mcp");
      expect(mcp).toBeDefined();
      const parsed = JSON.parse(mcp!.content);

      expect(parsed.mcpServers["my-api"].command).toBe("node");
      expect(parsed.mcpServers["my-api"].args).toEqual(["./mcp-server.js"]);
      // Cursor omits type
      expect(parsed.mcpServers["my-api"]).not.toHaveProperty("type");
      // claude-only has no command for cursor -> dropped
      expect(parsed.mcpServers).not.toHaveProperty("claude-only");
    });
  });

  describe("hooks", () => {
    it("claude: resolves per-target command, matcher, timeout", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["hooks"],
      });

      const hooks = files.find((f) => f.type === "hooks");
      expect(hooks).toBeDefined();
      const parsed = JSON.parse(hooks!.content);
      const h = parsed.hooks;

      // preToolUse: command, matcher, timeout all per-target
      const preToolUse = h.PreToolUse[0];
      expect(preToolUse.matcher).toBe("Bash");
      expect(preToolUse.hooks[0].command).toBe(".hooks/claude-check.sh");
      expect(preToolUse.hooks[0].timeout).toBe(30);

      // postToolUse: command per-target (claude has it), timeout global
      expect(h).toHaveProperty("PostToolUse");
      const postToolUse = h.PostToolUse[0];
      expect(postToolUse.hooks[0].command).toBe(".hooks/claude-lint.sh");
      expect(postToolUse.hooks[0].timeout).toBe(45);

      // sessionStart: all global values
      expect(h).toHaveProperty("SessionStart");
    });

    it("copilot: drops handlers when command missing for target", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["hooks"],
      });

      const hooks = files.find((f) => f.type === "hooks");
      expect(hooks).toBeDefined();
      const parsed = JSON.parse(hooks!.content);
      const h = parsed.hooks;

      // preToolUse: copilot has command
      expect(h).toHaveProperty("preToolUse");
      expect(h.preToolUse[0].bash).toBe(".hooks/copilot-check.sh");
      // matcher was { claude, cursor } — copilot gets no matcher (dropped)
      expect(h.preToolUse[0]).not.toHaveProperty("matcher");

      // postToolUse: copilot falls back to default command
      expect(h).toHaveProperty("postToolUse");
      expect(h.postToolUse[0].bash).toBe(".hooks/lint.sh");
      expect(h.postToolUse[0].timeoutSec).toBe(45);

      // sessionStart: global command works for all
      expect(h).toHaveProperty("sessionStart");
      expect(h.sessionStart[0].bash).toBe(".hooks/init.sh");
    });

    it("cursor: resolves per-target command and timeout", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["cursor"],
        types: ["hooks"],
      });

      const hooks = files.find((f) => f.type === "hooks");
      expect(hooks).toBeDefined();
      const parsed = JSON.parse(hooks!.content);
      const h = parsed.hooks;

      // preToolUse: cursor-specific values
      expect(h.preToolUse[0].command).toBe(".hooks/cursor-check.sh");
      expect(h.preToolUse[0].matcher).toBe("Bash");
      expect(h.preToolUse[0].timeout).toBe(60);

      // postToolUse: cursor has command, global timeout
      expect(h.postToolUse[0].command).toBe(".hooks/cursor-lint.sh");
      expect(h.postToolUse[0].timeout).toBe(45);

      // sessionStart: global values
      expect(h.sessionStart[0].command).toBe(".hooks/init.sh");
    });
  });
});
