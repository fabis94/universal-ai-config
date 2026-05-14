import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { consola } from "consola";
import { generate } from "../../src/core/generate.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures/mcp-opt-in-project");

describe("mcp opt-in filtering", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(consola, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("claude: emits only the allow-listed servers", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["claude"],
      types: ["mcp"],
    });

    const mcp = files.find((f) => f.type === "mcp" && f.target === "claude");
    expect(mcp).toBeDefined();
    const parsed = JSON.parse(mcp!.content);
    expect(Object.keys(parsed.mcpServers).sort()).toEqual(["github", "playwright"]);
  });

  it("copilot: emits only its allow-listed server (different from claude)", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["copilot"],
      types: ["mcp"],
    });

    const mcp = files.find((f) => f.type === "mcp" && f.target === "copilot");
    expect(mcp).toBeDefined();
    const parsed = JSON.parse(mcp!.content);
    expect(Object.keys(parsed.servers)).toEqual(["notion"]);
  });

  it("cursor: forceOptIn=false (default) — all servers passed through", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["cursor"],
      types: ["mcp"],
    });

    const mcp = files.find((f) => f.type === "mcp" && f.target === "cursor");
    expect(mcp).toBeDefined();
    const parsed = JSON.parse(mcp!.content);
    expect(Object.keys(parsed.mcpServers).sort()).toEqual([
      "confluence",
      "github",
      "notion",
      "playwright",
    ]);
  });

  it("empty mcpServers + forceOptIn=true skips MCP output entirely", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["claude"],
      types: ["mcp"],
      overrides: {
        mcp: { forceOptIn: true, mcpServers: [] },
      },
    });

    const mcp = files.find((f) => f.type === "mcp" && f.target === "claude");
    expect(mcp).toBeUndefined();
  });

  it("warns and continues for unknown server names", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["claude"],
      types: ["mcp"],
      overrides: {
        mcp: { forceOptIn: true, mcpServers: ["github", "doesnt-exist"] },
      },
    });

    const mcp = files.find((f) => f.type === "mcp" && f.target === "claude");
    expect(mcp).toBeDefined();
    const parsed = JSON.parse(mcp!.content);
    expect(Object.keys(parsed.mcpServers)).toEqual(["github"]);

    const warned = warnSpy.mock.calls.some((args) =>
      String(args.join(" ")).includes("doesnt-exist"),
    );
    expect(warned).toBe(true);
  });

  it("inline overrides can shift per-target lists while keeping base forceOptIn", async () => {
    // Base fixture config has forceOptIn={claude:true, copilot:true, default:false}
    // and mcpServers per-target. Inline overrides bring a different per-target list.
    // Because mcp is shallow-merged, forceOptIn carries over and the new lists apply.
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["claude", "copilot", "cursor"],
      types: ["mcp"],
      overrides: {
        mcp: {
          mcpServers: {
            claude: ["notion"],
            copilot: ["github", "playwright"],
            default: [],
          },
        },
      },
    });

    const claude = files.find((f) => f.type === "mcp" && f.target === "claude");
    expect(claude).toBeDefined();
    expect(Object.keys(JSON.parse(claude!.content).mcpServers)).toEqual(["notion"]);

    const copilot = files.find((f) => f.type === "mcp" && f.target === "copilot");
    expect(copilot).toBeDefined();
    expect(Object.keys(JSON.parse(copilot!.content).servers).sort()).toEqual([
      "github",
      "playwright",
    ]);

    // cursor's forceOptIn remains false → all servers present
    const cursor = files.find((f) => f.type === "mcp" && f.target === "cursor");
    expect(cursor).toBeDefined();
    expect(Object.keys(JSON.parse(cursor!.content).mcpServers).length).toBe(4);
  });

  it("file-level exclude wins over server-name opt-in (excluded file's servers can't be opted in)", async () => {
    // dev-tools.json declares "github" and "playwright". If we exclude that file AND
    // opt-in to "github", "github" must not appear in the output — exclude runs first
    // at the file-reading stage, so opt-in can only ever pick from surviving files.
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["claude"],
      types: ["mcp"],
      overrides: {
        exclude: ["mcp/dev-tools.json"],
        mcp: { forceOptIn: true, mcpServers: ["github", "notion"] },
      },
    });

    const mcp = files.find((f) => f.type === "mcp" && f.target === "claude");
    expect(mcp).toBeDefined();
    const parsed = JSON.parse(mcp!.content);
    // Only "notion" should be present — "github" was filtered out by file-level exclude
    // before opt-in had a chance to see it.
    expect(Object.keys(parsed.mcpServers)).toEqual(["notion"]);
  });

  it("inline overrides can override base mcpServers from [] to per-target with values", async () => {
    // Explicit version of the previous test: start from a base where mcpServers=[]
    // (no servers anywhere) and verify per-target overrides activate the right servers.
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["claude", "copilot"],
      types: ["mcp"],
      overrides: {
        mcp: {
          forceOptIn: true,
          mcpServers: [],
        },
      },
    });
    // Base override: empty list → no output.
    expect(files.find((f) => f.type === "mcp" && f.target === "claude")).toBeUndefined();
    expect(files.find((f) => f.type === "mcp" && f.target === "copilot")).toBeUndefined();

    // Now layer a different per-target list on top.
    const files2 = await generate({
      root: FIXTURES_DIR,
      targets: ["claude", "copilot"],
      types: ["mcp"],
      overrides: {
        mcp: {
          forceOptIn: true,
          mcpServers: { claude: ["github"], copilot: ["notion", "confluence"], default: [] },
        },
      },
    });
    const claude = files2.find((f) => f.type === "mcp" && f.target === "claude");
    expect(Object.keys(JSON.parse(claude!.content).mcpServers)).toEqual(["github"]);

    const copilot = files2.find((f) => f.type === "mcp" && f.target === "copilot");
    expect(Object.keys(JSON.parse(copilot!.content).servers).sort()).toEqual([
      "confluence",
      "notion",
    ]);
  });
});
