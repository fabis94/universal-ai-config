import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/config/defaults.js";
import { parseFrontmatter, parseTemplate } from "../../src/core/parser.js";
import { createLocator } from "../../src/core/plan/locate.js";
import { getTemplates } from "../../src/seed-types/meta-instructions/index.js";
import {
  planMetaInstructions,
  type ObsoleteItem,
  type SeedEntry,
} from "../../src/seed-types/meta-instructions/placement.js";
import type { ResolvedConfig, StandardsSetting, Target } from "../../src/types.js";

const config = (standards: StandardsSetting, extra: Partial<ResolvedConfig> = {}) => ({
  ...DEFAULT_CONFIG,
  standards,
  ...extra,
});
const plan = (standards: StandardsSetting, extra?: Partial<ResolvedConfig>) =>
  planMetaInstructions(config(standards, extra));
const at = (entries: SeedEntry[], path: string): SeedEntry => {
  const entry = entries.find((e) => e.destination.path === path);
  if (!entry) throw new Error(`no seed entry at ${path}`);
  return entry;
};
const content = (entries: SeedEntry[], path: string) => at(entries, path).content;

const SKILLS = [
  "ai-config-compress",
  "import-existing-ai-config",
  "update-agent",
  "update-ai-config",
  "update-hook",
  "update-instruction",
  "update-mcp",
  "update-skill",
];

/** Seed escapes that must never reach a file tools read as it is. */
const ESCAPES = ["<%%", "%%>", "guidePathHelper"];

/** `<%=` tags: after the seed's first pass, generate-time tags; in final output, literal examples. */
const tags = (text: string) => (text.match(/<%=/g) ?? []).length;
/** `<%%=`: literal EJS examples after the first pass (they become `<%=` once rendered again). */
const literalTags = (text: string) => (text.match(/<%%=/g) ?? []).length;

