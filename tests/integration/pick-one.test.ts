import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { text } from "../test-helpers.js";
import { generateProject } from "../../src/core/generate/index.js";
import type { Diagnostic } from "../../src/core/diagnostics.js";
import type { GenerateOptions, Target, TemplateType } from "../../src/types.js";

const FIXTURE = join(import.meta.dirname, "../fixtures/pick-one-project");

async function run(
  targets: Target[] | undefined,
  types: TemplateType[],
  extra: GenerateOptions = {},
) {
  const diagnostics: Diagnostic[] = [];
  const result = await generateProject({
    root: FIXTURE,
    targets,
    types,
    ...extra,
    onDiagnostic: (d) => diagnostics.push(d),
  });
  const servedBy = diagnostics
    .filter((d) => d.code === "served-by")
    .map((d) => [d.target, d.type, (d.detail as { by: string }).by]);
  return { ...result, paths: result.files.map((f) => f.path).sort(), diagnostics, servedBy };
}

describe("pick one: instructions", () => {
  it("[claude] keeps .claude/rules and writes no AGENTS.md", async () => {
    const { paths, servedBy } = await run(["claude"], ["instructions"]);
    expect(paths).toEqual([".claude/rules/frontend.md", ".claude/rules/general.md"]);
    expect(servedBy).toEqual([]);
  });

  it("[claude, codex] writes only AGENTS.md files, read by both", async () => {
    const { paths, files, servedBy } = await run(["claude", "codex"], ["instructions"]);
    expect(paths).toEqual(["AGENTS.md", "packages/frontend/AGENTS.md"]);
    for (const file of files) expect(file.consumers).toEqual(["claude", "codex"]);
    expect(servedBy).toEqual([["claude", "instructions", "agentsMd"]]);
  });

  it("[claude, copilot] and [copilot] keep each target's own instructions", async () => {
    expect((await run(["claude", "copilot"], ["instructions"])).paths).toEqual([
      ".claude/rules/frontend.md",
      ".claude/rules/general.md",
      ".github/copilot-instructions.md",
      ".github/instructions/frontend.instructions.md",
    ]);
    expect((await run(["copilot"], ["instructions"])).paths).toEqual([
      ".github/copilot-instructions.md",
      ".github/instructions/frontend.instructions.md",
    ]);
  });

  it("every target: only AGENTS.md, and claude, copilot and cursor are switched", async () => {
    const { paths, servedBy } = await run(
      ["claude", "copilot", "cursor", "codex"],
      ["instructions"],
    );
    expect(paths).toEqual(["AGENTS.md", "packages/frontend/AGENTS.md"]);
    expect(servedBy).toEqual([
      ["claude", "instructions", "agentsMd"],
      ["copilot", "instructions", "agentsMd"],
      ["cursor", "instructions", "agentsMd"],
    ]);
  });

  it("enable: true without codex switches the readers in the run", async () => {
    const { paths, files } = await run(["cursor"], ["instructions"], {
      overrides: { agentsMd: { enable: true } },
    });
    expect(paths).toEqual(["AGENTS.md", "packages/frontend/AGENTS.md"]);
    expect(files[0]).toMatchObject({ target: "cursor", consumers: ["cursor"] });
  });

  it("the served-by warning leads with the per-machine targets fix", async () => {
    const { diagnostics } = await run(["claude", "codex"], ["instructions"]);
    const warning = diagnostics.find((d) => d.code === "served-by");
    expect(warning!.severity).toBe("warn");
    expect(warning!.message).toContain("universal-ai-config.overrides.ts");
  });

  it("uses the config's targets when no targets option is given", async () => {
    const { plan } = await run(undefined, ["instructions"]);
    expect(plan.targets).toEqual(["claude", "copilot"]);
  });
});

