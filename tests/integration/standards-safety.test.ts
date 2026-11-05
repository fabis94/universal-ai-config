/**
 * Standards mode's promise: no uac command overwrites or deletes the
 * project's own files — the standards themselves, and the instruction and
 * skill folders of tools that read them. Every command that writes or deletes
 * runs here against one project, and every hand-written file must come out
 * byte for byte (the seed's marked AGENTS.md block aside).
 */
import { lstat, mkdir, readlink, symlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanTargetFiles } from "../../src/core/clean/index.js";
import type { StandardsSetting } from "../../src/types.js";
import type { CliProject } from "./cli-project.js";
import { createStandardsProject, STANDARD_FILES } from "./standards-project.js";

const REMOTE_SKILLS = join(import.meta.dirname, "../fixtures/remote-skills-repo");

/** Hand-written files: the fixture's, plus folders of tools that read the standards. */
const EXTRA: Record<string, string> = {
  ".claude/rules/claude-only.md": "Claude-only rule.\n",
  ".cursor/skills/cursor-only/SKILL.md": "---\nname: cursor-only\ndescription: x\n---\nx\n",
  ".github/skills/copilot-only/SKILL.md": "---\nname: copilot-only\ndescription: x\n---\nx\n",
  ".github/instructions/team.instructions.md": "---\napplyTo: '**'\n---\nTeam.\n",
  ".github/copilot-instructions.md": "Copilot rules.\n",
  "packages/api/AGENTS.override.md": "Override.\n",
};
const HAND_WRITTEN = [...Object.keys(STANDARD_FILES), ...Object.keys(EXTRA)];

const BLOCK =
  /\n*<!-- >>> universal-ai-config >>> -->[\s\S]*<!-- <<< universal-ai-config <<< -->\n?/;
/** A file's content minus uac's seeded block, which the seed may add. */
const withoutBlock = (text: string) => text.replace(BLOCK, "\n").replace(/\n+$/, "\n");

describe("standards: no command touches the project's own files", () => {
  const projects: CliProject[] = [];
  afterEach(async () => {
    for (const p of projects.splice(0)) await p.dispose();
  });

  async function project(): Promise<CliProject> {
    const p = await createStandardsProject();
    projects.push(p);
    for (const [rel, content] of Object.entries(EXTRA)) await p.write(rel, content);
    return p;
  }
  async function snapshot(p: CliProject): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const rel of HAND_WRITTEN) result[rel] = withoutBlock(await p.read(rel));
    return result;
  }

  const COMMANDS: Array<[string, Parameters<CliProject["run"]>]> = [
    ["generate", ["generate", []]],
    ["generate --clean", ["generate", ["--clean"]]],
    ["clean", ["clean", []]],
    ...(["claude", "copilot", "cursor", "codex"] as const).map(
      (t): [string, Parameters<CliProject["run"]>] => [`clean -t ${t}`, ["clean", ["-t", t]]],
    ),
    ...(["instructions", "skills", "all"] as const).map(
      (t): [string, Parameters<CliProject["run"]>] => [
        `clean --type ${t}`,
        ["clean", ["--type", t]],
      ],
    ),
    ["seed gitignore", ["seed", ["gitignore"]]],
    ["seed meta-instructions", ["seed", ["meta-instructions"]]],
    ["seed examples", ["seed", ["examples"]]],
    ["skill add", ["skill", ["add", REMOTE_SKILLS, "--all"]]],
    ["generate (after seeding)", ["generate", []]],
  ];

  it("every generate, clean, seed and skill add command, one after another", async () => {
    const p = await project();
    const before = await snapshot(p);
    for (const [label, [command, args]] of COMMANDS) {
      await p.run(command, args);
      expect(await snapshot(p), `after ${label}`).toEqual(before);
    }
    // What uac does write is still there
    expect(await p.exists(".claude/skills/helper/SKILL.md")).toBe(true);
    expect(await p.exists(".agents/skills/alpha-skill/SKILL.md")).toBe(true);
    expect(await p.read("AGENTS.md")).toContain("<!-- >>> universal-ai-config >>> -->");
    // ...and clean takes it away again, still sparing the rest
    await p.run("clean", []);
    expect(await p.exists(".claude/skills")).toBe(false);
    expect(await snapshot(p)).toEqual(before);
  });

  it("the .gitignore block never ignores the project's own files", async () => {
    const p = await project();
    await p.run("seed", ["gitignore"]);
    const lines = (await p.read(".gitignore")).split("\n");
    for (const pattern of [
      "AGENTS.md",
      ".agents/skills/",
      ".cursor/skills/",
      ".github/skills/",
      ".claude/rules/",
      ".cursor/rules/",
      ".github/instructions/",
      ".github/copilot-instructions.md",
    ]) {
      expect(lines).not.toContain(pattern);
    }
    expect(lines).toContain(".claude/skills/");
  });

  it("a committed .claude/skills link to .agents/skills: nothing copied into or cleaned through it", async () => {
    const p = await project();
    await mkdir(join(p.root, ".claude"), { recursive: true });
    await symlink("../.agents/skills", join(p.root, ".claude/skills"));
    // preserveOnClean under the link would make clean delete file by file, through it
    await p.config({ standards: true, preserveOnClean: [".claude/skills/helper/assets/**"] });
    const before = await snapshot(p);

    for (const [command, args] of [
      ["generate", []],
      ["clean", []],
      ["clean", ["-t", "claude", "--type", "skills"]],
      ["generate", ["--clean"]],
    ] as const) {
      await p.run(command, [...args]);
      expect(await snapshot(p), `${command} ${args.join(" ")}`).toEqual(before);
      expect((await lstat(join(p.root, ".claude/skills"))).isSymbolicLink()).toBe(true);
      expect(await readlink(join(p.root, ".claude/skills"))).toBe("../.agents/skills");
    }
  });

  it("cleanTargetFiles (API): `standards` spares the standards; omitted means template mode", async () => {
    const p = await project();
    await p.run("generate", []);
    const dry = (standards?: StandardsSetting) =>
      cleanTargetFiles(p.root, undefined, undefined, { dryRun: true, standards }).then((paths) =>
        paths.sort(),
      );

    const spared = await dry(true);
    expect(spared).toContain(".claude/skills");
    for (const path of spared) {
      expect(path.endsWith("AGENTS.md") || path.startsWith(".agents/")).toBe(false);
      expect(HAND_WRITTEN.some((rel) => rel === path || rel.startsWith(`${path}/`))).toBe(false);
    }
    // Template mode: uac owns every AGENTS.md (codex) and .agents/skills
    const templateMode = await dry();
    expect(templateMode).toContain("AGENTS.md");
    expect(templateMode).toContain(".agents/skills");
    expect(templateMode).toContain(".cursor/rules");
  });

  it("refuses `standards` in the per-machine overrides file before touching anything", async () => {
    const p = await project();
    await p.write("universal-ai-config.overrides.ts", "export default { standards: false };\n");
    const before = await snapshot(p);
    await expect(p.run("generate", [])).rejects.toThrow(/team setting/);
    await expect(p.run("clean", [])).rejects.toThrow(/team setting/);
    expect(await snapshot(p)).toEqual(before);
  });
});
