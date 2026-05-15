import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { generate } from "../../src/core/generate.js";
import { expectYamlField } from "../test-helpers.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures/exhaustive-project");

describe("exhaustive per-target field coverage", () => {
  describe("instructions — name field", () => {
    it("copilot: emits name field", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["instructions"],
      });

      const rule = files.find((f) => f.path.includes("named-instruction"));
      expect(rule).toBeDefined();
      expectYamlField(rule!.content, "name", "My Coding Rules");
    });

    it("claude: does not emit name field", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["instructions"],
      });

      const rule = files.find((f) => f.path.includes("named-instruction"));
      expect(rule).toBeDefined();
      expect(rule!.content).not.toContain("name:");
    });

    it("cursor: does not emit name field", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["cursor"],
        types: ["instructions"],
      });

      const rule = files.find((f) => f.path.includes("named-instruction"));
      expect(rule).toBeDefined();
      expect(rule!.content).not.toContain("name:");
    });
  });

  describe("skills — new claude-only fields", () => {
    it("claude: emits whenToUse, arguments, effort, skillPaths, skillShell", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["skills"],
      });

      const skill = files.find((f) => f.type === "skills" && f.target === "claude");
      expect(skill).toBeDefined();
      const c = skill!.content;
      expect(c).toContain("when_to_use:");
      expect(c).toContain("When deploying to production or staging");
      expectYamlField(c, "arguments", "env version");
      expectYamlField(c, "effort", "high");
      expect(c).toContain("paths:");
      expect(c).toContain("**/*.yml");
      expectYamlField(c, "shell", "bash");
    });

    it("copilot: does not emit claude-only skill fields", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["skills"],
      });

      const skill = files.find((f) => f.type === "skills" && f.target === "copilot");
      expect(skill).toBeDefined();
      const c = skill!.content;
      expect(c).not.toContain("when_to_use:");
      expect(c).not.toContain("arguments:");
      expect(c).not.toContain("allowed-tools:");
      expect(c).not.toContain("agent:");
    });

    it("cursor: does not emit claude-only skill fields", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["cursor"],
        types: ["skills"],
      });

      const skill = files.find((f) => f.type === "skills" && f.target === "cursor");
      expect(skill).toBeDefined();
      const c = skill!.content;
      expect(c).not.toContain("when_to_use:");
      expect(c).not.toContain("arguments:");
      expect(c).not.toContain("allowed-tools:");
      expect(c).not.toContain("user-invocable:");
      expect(c).not.toContain("argument-hint:");
    });
  });

  describe("agents — new claude-only fields", () => {
    it("claude: emits maxTurns, background, effort, isolation, color, initialPrompt", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["agents"],
      });

      const agent = files.find((f) => f.type === "agents" && f.target === "claude");
      expect(agent).toBeDefined();
      const c = agent!.content;
      expectYamlField(c, "maxTurns", "10");
      expect(c).toContain("background: true");
      expectYamlField(c, "effort", "high");
      expectYamlField(c, "isolation", "worktree");
      expectYamlField(c, "color", "blue");
      expect(c).toContain("initialPrompt:");
      expect(c).toContain("Start with a status report");
    });

    it("copilot: does not emit claude-only agent fields", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["agents"],
      });

      const agent = files.find((f) => f.type === "agents" && f.target === "copilot");
      expect(agent).toBeDefined();
      const c = agent!.content;
      expect(c).not.toContain("maxTurns:");
      expect(c).not.toContain("background:");
      expect(c).not.toContain("effort:");
      expect(c).not.toContain("isolation:");
      expect(c).not.toContain("color:");
      expect(c).not.toContain("initialPrompt:");
      expect(c).not.toContain("disallowedTools:");
      expect(c).not.toContain("permissionMode:");
      expect(c).not.toContain("skills:");
      expect(c).not.toContain("memory:");
    });
  });

  describe("mcp — per-target field stripping", () => {
    it("claude: emits alwaysLoad, headersHelper, oauth; strips sandboxEnabled, sandbox, dev, envFile, auth", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["mcp"],
      });

      const mcp = files.find((f) => f.type === "mcp" && f.target === "claude");
      expect(mcp).toBeDefined();
      const parsed = JSON.parse(mcp!.content) as {
        mcpServers: Record<string, Record<string, unknown>>;
      };
      const s = parsed.mcpServers["shared-server"]!;

      expect(s).toHaveProperty("alwaysLoad", true);
      expect(s).toHaveProperty("headersHelper", "./gen-headers.sh");
      expect(s).toHaveProperty("oauth");
      expect(s).not.toHaveProperty("sandboxEnabled");
      expect(s).not.toHaveProperty("sandbox");
      expect(s).not.toHaveProperty("dev");
      expect(s).not.toHaveProperty("envFile");
      expect(s).not.toHaveProperty("auth");
    });

    it("copilot: emits sandboxEnabled, sandbox, dev, envFile; strips alwaysLoad, headersHelper, oauth, auth", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["mcp"],
      });

      const mcp = files.find((f) => f.type === "mcp" && f.target === "copilot");
      expect(mcp).toBeDefined();
      const parsed = JSON.parse(mcp!.content) as {
        servers: Record<string, Record<string, unknown>>;
      };
      const s = parsed.servers["shared-server"]!;

      expect(s).toHaveProperty("sandboxEnabled", true);
      expect(s).toHaveProperty("sandbox");
      expect(s).toHaveProperty("dev");
      expect(s).toHaveProperty("envFile", ".env.local");
      expect(s).not.toHaveProperty("alwaysLoad");
      expect(s).not.toHaveProperty("headersHelper");
      expect(s).not.toHaveProperty("oauth");
      expect(s).not.toHaveProperty("auth");
    });

    it("cursor: emits envFile, auth; strips alwaysLoad, headersHelper, oauth, sandboxEnabled, sandbox, dev", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["cursor"],
        types: ["mcp"],
      });

      const mcp = files.find((f) => f.type === "mcp" && f.target === "cursor");
      expect(mcp).toBeDefined();
      const parsed = JSON.parse(mcp!.content) as {
        mcpServers: Record<string, Record<string, unknown>>;
      };
      const s = parsed.mcpServers["shared-server"]!;

      expect(s).toHaveProperty("envFile", ".env.local");
      expect(s).toHaveProperty("auth");
      expect(s).not.toHaveProperty("alwaysLoad");
      expect(s).not.toHaveProperty("headersHelper");
      expect(s).not.toHaveProperty("oauth");
      expect(s).not.toHaveProperty("sandboxEnabled");
      expect(s).not.toHaveProperty("sandbox");
      expect(s).not.toHaveProperty("dev");
    });
  });
});
