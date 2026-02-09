import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { generate } from "../../src/core/generate.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures/additional-dirs-project");

describe("additionalTemplateDirs", () => {
  describe("instructions", () => {
    it("discovers templates from additional dir", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["instructions"],
      });

      const extraRule = files.find((f) => f.path.includes("extra-rule"));
      expect(extraRule).toBeDefined();
      expect(extraRule!.content).toContain("extra rule from the shared templates dir");
    });

    it("main dir wins on name conflicts (dedup)", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["instructions"],
      });

      const shadowed = files.find((f) => f.path.includes("shadowed-rule"));
      expect(shadowed).toBeDefined();
      expect(shadowed!.content).toContain("LOCAL version");
      expect(shadowed!.content).not.toContain("SHARED version");
    });

    it("local-only templates still work", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["instructions"],
      });

      expect(files.find((f) => f.path.includes("local-rule"))).toBeDefined();
    });
  });

  describe("skills", () => {
    it("discovers skills from additional dir", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["skills"],
      });

      const skill = files.find((f) => f.path.includes("shared-skill"));
      expect(skill).toBeDefined();
      expect(skill!.content).toContain("shared templates directory");
    });
  });

  describe("hooks", () => {
    it("merges hooks from additional dir with main dir hooks", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["hooks"],
      });

      const hooks = files.find((f) => f.type === "hooks" && f.target === "claude");
      expect(hooks).toBeDefined();
      const parsed = JSON.parse(hooks!.content);
      // local-hooks.json has postToolUse, shared-hooks.json has sessionStart
      expect(parsed.hooks).toHaveProperty("PostToolUse");
      expect(parsed.hooks).toHaveProperty("SessionStart");
    });
  });

  describe("mcp", () => {
    it("discovers MCP servers from additional dir", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["mcp"],
      });

      const mcp = files.find((f) => f.type === "mcp" && f.target === "claude");
      expect(mcp).toBeDefined();
      const parsed = JSON.parse(mcp!.content);
      expect(parsed.mcpServers).toHaveProperty("shared-server");
    });
  });

  describe("exclude", () => {
    it("exclude patterns filter additional dir templates", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["instructions"],
      });

      // excluded-shared.md is excluded for claude via exclude config
      expect(files.find((f) => f.path.includes("excluded-shared"))).toBeUndefined();
    });

    it("non-excluded targets still get additional dir templates", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["instructions"],
      });

      // copilot uses default: [] so nothing excluded
      expect(files.find((f) => f.sourcePath.includes("excluded-shared"))).toBeDefined();
    });
  });
});
