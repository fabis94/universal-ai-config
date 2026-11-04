import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { consola } from "consola";
import { generate } from "../../src/core/generate/index.js";
import type { Target } from "../../src/types.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures/docs-project");
const ALL_TARGETS: Target[] = ["claude", "copilot", "cursor", "codex"];

function findContent(files: { path: string; content: string }[], needle: string): string {
  const file = files.find((f) => f.path.includes(needle) || f.content.includes(needle));
  expect(file, `no generated file matching "${needle}"`).toBeDefined();
  return file!.content;
}

describe("reference docs (docs/ + docPath)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a project-root-relative path for docs in templatesDir", async () => {
    const files = await generate({ root: FIXTURES_DIR, targets: ["claude"] });
    const content = findContent(files, "uses-docs");

    expect(content).toContain("- local: .universal-ai-config/docs/guide.md");
    expect(content).toContain("- nested: .universal-ai-config/docs/nested/topic.md");
    expect(content).toContain("- with-suffix: .universal-ai-config/docs/guide.md");
    expect(content).toContain("- dir: .universal-ai-config/docs");
  });

  it("resolves docs that only exist in an additionalTemplateDirs entry", async () => {
    const files = await generate({ root: FIXTURES_DIR, targets: ["claude"] });
    expect(findContent(files, "uses-docs")).toContain(
      "- shared-only: shared-templates/docs/shared-only.md",
    );
  });

  it("prefers the templatesDir copy when a doc exists in several sources", async () => {
    const files = await generate({ root: FIXTURES_DIR, targets: ["claude"] });
    const content = findContent(files, "uses-docs");
    expect(content).toContain("- both: .universal-ai-config/docs/both.md");
    expect(content).not.toContain("shared-templates/docs/both.md");
  });

  it("renders the same doc path for every target", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ALL_TARGETS,
      types: ["instructions"],
    });
    for (const target of ALL_TARGETS) {
      const targetFiles = files.filter((f) => f.target === target);
      const content = findContent(targetFiles, "- local:");
      expect(content, target).toContain("- local: .universal-ai-config/docs/guide.md");
      expect(content, target).toContain("- shared-only: shared-templates/docs/shared-only.md");
    }
  });

  it("resolves docPath in skill bodies and skill extra files", async () => {
    const files = await generate({ root: FIXTURES_DIR, targets: ["claude"], types: ["skills"] });

    const skill = files.find((f) => f.path === ".claude/skills/doc-skill/SKILL.md");
    expect(skill!.content).toContain("Read .universal-ai-config/docs/guide.md first.");

    const extra = files.find((f) => f.path === ".claude/skills/doc-skill/reference.md");
    expect(extra!.content).toContain(
      "Reference extra file linking .universal-ai-config/docs/nested/topic.md.",
    );
  });

  it("never emits docs as generated files or treats them as templates", async () => {
    const files = await generate({ root: FIXTURES_DIR, targets: ALL_TARGETS });
    for (const file of files) {
      expect(file.path).not.toContain("docs/");
      expect(file.content).not.toContain("LOCAL guide doc");
      expect(file.content).not.toContain("SHARED only doc");
    }
  });

  it("warns once per missing doc name and falls back to the templatesDir path", async () => {
    const warn = vi.spyOn(consola, "warn").mockImplementation(() => {});
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ALL_TARGETS,
      types: ["instructions"],
      templates: [
        {
          type: "instructions",
          name: "broken-link",
          content:
            "---\ndescription: broken\nglobs: [\"src/**\"]\n---\n\n- missing: <%= docPath('missing') %>\n",
        },
      ],
    });

    const content = findContent(
      files.filter((f) => f.target === "claude"),
      "broken-link",
    );
    expect(content).toContain("- missing: .universal-ai-config/docs/missing.md");

    const docWarnings = warn.mock.calls.filter((call) => String(call[0]).includes("docPath("));
    expect(docWarnings).toHaveLength(1);
    expect(String(docWarnings[0]![0])).toContain("docPath('missing')");
  });

  it("does not warn when every docPath name resolves", async () => {
    const warn = vi.spyOn(consola, "warn").mockImplementation(() => {});
    await generate({ root: FIXTURES_DIR, targets: ALL_TARGETS });
    expect(warn.mock.calls.filter((call) => String(call[0]).includes("docPath("))).toHaveLength(0);
  });

  describe("docs outside the project root", () => {
    let root: string;
    let outside: string;

    afterEach(async () => {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    });

    it("renders an absolute path for a doc in a template dir outside the project", async () => {
      root = await mkdtemp(join(tmpdir(), "uac-docs-root-"));
      outside = await mkdtemp(join(tmpdir(), "uac-docs-shared-"));

      await mkdir(join(root, ".universal-ai-config/instructions"), { recursive: true });
      await writeFile(
        join(root, ".universal-ai-config/instructions/rule.md"),
        "---\ndescription: rule\nalwaysApply: true\n---\n\nSee <%= docPath('team/style') %>\n",
      );
      await mkdir(join(outside, "docs/team"), { recursive: true });
      await writeFile(join(outside, "docs/team/style.md"), "Team style guide\n");

      const files = await generate({
        root,
        targets: ["claude"],
        types: ["instructions"],
        overrides: { additionalTemplateDirs: [outside] },
      });

      const rule = files.find((f) => f.path.includes("rule"));
      expect(rule!.content).toContain(`See ${join(outside, "docs/team/style.md")}`);
    });
  });
});
