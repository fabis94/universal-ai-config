import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateProject } from "../../src/core/generate/index.js";
import type { StandardsSetting, Target, UserConfig } from "../../src/types.js";
import { text } from "../test-helpers.js";
import type { CliProject } from "./cli-project.js";
import { createStandardsProject } from "./standards-project.js";

const ALL_TARGETS: Target[] = ["claude", "copilot", "cursor", "codex"];

// Generate never writes to disk, so every test shares one project
let project: CliProject;
let FIXTURE: string;
beforeAll(async () => {
  project = await createStandardsProject();
  FIXTURE = project.root;
});
afterAll(async () => {
  await project.dispose();
});

async function run(
  targets: Target[],
  standards: StandardsSetting = true,
  overrides: UserConfig = {},
) {
  return generateProject({
    root: FIXTURE,
    targets,
    overrides: { standards, ...overrides },
    onDiagnostic: () => {},
  });
}

const paths = (files: { path: string }[]) => files.map((f) => f.path).sort();
const codes = (diagnostics: { code: string }[]) => [...new Set(diagnostics.map((d) => d.code))];

describe("standards: true — every target", () => {
  it("generates Claude's skill copies plus hooks, MCP and agents — nothing else", async () => {
    const { files } = await run(ALL_TARGETS);
    const skillFiles = files.filter((f) => f.type === "skills");
    expect(paths(skillFiles)).toEqual([
      ".claude/skills/deploy/SKILL.md",
      ".claude/skills/helper/SKILL.md",
      ".claude/skills/helper/assets/logo.png",
      ".claude/skills/helper/scripts/run.sh",
    ]);
    expect(new Set(skillFiles.map((f) => f.target))).toEqual(new Set(["claude"]));
    expect(files.filter((f) => f.type === "instructions")).toEqual([]);
    expect(paths(files.filter((f) => f.type === "agents"))).toEqual([
      ".claude/agents/reviewer.md",
      ".codex/agents/reviewer.toml",
      ".cursor/agents/reviewer.md",
      ".github/agents/reviewer.agent.md",
    ]);
    expect(files.some((f) => f.type === "hooks")).toBe(true);
    expect(files.some((f) => f.type === "mcp")).toBe(true);
  });

  it("never writes AGENTS.md or anything in .agents/skills", async () => {
    const { files } = await run(ALL_TARGETS);
    for (const file of files) {
      expect(file.path).not.toMatch(/(^|\/)AGENTS(\.override)?\.md$/);
      expect(file.path.startsWith(".agents/")).toBe(false);
    }
  });

  it("copies every file byte for byte — no EJS, no frontmatter mapping", async () => {
    const { files } = await run(["claude"]);
    const skill = files.find((f) => f.path === ".claude/skills/helper/SKILL.md");
    const source = await readFile(join(FIXTURE, ".agents/skills/helper/SKILL.md"));
    expect(Buffer.from(skill!.content).equals(source)).toBe(true);
    expect(text(skill)).toContain("<%= target %>");
    expect(text(skill)).toContain("allowed-tools: Read Grep");

    const logo = files.find((f) => f.path === ".claude/skills/helper/assets/logo.png");
    const logoSource = await readFile(join(FIXTURE, ".agents/skills/helper/assets/logo.png"));
    expect(Buffer.from(logo!.content).equals(logoSource)).toBe(true);
    expect(skill!.sourcePath).toBe(".agents/skills/helper/SKILL.md");
  });

  it("path helpers in agents point at the standards", async () => {
    const { files } = await run(["claude", "cursor"]);
    const claude = text(files.find((f) => f.path === ".claude/agents/reviewer.md"));
    expect(claude).toContain("Use the .claude/skills/helper/SKILL.md skill");
    expect(claude).toContain("Its source is .agents/skills/helper/SKILL.md");
    const cursor = text(files.find((f) => f.path === ".cursor/agents/reviewer.md"));
    expect(cursor).toContain("Use the .agents/skills/helper/SKILL.md skill");
  });

  it("warns that the instruction and skill templates are ignored", async () => {
    const { diagnostics } = await run(ALL_TARGETS);
    const ignored = diagnostics.filter((d) => d.code === "standard-ignored");
    expect(ignored.map((d) => [d.type, d.detail])).toEqual([
      [
        "instructions",
        { standard: "agentsMd", paths: [".universal-ai-config/instructions/stray.md"] },
      ],
      [
        "skills",
        { standard: "agentSkills", paths: [".universal-ai-config/skills/stray/SKILL.md"] },
      ],
    ]);
  });

  it("raises no template-mode warnings: no served-by, no AGENTS.override.md", async () => {
    const { diagnostics } = await run(ALL_TARGETS);
    expect(codes(diagnostics)).not.toContain("agents-override-present");
    expect(diagnostics.filter((d) => d.code === "served-by").map((d) => d.type)).toEqual([
      "hooks",
      "mcp",
    ]);
  });

  it("checks each skill against the Agent Skills spec once", async () => {
    const { diagnostics } = await run(ALL_TARGETS, true, {
      exclude: { claude: [".agents/skills/deploy/**"], default: [] },
    });
    expect(diagnostics.filter((d) => d.code === "skill-spec")).toEqual([]);
  });
});

