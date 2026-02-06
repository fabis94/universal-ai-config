import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { generate } from "../../src/core/generate.js";

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
      expect(rule!.content).toContain("description: Use Claude Code conventions");
      expect(rule!.content).toContain("paths:");
      expect(rule!.content).toContain("  - **/*.ts");
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
      expect(rule!.content).toContain("description: Use Copilot conventions");
      expect(rule!.content).toContain("applyTo: **/*.ts, **/*.tsx");
    });

    it("cursor: resolves per-target description and globs", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["cursor"],
        types: ["instructions"],
      });

      const rule = files.find((f) => f.path.includes("per-target"));
      expect(rule).toBeDefined();
      expect(rule!.content).toContain("description: Use Cursor conventions");
      expect(rule!.content).toContain("globs: **/*.ts");
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

      expect(c).toContain("description: Claude test generation skill");
      expect(c).toContain("model: sonnet");
      expect(c).toContain("allowed-tools:");
      expect(c).toContain("  - bash");
      expect(c).toContain("disable-model-invocation: true");
    });

    it("copilot: resolves per-target description, drops fields missing for copilot", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["skills"],
      });

      const skill = files.find((f) => f.type === "skills");
      expect(skill).toBeDefined();
      const c = skill!.content;

      expect(c).toContain("description: Copilot test generation skill");
      expect(c).toContain("license: MIT");
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

      expect(c).toContain("description: Cursor test generation skill");
      expect(c).toContain("disable-model-invocation: true");
      expect(c).toContain("license: MIT");
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

      expect(c).toContain("description: Claude code reviewer");
      expect(c).toContain("model: opus");
      expect(c).toContain("tools:");
      expect(c).toContain("  - Read");
      expect(c).toContain("  - Grep");
      expect(c).toContain("  - Glob");
      expect(c).toContain("permissionMode: acceptEdits");
      expect(c).toContain("skills:");
      expect(c).toContain("memory: project");
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

      expect(c).toContain("description: Copilot code reviewer");
      expect(c).toContain("model: gpt-4o");
      // tools falls back to default for copilot
      expect(c).toContain("tools:");
      expect(c).toContain("  - read");
      expect(c).toContain("  - grep");
      expect(c).toContain("  - glob");
      expect(c).toContain("target: Review code for quality");
      expect(c).toContain("mcp-servers:");
      expect(c).toContain("handoffs:");
      // Copilot shouldn't have claude fields
      expect(c).not.toContain("permissionMode:");
      expect(c).not.toContain("skills:");
      expect(c).not.toContain("memory:");
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
