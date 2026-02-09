import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { generate } from "../../src/core/generate.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures/exclude-project");

describe("exclude config", () => {
  describe("instructions", () => {
    it("claude: excludes instructions/skip-me.md", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["instructions"],
      });

      expect(files.find((f) => f.path.includes("keep-me"))).toBeDefined();
      expect(files.find((f) => f.path.includes("skip-me"))).toBeUndefined();
    });

    it("copilot: does not exclude instructions (only agents excluded)", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["instructions"],
      });

      // Both instructions have alwaysApply, so Copilot routes to copilot-instructions.md
      // Check by sourcePath since output path doesn't contain template name
      expect(files.find((f) => f.sourcePath.includes("keep-me"))).toBeDefined();
      expect(files.find((f) => f.sourcePath.includes("skip-me"))).toBeDefined();
    });

    it("cursor: uses default (empty) — nothing excluded", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["cursor"],
        types: ["instructions"],
      });

      expect(files.find((f) => f.sourcePath.includes("keep-me"))).toBeDefined();
      expect(files.find((f) => f.sourcePath.includes("skip-me"))).toBeDefined();
    });
  });

  describe("agents", () => {
    it("copilot: excludes all agents via agents/** glob", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["agents"],
      });

      const agents = files.filter((f) => f.type === "agents" && f.target === "copilot");
      expect(agents).toHaveLength(0);
    });

    it("claude: does not exclude agents", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["agents"],
      });

      const agents = files.filter((f) => f.type === "agents" && f.target === "claude");
      expect(agents.length).toBeGreaterThan(0);
      expect(agents.find((f) => f.path.includes("secret-agent"))).toBeDefined();
    });
  });

  describe("hooks", () => {
    it("claude: excludes hooks/skip.json, only keep.json hooks present", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["hooks"],
      });

      const hooks = files.find((f) => f.type === "hooks" && f.target === "claude");
      expect(hooks).toBeDefined();
      const parsed = JSON.parse(hooks!.content);
      // keep.json has postToolUse, skip.json has preToolUse
      expect(parsed.hooks).toHaveProperty("PostToolUse");
      expect(parsed.hooks).not.toHaveProperty("PreToolUse");
    });

    it("copilot: does not exclude hooks (agents/** doesn't match hooks)", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["hooks"],
      });

      const hooks = files.find((f) => f.type === "hooks" && f.target === "copilot");
      expect(hooks).toBeDefined();
      const parsed = JSON.parse(hooks!.content);
      // Both hooks present
      expect(parsed.hooks).toHaveProperty("postToolUse");
      expect(parsed.hooks).toHaveProperty("preToolUse");
    });

    it("cursor: does not exclude hooks — both events present", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["cursor"],
        types: ["hooks"],
      });

      const hooks = files.find((f) => f.type === "hooks" && f.target === "cursor");
      expect(hooks).toBeDefined();
      const parsed = JSON.parse(hooks!.content);
      expect(parsed.hooks).toHaveProperty("preToolUse");
      expect(parsed.hooks).toHaveProperty("postToolUse");
    });
  });

  describe("skills", () => {
    it("no target excludes skills — all targets generate skills", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude", "copilot", "cursor"],
        types: ["skills"],
      });

      for (const target of ["claude", "copilot", "cursor"]) {
        const skills = files.filter((f) => f.type === "skills" && f.target === target);
        expect(skills.length).toBeGreaterThan(0);
      }
    });
  });
});
