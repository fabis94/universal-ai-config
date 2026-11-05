import { mkdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateProject } from "../../src/core/generate/index.js";
import type { Target } from "../../src/types.js";
import type { CliProject } from "./cli-project.js";
import { createStandardsProject } from "./standards-project.js";

const ALL_TARGETS: Target[] = ["claude", "copilot", "cursor", "codex"];

describe("standards — checks on the project's own files", () => {
  const projects: CliProject[] = [];
  afterEach(async () => {
    for (const p of projects.splice(0)) await p.dispose();
  });

  async function project(files: Record<string, string> = {}, remove: string[] = []) {
    const p = await createStandardsProject();
    projects.push(p);
    for (const rel of remove) await rm(join(p.root, rel), { recursive: true, force: true });
    for (const [rel, content] of Object.entries(files)) await p.write(rel, content);
    return p.root;
  }
  const generate = (root: string, targets: Target[] = ALL_TARGETS, standards = true) =>
    generateProject({ root, targets, overrides: { standards }, onDiagnostic: () => {} });
  const find = <C extends string>(diagnostics: { code: string }[], code: C) =>
    diagnostics.filter((d) => d.code === code);

  describe("claude-md-present — CLAUDE.md next to AGENTS.md", () => {
    it("warns that Claude ignores every AGENTS.md", async () => {
      const root = await project({ "CLAUDE.md": "# Claude-only notes\n" });
      const [warning] = find((await generate(root)).diagnostics, "claude-md-present");
      expect(warning).toMatchObject({
        target: "claude",
        detail: { files: ["CLAUDE.md"], importsAgentsMd: false },
      });
      expect((warning as { message: string }).message).toContain(
        "So Claude ignores every AGENTS.md in the project",
      );
    });

    it("still warns when CLAUDE.md only imports @AGENTS.md, naming the nested files", async () => {
      const root = await project({ "CLAUDE.md": "@AGENTS.md\n" });
      const [warning] = find((await generate(root)).diagnostics, "claude-md-present");
      expect(warning).toMatchObject({ detail: { files: ["CLAUDE.md"], importsAgentsMd: true } });
      expect((warning as { message: string }).message).toContain(
        "never loads the nested ones (packages/web/AGENTS.md)",
      );
    });

    it("warns in template mode too, with template-mode advice", async () => {
      const root = await project({ "CLAUDE.md": "@AGENTS.md\n" });
      const [warning] = find(
        (await generate(root, ["claude", "codex"], false)).diagnostics,
        "claude-md-present",
      );
      expect((warning as { message: string }).message).toContain("none of uac's instructions");
    });

    it("says nothing without claude in the run", async () => {
      const root = await project({ "CLAUDE.md": "notes\n" });
      expect(find((await generate(root, ["cursor"])).diagnostics, "claude-md-present")).toEqual([]);
    });
  });

  it("agents-md-missing — no root AGENTS.md", async () => {
    const root = await project({}, ["AGENTS.md"]);
    expect(find((await generate(root)).diagnostics, "agents-md-missing")).toHaveLength(1);
  });

  it("agents-md-size — the project's AGENTS.md chain is over Codex's budget", async () => {
    const root = await project({ "packages/web/AGENTS.md": `${"x".repeat(33 * 1024)}\n` });
    const [warning] = find((await generate(root, ["codex"])).diagnostics, "agents-md-size");
    expect(warning).toMatchObject({
      target: "codex",
      path: "packages/web/AGENTS.md",
      detail: { files: ["AGENTS.md", "packages/web/AGENTS.md"] },
    });
    expect((warning as { message: string }).message).toContain("into skills");
    expect(find((await generate(root, ["claude"])).diagnostics, "agents-md-size")).toEqual([]);
  });

  it("an AGENTS.md shipped inside a skill isn't one of the project's instruction files", async () => {
    const root = await project(
      { ".agents/skills/helper/AGENTS.md": `${"x".repeat(40 * 1024)}\n` },
      ["AGENTS.md"],
    );
    const { diagnostics, files } = await generate(root);
    expect(find(diagnostics, "agents-md-size")).toEqual([]);
    expect(find(diagnostics, "agents-md-missing")).toHaveLength(1);
    // …and it's copied for Claude like any other skill file
    expect(files.map((f) => f.path)).toContain(".claude/skills/helper/AGENTS.md");
  });

  it("standard-shadowed — a tool's own copy of a skill wins over .agents/skills", async () => {
    const root = await project({
      ".cursor/skills/helper/SKILL.md": "---\nname: helper\ndescription: old\n---\nold\n",
    });
    const shadowed = find((await generate(root)).diagnostics, "standard-shadowed");
    expect(shadowed).toEqual([
      expect.objectContaining({
        target: "cursor",
        path: ".cursor/skills/helper/SKILL.md",
        detail: { skill: "helper", path: ".cursor/skills/helper/SKILL.md" },
      }),
    ]);
  });

  it("standard-linked — a committed .claude/skills link to .agents/skills gets no copies", async () => {
    const root = await project();
    await mkdir(join(root, ".claude"), { recursive: true });
    await symlink("../.agents/skills", join(root, ".claude/skills"));
    const { files, diagnostics } = await generate(root);
    expect(files.filter((f) => f.type === "skills")).toEqual([]);
    expect(find(diagnostics, "standard-linked")).toEqual([
      expect.objectContaining({ target: "claude", severity: "info" }),
    ]);
  });

  it("skill-spec — a .agents/skills skill that breaks the spec warns once, without a target", async () => {
    const root = await project({
      ".agents/skills/Bad_Name/SKILL.md": "---\nname: Bad_Name\n---\nbody\n",
    });
    const spec = find((await generate(root)).diagnostics, "skill-spec");
    expect(spec.map((d) => (d as { detail: { field: string } }).detail.field).sort()).toEqual([
      "description",
      "name",
    ]);
    expect(spec.every((d) => (d as { target?: string }).target === undefined)).toBe(true);
  });
});
