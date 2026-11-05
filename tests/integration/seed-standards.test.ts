import { consola } from "consola";
import { afterEach, describe, expect, it, vi } from "vitest";
import { printSetupHints } from "../../src/commands/setup-hints.js";
import { loadProjectConfig } from "../../src/config/loader.js";
import { generateProject } from "../../src/core/generate/index.js";
import { metaInstructionsDrift } from "../../src/seed-types/meta-instructions/state.js";
import type { StandardsSetting } from "../../src/types.js";
import { text } from "../test-helpers.js";
import { CliProject } from "./cli-project.js";

const BLOCK_START = "<!-- >>> universal-ai-config >>> -->";
const BLOCK_END = "<!-- <<< universal-ai-config <<< -->";
const SEEDED_SKILLS = [
  "ai-config-compress",
  "import-existing-ai-config",
  "update-agent",
  "update-ai-config",
  "update-hook",
  "update-instruction",
  "update-mcp",
  "update-skill",
];

describe("seed meta-instructions into the standards (CLI)", () => {
  const projects: CliProject[] = [];
  afterEach(async () => {
    for (const p of projects.splice(0)) await p.dispose();
  });
  async function project(standards: StandardsSetting): Promise<CliProject> {
    const p = await CliProject.create();
    projects.push(p);
    await p.config({ standards });
    return p;
  }
  const drift = async (p: CliProject) =>
    metaInstructionsDrift(p.root, await loadProjectConfig({ root: p.root }));
  const seed = (p: CliProject) => p.run("seed", ["meta-instructions"]);

  describe("standards: true", () => {
    it("adds uac's block to the project's AGENTS.md and keeps everything else", async () => {
      const p = await project(true);
      await p.write("AGENTS.md", "# Team rules\n\nUse pnpm.\n");
      await seed(p);

      const agents = await p.read("AGENTS.md");
      expect(agents.startsWith("# Team rules\n\nUse pnpm.\n\n")).toBe(true);
      expect(agents).toContain(BLOCK_START);
      expect(agents.trimEnd().endsWith(BLOCK_END)).toBe(true);
      expect(agents).toContain("**Instructions** are the project's own `AGENTS.md` files");

      const guide = await p.read(".universal-ai-config/AGENTS.md");
      expect(guide.startsWith(BLOCK_START)).toBe(true);
      expect(guide).toContain("### Instructions (`AGENTS.md` files)");

      for (const skill of SEEDED_SKILLS) {
        expect(await p.read(`.agents/skills/${skill}/SKILL.md`)).toContain(
          'managed-by: "universal-ai-config"',
        );
      }
      expect(await p.exists(".agents/skills/ai-config-compress/references/examples.md")).toBe(true);
      expect(await p.exists(".universal-ai-config/instructions")).toBe(false);
      expect(await p.exists(".universal-ai-config/skills")).toBe(false);
      expect(await p.exists(".universal-ai-config/docs/uac/standards.md")).toBe(true);
      expect(await p.exists(".universal-ai-config/.uac-version")).toBe(true);
      expect(await drift(p)).toEqual({ missing: 0, differ: 0, misplaced: 0 });
    });

    it("creates the root AGENTS.md when there is none", async () => {
      const p = await project("instructions");
      await seed(p);
      expect((await p.read("AGENTS.md")).startsWith(BLOCK_START)).toBe(true);
    });

    it("is idempotent, restores its block and keeps edits outside it", async () => {
      const p = await project(true);
      await p.write("AGENTS.md", "# Team rules\n");
      await seed(p);
      const first = await p.read("AGENTS.md");

      const again = await seed(p);
      expect(await p.read("AGENTS.md")).toBe(first);
      expect(again.some((line) => /^(Created|Updated)/.test(line))).toBe(false);

      const edited = first
        .replace("# Team rules\n", "# Team rules\n\nNew team rule.\n")
        .replace("## Commands", "## Commands (edited)");
      await p.write("AGENTS.md", edited);
      expect((await drift(p)).differ).toBe(1);
      await seed(p);
      const restored = await p.read("AGENTS.md");
      expect(restored).toContain("New team rule.");
      expect(restored).not.toContain("## Commands (edited)");
      expect(restored.split(BLOCK_START)).toHaveLength(2);
    });

    it("never overwrites a same-named skill the project wrote", async () => {
      const p = await project(true);
      const own = "---\nname: update-mcp\ndescription: Our own MCP workflow\n---\n\nOurs.\n";
      await p.write(".agents/skills/update-mcp/SKILL.md", own);
      const logs = await seed(p);

      expect(await p.read(".agents/skills/update-mcp/SKILL.md")).toBe(own);
      expect(
        logs.some((l) => l.includes(".agents/skills/update-mcp is the project's own skill")),
      ).toBe(true);
      expect(await drift(p)).toEqual({ missing: 0, differ: 0, misplaced: 0 });
    });

    it("generate then copies uac's skills for Claude, and ignores nothing", async () => {
      const p = await project(true);
      await seed(p);
      const { files, diagnostics } = await generateProject({
        root: p.root,
        targets: ["claude", "cursor"],
        onDiagnostic: () => {},
      });
      const copy = files.find((f) => f.path === ".claude/skills/update-hook/SKILL.md");
      expect(text(copy)).toBe(await p.read(".agents/skills/update-hook/SKILL.md"));
      expect(files.some((f) => f.target === "cursor" && f.type === "skills")).toBe(false);
      expect(diagnostics.filter((d) => d.code === "standard-ignored")).toEqual([]);
      expect(diagnostics.filter((d) => d.code === "agents-md-missing")).toEqual([]);
    });
  });

  describe("switching modes moves uac's own files, both ways", () => {
    it("template mode → standards", async () => {
      const p = await project(false);
      await seed(p);
      await p.write(
        ".universal-ai-config/skills/team-skill/SKILL.md",
        "---\nname: team-skill\n---\n",
      );
      await p.config({ standards: true });

      expect(await drift(p)).toMatchObject({ misplaced: 10 });
      const hints: string[] = [];
      const spy = vi.spyOn(consola, "info").mockImplementation((m: unknown) => {
        hints.push(String(m));
      });
      try {
        await printSetupHints(p.root);
      } finally {
        spy.mockRestore();
      }
      expect(hints.join("\n")).toContain("10 files to move");

      await seed(p);
      expect(await p.exists(".universal-ai-config/instructions/uac-usage.md")).toBe(false);
      expect(await p.exists(".universal-ai-config/skills/update-hook")).toBe(false);
      // Only uac's own seeded files move
      expect(await p.exists(".universal-ai-config/skills/team-skill/SKILL.md")).toBe(true);
      expect(await p.exists(".agents/skills/update-hook/SKILL.md")).toBe(true);
      expect(await drift(p)).toEqual({ missing: 0, differ: 0, misplaced: 0 });
    });

    it("standards → template mode", async () => {
      const p = await project(true);
      await p.write("AGENTS.md", "# Team rules\n");
      await p.write(".agents/skills/team-skill/SKILL.md", "---\nname: team-skill\n---\n");
      await seed(p);
      await p.config({});

      expect(await drift(p)).toMatchObject({ misplaced: 10 });
      await seed(p);
      expect(await p.read("AGENTS.md")).toBe("# Team rules\n");
      expect(await p.exists(".universal-ai-config/AGENTS.md")).toBe(false);
      expect(await p.exists(".agents/skills/update-hook")).toBe(false);
      expect(await p.exists(".agents/skills/team-skill/SKILL.md")).toBe(true);
      expect(await p.exists(".universal-ai-config/instructions/uac-usage.md")).toBe(true);
      expect(await p.exists(".universal-ai-config/skills/update-hook/SKILL.md")).toBe(true);
      expect(await drift(p)).toEqual({ missing: 0, differ: 0, misplaced: 0 });
    });
  });

  it("seed examples skips the types kept in a standard", async () => {
    const p = await project(true);
    await p.run("seed", ["examples"]);
    expect(await p.exists(".universal-ai-config/instructions")).toBe(false);
    expect(await p.exists(".universal-ai-config/skills")).toBe(false);
    expect(await p.exists(".universal-ai-config/agents")).toBe(true);
    expect(await p.exists(".universal-ai-config/hooks")).toBe(true);
  });
});
