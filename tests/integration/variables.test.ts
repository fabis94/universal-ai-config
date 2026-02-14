import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { generate } from "../../src/core/generate.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures/variables-project");

describe("typed variable interpolation", () => {
  describe("mcp", () => {
    it("resolves array variable as typed array in output", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["mcp"],
      });

      const mcp = files.find((f) => f.type === "mcp" && f.target === "claude");
      expect(mcp).toBeDefined();

      const parsed = JSON.parse(mcp!.content);
      expect(parsed.mcpServers.playwright.args).toEqual(["-y", "@playwright/mcp@latest"]);
    });

    it("resolves string variable with embedded syntax", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["mcp"],
      });

      const mcp = files.find((f) => f.type === "mcp" && f.target === "claude");
      const parsed = JSON.parse(mcp!.content);

      // Embedded {{var}} in a string → string interpolation
      expect(parsed.mcpServers.api.env.HOST).toBe("host-example.com-suffix");
    });

    it("resolves exact string variable in env", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["mcp"],
      });

      const mcp = files.find((f) => f.type === "mcp" && f.target === "claude");
      const parsed = JSON.parse(mcp!.content);

      expect(parsed.mcpServers.playwright.env.DISPLAY).toBe(":0");
    });

    it("leaves servers without variables unchanged", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["mcp"],
      });

      const mcp = files.find((f) => f.type === "mcp" && f.target === "claude");
      const parsed = JSON.parse(mcp!.content);

      expect(parsed.mcpServers["no-var"].args).toEqual(["-y", "@plain/server"]);
    });

    it("works across all targets", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude", "copilot", "cursor"],
        types: ["mcp"],
      });

      for (const target of ["claude", "copilot", "cursor"] as const) {
        const mcp = files.find((f) => f.type === "mcp" && f.target === target);
        expect(mcp).toBeDefined();
        const parsed = JSON.parse(mcp!.content);
        const servers = target === "copilot" ? parsed.servers : parsed.mcpServers;
        expect(servers.playwright.args).toEqual(["-y", "@playwright/mcp@latest"]);
      }
    });
  });

  describe("hooks", () => {
    it("resolves string variable in hook command field", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["hooks"],
      });

      const hooks = files.find((f) => f.type === "hooks" && f.target === "claude");
      expect(hooks).toBeDefined();

      const parsed = JSON.parse(hooks!.content);
      const postToolUse = parsed.hooks.PostToolUse[0];
      expect(postToolUse.hooks[0].command).toBe(".hooks/lint.sh");
    });
  });
});