describe("pick one: hooks and MCP", () => {
  it("[claude, copilot]: only Claude's hooks and one Claude-rendered .mcp.json", async () => {
    const { files, servedBy } = await run(["claude", "copilot"], ["hooks", "mcp"]);
    expect(files.map((f) => [f.path, f.target, f.consumers])).toEqual([
      [".claude/settings.json", "claude", ["claude", "copilot"]],
      [".mcp.json", "claude", ["claude", "copilot"]],
    ]);
    // Claude's rendering: no Copilot-only `tools` key
    const mcp = JSON.parse(text(files[1]));
    expect(mcp.mcpServers.docs).not.toHaveProperty("tools");
    expect(servedBy).toEqual([
      ["copilot", "hooks", "claude"],
      ["copilot", "mcp", "claude"],
    ]);
  });

  it("[copilot] alone renders its own hooks and .mcp.json", async () => {
    const { files, servedBy } = await run(["copilot"], ["hooks", "mcp"]);
    expect(files.map((f) => [f.path, f.consumers])).toEqual([
      [".github/hooks/hooks.json", ["copilot"]],
      [".mcp.json", ["copilot"]],
    ]);
    expect(JSON.parse(text(files[1])).mcpServers.docs.tools).toEqual(["*"]);
    expect(servedBy).toEqual([]);
  });

  it("the targets option replaces the config's target set", async () => {
    // The fixture config lists claude and copilot; -t copilot plans for copilot alone
    const { plan, paths } = await run(["copilot"], ["hooks", "mcp"]);
    expect(plan.targets).toEqual(["copilot"]);
    expect(paths).toEqual([".github/hooks/hooks.json", ".mcp.json"]);
  });

  it("[claude, cursor]: both hook files; warns about the hook whose commands differ", async () => {
    const { paths, diagnostics } = await run(["claude", "cursor"], ["hooks"]);
    expect(paths).toEqual([".claude/settings.json", ".cursor/hooks.json"]);
    const duplicates = diagnostics.filter((d) => d.code === "duplicate-hook-run");
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]).toMatchObject({
      target: "cursor",
      detail: { against: "claude", event: "stop", command: "./scripts/claude-stop.sh" },
    });
    expect(duplicates[0]!.message).toContain("universal-ai-config.overrides.ts");
  });

  it("every target: copilot yields hooks and MCP to claude; cursor and codex keep theirs", async () => {
    const { files } = await run(["claude", "copilot", "cursor", "codex"], ["hooks", "mcp"]);
    expect(files.map((f) => [f.path, f.consumers])).toEqual([
      [".claude/settings.json", ["claude", "copilot"]],
      [".cursor/hooks.json", ["cursor"]],
      [".codex/hooks.json", ["codex"]],
      [".mcp.json", ["claude", "copilot"]],
      [".cursor/mcp.json", ["cursor"]],
      [".codex/config.toml", ["codex"]],
    ]);
  });
});

describe("pick one: hook checks that need a custom project", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
  });
  async function projectWithHooks(hooks: unknown): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "uac-pick-one-"));
    dirs.push(dir);
    await mkdir(join(dir, ".universal-ai-config/hooks"), { recursive: true });
    await writeFile(join(dir, ".universal-ai-config/hooks/hooks.json"), JSON.stringify({ hooks }));
    return dir;
  }

  it("no duplicate-run warning when Claude's file has no matcher (Cursor ignores it)", async () => {
    const root = await projectWithHooks({
      stop: [{ command: { claude: "a.sh", default: "b.sh" } }],
    });
    const { diagnostics } = await run(["claude", "cursor"], ["hooks"], { root });
    expect(diagnostics.some((d) => d.code === "duplicate-hook-run")).toBe(false);
  });

  it("warns that a claude-only hook still runs in Cursor", async () => {
    const root = await projectWithHooks({
      preToolUse: [{ command: { claude: "claude-only.sh" }, matcher: "Bash" }],
    });
    const { diagnostics } = await run(["claude", "cursor"], ["hooks"], { root });
    expect(diagnostics.filter((d) => d.code === "duplicate-hook-run").map((d) => d.detail)).toEqual(
      [{ against: "claude", event: "preToolUse", command: "claude-only.sh" }],
    );
  });

  it("reports a switch-over only for types that have templates", async () => {
    const root = await projectWithHooks({ stop: [{ command: "stop.sh" }] });
    const { servedBy } = await run(["claude", "copilot"], ["hooks", "mcp"], { root });
    expect(servedBy).toEqual([["copilot", "hooks", "claude"]]);
  });

  it("warns when Copilot would reject Claude's whole hook file", async () => {
    const root = await projectWithHooks({
      sessionStart: [{ type: "prompt", prompt: "hello" }],
      preToolUse: [{ command: "guard.sh" }],
    });
    const { diagnostics } = await run(["claude", "copilot"], ["hooks"], { root });
    const rejected = diagnostics.find(
      (d) => d.code === "unsupported" && d.target === "copilot" && d.type === "hooks",
    );
    expect(rejected!.message).toContain("rejects that whole file");
  });
});
