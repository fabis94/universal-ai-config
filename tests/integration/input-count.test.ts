import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { consola } from "consola";
import { generate } from "../../src/core/generate.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures/input-count-project");

describe("inputCount reflects surviving contributions", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(consola, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe("mcp", () => {
    it("claude: opt-in drops server-b's contribution; inputs-only doesn't count (Claude drops inputs)", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["mcp"],
      });

      const mcp = files.find((f) => f.type === "mcp" && f.target === "claude");
      expect(mcp).toBeDefined();
      // Only server-a.json contributes "github" — server-b.json's "notion" filtered out,
      // inputs-only.json's `inputs` array dropped by Claude transform.
      expect(mcp!.inputCount).toBe(1);
    });

    it("copilot: surviving server file + inputs-only file both count", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["mcp"],
      });

      const mcp = files.find((f) => f.type === "mcp" && f.target === "copilot");
      expect(mcp).toBeDefined();
      // server-b.json (notion) + inputs-only.json (Copilot emits inputs)
      expect(mcp!.inputCount).toBe(2);
    });

    it("cursor: forceOptIn=false → both server files count; inputs-only does not (Cursor drops inputs)", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["cursor"],
        types: ["mcp"],
      });

      const mcp = files.find((f) => f.type === "mcp" && f.target === "cursor");
      expect(mcp).toBeDefined();
      expect(mcp!.inputCount).toBe(2);
    });

    it("opt-in off for copilot: all three mcp files count (2 servers + inputs)", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["mcp"],
        overrides: {
          mcp: {
            forceOptIn: { claude: true, copilot: false, default: false },
          },
        },
      });

      const mcp = files.find((f) => f.type === "mcp" && f.target === "copilot");
      expect(mcp).toBeDefined();
      expect(mcp!.inputCount).toBe(3);
    });
  });

  describe("hooks", () => {
    it("claude: copilot-only handler's file doesn't count", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["claude"],
        types: ["hooks"],
      });

      const hooks = files.find((f) => f.type === "hooks" && f.target === "claude");
      expect(hooks).toBeDefined();
      // shared.json survives; copilot-only.json's handler resolves to no-command for claude
      expect(hooks!.inputCount).toBe(1);
    });

    it("copilot: both hook files contribute surviving handlers", async () => {
      const files = await generate({
        root: FIXTURES_DIR,
        targets: ["copilot"],
        types: ["hooks"],
      });

      const hooks = files.find((f) => f.type === "hooks" && f.target === "copilot");
      expect(hooks).toBeDefined();
      expect(hooks!.inputCount).toBe(2);
    });
  });
});