describe("standards — exclude only affects the copies", () => {
  it("matches .agents/skills/<name>/SKILL.md and skills/<name>/SKILL.md", async () => {
    for (const pattern of [".agents/skills/deploy/SKILL.md", "skills/deploy/SKILL.md"]) {
      const { files } = await run(["claude"], true, {
        exclude: { claude: [pattern], default: [] },
      });
      expect(paths(files.filter((f) => f.type === "skills"))).not.toContain(
        ".claude/skills/deploy/SKILL.md",
      );
      expect(paths(files)).toContain(".claude/skills/helper/SKILL.md");
    }
  });
});

describe('standards: "skills" — instructions stay templates', () => {
  it("codex still forces generated AGENTS.md; .agents/skills is untouched", async () => {
    const { files, plan } = await run(["claude", "codex"], "skills");
    expect(plan.agentsMd).toBeDefined();
    expect(paths(files)).toContain("AGENTS.md");
    expect(text(files.find((f) => f.path === "AGENTS.md"))).toContain("Stray instruction.");
    expect(files.some((f) => f.path.startsWith(".agents/"))).toBe(false);
    expect(paths(files.filter((f) => f.type === "skills"))).toContain(
      ".claude/skills/helper/SKILL.md",
    );
  });
});

describe('standards: "instructions" — skills stay templates', () => {
  it("no AGENTS.md is generated; codex writes .agents/skills from the templates", async () => {
    const { files, plan } = await run(["claude", "codex"], "instructions");
    expect(plan.agentsMd).toBeUndefined();
    expect(files.some((f) => f.path.endsWith("AGENTS.md"))).toBe(false);
    expect(paths(files.filter((f) => f.type === "skills"))).toEqual([
      ".agents/skills/stray/SKILL.md",
      ".claude/skills/stray/SKILL.md",
    ]);
  });
});

describe("standards — AGENTS.md checks", () => {
  it("warns when Claude would ignore the project's AGENTS.md (checked in the CLAUDE.md tests)", async () => {
    // The fixture has no CLAUDE.md and a root AGENTS.md: nothing to warn about
    const { diagnostics } = await run(ALL_TARGETS);
    expect(codes(diagnostics)).not.toContain("claude-md-present");
    expect(codes(diagnostics)).not.toContain("agents-md-missing");
  });
});

describe("mode parity — hooks, MCP and agents don't depend on standards", () => {
  for (const targets of [
    ["claude"],
    ["copilot"],
    ["cursor"],
    ["codex"],
    ALL_TARGETS,
  ] as Target[][]) {
    it(`-t ${targets.join(",")}`, async () => {
      const pick = (result: Awaited<ReturnType<typeof run>>) =>
        result.files
          .filter((f) => f.type === "hooks" || f.type === "mcp" || f.type === "agents")
          .map((f) => ({ path: f.path, content: text(f), consumers: f.consumers }))
          .sort((a, b) => a.path.localeCompare(b.path));
      const templateMode = await run(targets, false);
      const standardsMode = await run(targets, true);
      // Agents render skill paths, which do follow the mode; compare the rest
      const withoutSkillPaths = (entries: ReturnType<typeof pick>) =>
        entries.map((e) => ({ ...e, content: e.content.replace(/\S*skills\/helper\S*/g, "…") }));
      expect(withoutSkillPaths(pick(standardsMode))).toEqual(withoutSkillPaths(pick(templateMode)));
    });
  }
});
