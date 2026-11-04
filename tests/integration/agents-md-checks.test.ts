import { afterEach, describe, expect, it } from "vitest";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { AGENTS_MD_FIXTURE, runAgentsMd } from "./agents-md-helpers.js";

describe("AGENTS.md checks", () => {
  const dirs: string[] = [];
  async function projectWith(files: Record<string, string>): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "uac-agents-md-"));
    dirs.push(dir);
    await cp(AGENTS_MD_FIXTURE, dir, { recursive: true });
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(join(dir, rel)), { recursive: true });
      await writeFile(join(dir, rel), content, "utf-8");
    }
    return dir;
  }
  afterEach(async () => {
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
  });

  describe("CLAUDE.md present", () => {
    for (const file of ["CLAUDE.md", ".claude/CLAUDE.md", "CLAUDE.local.md"]) {
      it(`warns when claude reads AGENTS.md and ${file} has content`, async () => {
        const root = await projectWith({ [file]: "# Notes\n" });
        const run = await runAgentsMd(["claude", "codex"], {}, { root });
        const warning = run.diagnostics.find((d) => d.code === "claude-md-present");
        expect(warning).toMatchObject({ target: "claude", detail: { files: [file] } });
        expect(warning!.message).toContain("@AGENTS.md");
      });
    }

    it("stays quiet for an empty CLAUDE.md, or when claude isn't a reader", async () => {
      const empty = await projectWith({ "CLAUDE.md": "  \n" });
      const quiet = await runAgentsMd(["claude", "codex"], {}, { root: empty });
      expect(quiet.diagnostics.some((d) => d.code === "claude-md-present")).toBe(false);

      const full = await projectWith({ "CLAUDE.md": "# Notes\n" });
      const codexOnly = await runAgentsMd(["codex"], {}, { root: full });
      expect(codexOnly.diagnostics.some((d) => d.code === "claude-md-present")).toBe(false);
    });
  });

  it("warns when a folder chain is over Codex's 32 KiB budget", async () => {
    const run = await runAgentsMd(
      ["codex"],
      {},
      {
        templates: [
          {
            name: "huge",
            type: "instructions",
            content: `---\nalwaysApply: true\n---\n${"x".repeat(33 * 1024)}\n`,
          },
        ],
      },
    );
    const size = run.diagnostics.filter((d) => d.code === "agents-md-size");
    expect(size).toHaveLength(1);
    expect(size[0]).toMatchObject({ target: "codex", path: "AGENTS.md" });
  });

  it("skips the size check when codex doesn't read the files", async () => {
    const run = await runAgentsMd(
      ["claude"],
      { enable: true },
      {
        templates: [
          {
            name: "huge",
            type: "instructions",
            content: `---\nalwaysApply: true\n---\n${"x".repeat(33 * 1024)}\n`,
          },
        ],
      },
    );
    expect(run.diagnostics.some((d) => d.code === "agents-md-size")).toBe(false);
  });

  it("generates AGENTS.md anyway, with a warning, when enable is false but codex is a target", async () => {
    const run = await runAgentsMd(["codex"], { enable: false });
    expect(run.paths).toContain("AGENTS.md");
    expect(run.diagnostics.map((d) => d.code)).toContain("agents-md-forced");
  });

  it("reports what a reader loses when the view excludes a template", async () => {
    const run = await runAgentsMd(
      ["claude", "codex"],
      {},
      {
        exclude: { codex: ["instructions/folder.md"] },
      },
    );
    expect(run.paths).not.toContain("packages/frontend/AGENTS.md");
    const divergence = run.diagnostics.filter((d) => d.code === "shared-divergence");
    expect(divergence).toEqual([
      expect.objectContaining({
        target: "claude",
        severity: "warn",
        detail: { view: "codex", reader: "claude", name: "folder", kind: "missing" },
      }),
    ]);
  });

  it("reports a template a reader excluded but still gets", async () => {
    const run = await runAgentsMd(
      ["claude", "codex"],
      {},
      {
        exclude: { claude: ["instructions/folder.md"] },
      },
    );
    const divergence = run.diagnostics.filter((d) => d.code === "shared-divergence");
    expect(divergence.map((d) => d.detail)).toEqual([
      { view: "codex", reader: "claude", name: "folder", kind: "extra" },
    ]);
  });

  it("reports, as info, a template that renders differently for a reader", async () => {
    const run = await runAgentsMd(
      ["claude", "codex"],
      {},
      {
        templates: [
          {
            name: "per-target",
            type: "instructions",
            content: "---\nalwaysApply: true\n---\nYou are <%= target %>.\n",
          },
        ],
      },
    );
    expect(run.read("AGENTS.md")).toContain("You are codex.");
    const divergence = run.diagnostics.filter((d) => d.code === "shared-divergence");
    expect(divergence).toEqual([
      expect.objectContaining({
        severity: "info",
        detail: { view: "codex", reader: "claude", name: "per-target", kind: "different" },
      }),
    ]);
  });
});
