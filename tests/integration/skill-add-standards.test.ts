import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CliProject } from "./cli-project.js";

/** The terminal, as the commands see it: whether they may prompt, and the answers given. */
const terminal = vi.hoisted(() => ({
  interactive: false,
  answers: [] as boolean[],
  asked: [] as string[],
}));

vi.mock("../../src/commands/interactive.js", () => ({
  canPrompt: () => terminal.interactive,
  confirmAction: async (message: string) => {
    terminal.asked.push(message);
    return terminal.answers.shift() ?? false;
  },
  selectMany: async () => undefined,
}));

const REMOTE = join(import.meta.dirname, "../fixtures/remote-skills-repo");

describe("uac skill add — where skills go", () => {
  const projects: CliProject[] = [];
  afterEach(async () => {
    for (const p of projects.splice(0)) await p.dispose();
    terminal.interactive = false;
    terminal.answers = [];
    terminal.asked = [];
  });
  async function project(config: Record<string, unknown>): Promise<CliProject> {
    const p = await CliProject.create();
    projects.push(p);
    await p.config(config);
    return p;
  }

  it("template mode: into the templates dir", async () => {
    const p = await project({});
    const logs = await p.run("skill", ["add", REMOTE, "--all"]);
    expect(await p.exists(".universal-ai-config/skills/alpha-skill/SKILL.md")).toBe(true);
    expect(await p.exists(".agents/skills")).toBe(false);
    expect(logs.join("\n")).toContain("Run `uac generate` to produce target configs.");
  });

  for (const standards of [true, "skills"] as const) {
    it(`standards: ${String(standards)} — into .agents/skills, extra files included`, async () => {
      const p = await project({ standards });
      const logs = await p.run("skill", ["add", REMOTE, "--all"]);
      expect(await p.exists(".agents/skills/alpha-skill/SKILL.md")).toBe(true);
      expect(await p.exists(".agents/skills/alpha-skill/references")).toBe(true);
      expect(await p.exists(".universal-ai-config/skills")).toBe(false);
      expect(logs.join("\n")).toContain(
        "Tools that read .agents/skills see them now; run `uac generate` for the copies the others need.",
      );
    });
  }

  it('standards: "instructions" — skills are still templates', async () => {
    const p = await project({ standards: "instructions" });
    await p.run("skill", ["add", REMOTE, "--all"]);
    expect(await p.exists(".universal-ai-config/skills/alpha-skill/SKILL.md")).toBe(true);
  });

  it("standards: prefers a plain skill folder over a uac template copy, and warns about templates", async () => {
    const source = await project({});
    await source.write(
      ".universal-ai-config/skills/both/SKILL.md",
      "---\nname: both\ndescription: template copy\n---\nFor <%= target %>.\n",
    );
    await source.write(
      ".agents/skills/both/SKILL.md",
      "---\nname: both\ndescription: plain\n---\n",
    );
    await source.write(
      ".universal-ai-config/skills/only-template/SKILL.md",
      "---\nname: only-template\ndescription: x\n---\nFor <%= target %>.\n",
    );

    const p = await project({ standards: true });
    const logs = await p.run("skill", ["add", source.root, "--all"]);
    expect(await p.read(".agents/skills/both/SKILL.md")).toContain("description: plain");
    expect(
      logs.some((l) => l.includes("only-template") && l.includes("uac template with EJS")),
    ).toBe(true);
    expect(logs.some((l) => l.startsWith("both ") && l.includes("EJS"))).toBe(false);

    // Template mode keeps preferring the template source
    const t = await project({});
    await t.run("skill", ["add", source.root, "-s", "both"]);
    expect(await t.read(".universal-ai-config/skills/both/SKILL.md")).toContain("template copy");
  });

  it("the confirm prompt names the folder and every skill it replaces", async () => {
    const p = await project({ standards: true });
    await p.write(".agents/skills/alpha-skill/SKILL.md", "---\nname: alpha-skill\n---\nours\n");
    terminal.interactive = true;
    terminal.answers = [false];
    await p.run("skill", ["add", REMOTE, "-s", "alpha-skill,beta-skill"]);

    expect(terminal.asked).toHaveLength(1);
    const [message] = terminal.asked;
    expect(message).toContain("Install 2 skill(s) into .agents/skills?");
    expect(message).toMatch(/alpha-skill \([^)]*, replaces the existing one\)/);
    expect(message).not.toMatch(/beta-skill \([^)]*replaces/);
    // Declined: nothing changed
    expect(await p.read(".agents/skills/alpha-skill/SKILL.md")).toContain("ours");
  });
});