/** The first-pass sources an entry was rendered from. */
function sourcesOf(entry: SeedEntry, standards: StandardsSetting): string[] {
  const c = config(standards);
  const flags = {
    instructions: standards === true || standards === "instructions",
    skills: standards === true || standards === "skills",
  };
  const templates = getTemplates(c.templatesDir, c.types, flags);
  const { kind, path } = entry.destination;
  if (kind === "block") {
    const name = path === "AGENTS.md" ? "uac-usage" : "uac-template-guide";
    return [templates.find((t) => t.relativePath === `instructions/${name}.md`)!.content];
  }
  const relative = path.replace(/^\.agents\//, "");
  return [templates.find((t) => t.relativePath === relative)!.content];
}

/** Entries a tool reads as they are: AGENTS.md blocks and `.agents/skills` files. */
const standardBound = (entries: SeedEntry[]) =>
  entries.filter(
    (e) => e.destination.kind === "block" || e.destination.path.startsWith(".agents/"),
  );

/** Obsolete items as one short string each, sorted. */
const moved = (obsolete: ObsoleteItem[]) =>
  obsolete.map((item) => `${item.kind} ${item.kind === "skill" ? item.name : item.path}`).sort();

const STANDARD_PLACES = [
  "block .universal-ai-config/AGENTS.md",
  "block AGENTS.md",
  ...SKILLS.map((s) => `skill ${s}`),
];
const TEMPLATE_PLACES = [
  "path .universal-ai-config/instructions/uac-template-guide.md",
  "path .universal-ai-config/instructions/uac-usage.md",
  ...SKILLS.map((s) => `path .universal-ai-config/skills/${s}`),
];

describe("meta-instructions placement", () => {
  it("template mode: every file in the templates dir; uac's standards copies move back", () => {
    const { entries, obsolete } = plan(false);
    expect(moved(obsolete)).toEqual(STANDARD_PLACES.sort());
    expect(entries.every((e) => e.destination.kind === "file")).toBe(true);
    expect(entries.map((e) => e.destination.path).sort()).toEqual(
      getTemplates(".universal-ai-config")
        .map((t) => `.universal-ai-config/${t.relativePath}`)
        .sort(),
    );
  });

  it("standards: true — blocks in AGENTS.md, skills in .agents/skills, docs stay", () => {
    const { entries, obsolete } = plan(true);
    const where = entries.map((e) => `${e.destination.kind} ${e.destination.path}`);
    expect(where).toContain("block AGENTS.md");
    expect(where).toContain("block .universal-ai-config/AGENTS.md");
    for (const skill of SKILLS) expect(where).toContain(`file .agents/skills/${skill}/SKILL.md`);
    expect(where).toContain("file .universal-ai-config/docs/uac/standards.md");
    expect(where.some((w) => w.includes(".universal-ai-config/instructions/"))).toBe(false);
    expect(where.some((w) => w.includes(".universal-ai-config/skills/"))).toBe(false);
    expect(entries.filter((e) => e.skill).every((e) => SKILLS.includes(e.skill!))).toBe(true);
    expect(moved(obsolete)).toEqual(TEMPLATE_PLACES.sort());
  });

  it('"instructions": only the instructions move', () => {
    const { entries, obsolete } = plan("instructions");
    expect(
      entries.filter((e) => e.destination.kind === "block").map((e) => e.destination.path),
    ).toEqual(["AGENTS.md", ".universal-ai-config/AGENTS.md"]);
    expect(entries.some((e) => e.destination.path.startsWith(".agents/"))).toBe(false);
    expect(at(entries, ".universal-ai-config/skills/update-hook/SKILL.md")).toBeDefined();
    expect(moved(obsolete)).toEqual(
      [
        ...TEMPLATE_PLACES.filter((p) => p.includes("/instructions/")),
        ...SKILLS.map((s) => `skill ${s}`),
      ].sort(),
    );
  });

  it('"skills": only the skills move', () => {
    const { entries, obsolete } = plan("skills");
    expect(entries.some((e) => e.destination.kind === "block")).toBe(false);
    expect(at(entries, ".universal-ai-config/instructions/uac-usage.md")).toBeDefined();
    expect(at(entries, ".agents/skills/update-hook/SKILL.md").skill).toBe("update-hook");
    expect(moved(obsolete)).toEqual(
      [
        "block .universal-ai-config/AGENTS.md",
        "block AGENTS.md",
        ...TEMPLATE_PLACES.filter((p) => p.includes("/skills/")),
      ].sort(),
    );
  });

  it("follows a custom templatesDir", () => {
    const { entries } = plan(true, { templatesDir: "ai-config" });
    expect(at(entries, "ai-config/AGENTS.md").destination.kind).toBe("block");
    expect(content(entries, "AGENTS.md")).toContain("templates in `ai-config/`");
  });
});

describe("standard-bound files are fully rendered", () => {
  for (const standards of [true, "instructions", "skills"] as const) {
    it(`standards: ${String(standards)} — every generate-time tag is resolved, only literal examples remain`, () => {
      const bound = standardBound(plan(standards).entries);
      expect(bound.length).toBeGreaterThan(0);
      for (const entry of bound) {
        const where = entry.destination.path;
        for (const escape of ESCAPES)
          expect(entry.content, `${where}: ${escape}`).not.toContain(escape);
        const sources = sourcesOf(entry, standards);
        const literal = sources.reduce((n, source) => n + literalTags(source), 0);
        expect(tags(entry.content), where).toBe(literal);
        expect(entry.content, where).not.toContain("docPath('uac/");
      }
    });
  }

  it("render the same for every tool that reads them", () => {
    // Seeded for one view target; every reader of the standard must get the same links
    const c = config(true);
    const templates = getTemplates(c.templatesDir, c.types, { instructions: true, skills: true });
    const locator = createLocator(c);
    for (const template of templates.filter((t) => t.relativePath.startsWith("skills/"))) {
      const bodies = (["copilot", "cursor", "codex"] as Target[]).map(
        (target) =>
          parseTemplate(template.content, { target, type: "skills", config: c, locator }).body,
      );
      expect(new Set(bodies).size, template.relativePath).toBe(1);
    }
  });
});

describe("seeded skills in .agents/skills — frontmatter", () => {
  const { entries } = plan(true);

  it("use Agent Skills field names and carry uac's marker", () => {
    for (const skill of SKILLS) {
      const raw = content(entries, `.agents/skills/${skill}/SKILL.md`);
      const { frontmatter } = parseFrontmatter(raw);
      const fm = frontmatter as Record<string, unknown>;
      expect(fm.name, skill).toBe(skill);
      expect(fm.metadata, skill).toMatchObject({ "managed-by": "universal-ai-config" });
      expect(
        Object.keys(fm).filter((key) => /[A-Z]/.test(key)),
        skill,
      ).toEqual([]);
    }
    const hook = parseFrontmatter(content(entries, ".agents/skills/update-hook/SKILL.md"));
    expect(hook.frontmatter).toMatchObject({ "user-invocable": false });
    const importer = parseFrontmatter(
      content(entries, ".agents/skills/import-existing-ai-config/SKILL.md"),
    );
    expect(importer.frontmatter).toMatchObject({
      "argument-hint": "[target: claude|copilot|cursor|codex]",
    });
  });

  it("template mode keeps universal fields and no marker", () => {
    const template = content(
      plan(false).entries,
      ".universal-ai-config/skills/update-hook/SKILL.md",
    );
    expect(template).toContain("userInvocable: false");
    expect(template).not.toContain("managed-by");
  });
});

describe("seeded content adapts to the mode", () => {
  describe("standards: true", () => {
    const { entries } = plan(true);
    const usage = content(entries, "AGENTS.md");
    const guide = content(entries, ".universal-ai-config/AGENTS.md");
    const skill = (name: string) => content(entries, `.agents/skills/${name}/SKILL.md`);

    it("uac-usage (root AGENTS.md block) names the standards as sources", () => {
      expect(usage).toContain("Written by `uac seed meta-instructions`");
      expect(usage).toContain("**Instructions** are the project's own `AGENTS.md` files");
      expect(usage).toContain("**Skills** are the project's own `.agents/skills/<name>/` folders");
      expect(usage).toContain(
        "copy skills from a GitHub repo or local path into `.agents/skills/`",
      );
      expect(usage).toContain("`.universal-ai-config/docs/uac/standards.md`");
      expect(usage).toContain("`.universal-ai-config/AGENTS.md`"); // the guide
      // agentsMd doesn't apply while instructions come from AGENTS.md
      expect(usage).not.toContain("- `agentsMd` —");
      expect(usage).not.toContain("from a single set of templates");
    });

    it("the template guide (templates-dir AGENTS.md block) describes AGENTS.md and .agents/skills", () => {
      expect(guide).toContain("This project keeps instructions and skills in open standards");
      expect(guide).toContain("### Instructions (`AGENTS.md` files)");
      expect(guide).toContain("### Skills (`.agents/skills/*/SKILL.md`)");
      expect(guide).toContain("`AGENTS.md` files have no frontmatter");
      expect(guide).toContain("Skills use the Agent Skills fields as the tools read them");
      expect(guide).not.toContain("| `excludeAgent` |");
      expect(guide).toContain("### Agents (`.universal-ai-config/agents/*.md`)");
    });

    it("update-ai-config lets the agent edit the standards and links them", () => {
      const dispatcher = skill("update-ai-config");
      expect(dispatcher).not.toContain("`AGENTS.md` files, `.agents/`");
      expect(dispatcher).not.toContain("any `AGENTS.md`");
      expect(dispatcher).toContain("instructions, which are the project's own `AGENTS.md` files");
      expect(dispatcher).toContain("template guide at `.universal-ai-config/AGENTS.md`");
      expect(dispatcher).toContain("`.agents/skills/update-hook/SKILL.md`");
    });

    it("update-instruction and update-skill edit the standards, not templates", () => {
      const instruction = skill("update-instruction");
      expect(instruction).toContain("# Manage Instructions (AGENTS.md)");
      expect(instruction).toContain("<!-- >>> universal-ai-config >>> -->");
      expect(instruction).not.toContain("alwaysApply");
      expect(parseFrontmatter(instruction).frontmatter).toMatchObject({
        description: expect.stringContaining("AGENTS.md instructions"),
      });
      const skillSkill = skill("update-skill");
      expect(skillSkill).toContain("# Manage Skills (.agents/skills)");
      expect(skillSkill).toContain("argument-hint:");
      expect(skillSkill).not.toContain("disableAutoInvocation");
    });

    it("import-existing-ai-config routes instructions and skills to the standards", () => {
      const importer = skill("import-existing-ai-config");
      expect(importer).toContain("- Instructions → the project's `AGENTS.md` files (see below)");
      expect(importer).toContain("- Skills → `.agents/skills/{name}/` (see below)");
      expect(importer).toContain("**Open standards (`standards` in the config).**");
      expect(importer).toContain("- Agents → `.universal-ai-config/agents/{name}.md`");
    });

    it("update-agent and update-skill link the guide for every tool", () => {
      expect(skill("update-agent")).toContain(
        "Per-target override syntax: `.universal-ai-config/AGENTS.md`",
      );
    });
  });

  describe('"skills" — instructions stay templates', () => {
    const { entries } = plan("skills");
    it("skills link the guide's template, which every tool can open", () => {
      for (const name of ["update-agent", "update-ai-config", "update-instruction"]) {
        expect(content(entries, `.agents/skills/${name}/SKILL.md`), name).toContain(
          ".universal-ai-config/instructions/uac-template-guide.md",
        );
      }
    });
    it("uac-usage stays a template, with the skills wording", () => {
      const usage = content(entries, ".universal-ai-config/instructions/uac-usage.md");
      expect(usage).toContain("**Skills** are the project's own");
      expect(usage).not.toContain("**Instructions** are the project's own");
      expect(usage).toContain("- `agentsMd` —");
      expect(usage).toContain("alwaysApply: true");
    });
    it("update-instruction keeps the template workflow", () => {
      const instruction = content(entries, ".agents/skills/update-instruction/SKILL.md");
      expect(instruction).toContain("# Manage Instruction Templates");
    });
  });

  describe('"instructions" — skills stay templates', () => {
    const { entries } = plan("instructions");
    it("skills are templates with the AGENTS.md wording, resolved at generate", () => {
      const instruction = content(
        entries,
        ".universal-ai-config/skills/update-instruction/SKILL.md",
      );
      expect(instruction).toContain("# Manage Instructions (AGENTS.md)");
      expect(instruction).toContain("<%= docPath('uac/standards') %>");
      const dispatcher = content(entries, ".universal-ai-config/skills/update-ai-config/SKILL.md");
      expect(dispatcher).toContain("<%= instructionPath('uac-template-guide') %>");
      expect(content(entries, ".universal-ai-config/skills/update-skill/SKILL.md")).toContain(
        "# Manage Skill Templates",
      );
    });
  });

  it("template mode keeps every template-mode sentence", () => {
    const { entries } = plan(false);
    const usage = content(entries, ".universal-ai-config/instructions/uac-usage.md");
    expect(usage).toContain("from a single set of templates");
    expect(usage).toContain("- `standards` —");
    expect(usage).not.toContain("are the project's own");
    expect(content(entries, ".universal-ai-config/skills/update-ai-config/SKILL.md")).toContain(
      "`AGENTS.md` files, `.agents/`",
    );
  });

  it("uac-usage stays under its budget in every mode", () => {
    for (const standards of [false, true, "instructions", "skills"] as const) {
      const entry = plan(standards).entries.find(
        (e) =>
          e.destination.path === "AGENTS.md" ||
          e.destination.path.endsWith("instructions/uac-usage.md"),
      )!;
      expect(Buffer.byteLength(entry.content), String(standards)).toBeLessThan(5 * 1024);
    }
  });
});
