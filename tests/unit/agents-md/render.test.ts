import { describe, expect, it } from "vitest";
import { checkCodexBudget } from "../../../src/core/agents-md/checks.js";
import { buildAgentsMdFiles, type AgentsMdEntry } from "../../../src/core/agents-md/index.js";
import { INDEX_PREAMBLE } from "../../../src/core/agents-md/render.js";
import type { DiagnosticInput } from "../../../src/core/diagnostics.js";
import type { UniversalFrontmatter } from "../../../src/types.js";

const entry = (name: string, frontmatter: UniversalFrontmatter, body = `${name} body`) => ({
  name,
  sourcePath: `i/${name}.md`,
  frontmatter,
  body,
});

const layout = (variation: "nested" | "concatenate" | "index") => ({
  variation,
  indexDir: ".agents/uac-instructions",
});

describe("buildAgentsMdFiles", () => {
  const entries: AgentsMdEntry[] = [
    entry("zeta", { alwaysApply: true, description: "Zeta" }),
    entry("alpha", { description: "Alpha" }),
    entry("frontend", { globs: "packages/frontend/**", description: "Frontend" }),
    entry("tests", { globs: "**/*.test.ts", description: "Tests" }),
  ];

  it("nested: root sections alphabetical, folder files for folder globs", () => {
    const files = buildAgentsMdFiles(entries, layout("nested"));
    expect(files.map((f) => f.path)).toEqual(["AGENTS.md", "packages/frontend/AGENTS.md"]);
    expect(files[0]!.content).toBe(
      [
        "## Alpha\n\nalpha body\n",
        "## Tests\n\nApplies to files matching `**/*.test.ts`.\n\ntests body\n",
        "## Zeta\n\nzeta body\n",
      ].join("\n---\n\n"),
    );
    expect(files[1]!.content).toBe("## Frontend\n\nfrontend body\n");
    expect(files[0]!.sourcePaths).toEqual(["i/alpha.md", "i/tests.md", "i/zeta.md"]);
  });

  it("concatenate: one root file with scope notes", () => {
    const files = buildAgentsMdFiles(entries, layout("concatenate"));
    expect(files.map((f) => f.path)).toEqual(["AGENTS.md"]);
    expect(files[0]!.content).toContain(
      "## Frontend\n\nApplies to files in `packages/frontend/`.\n\nfrontend body\n",
    );
  });

  it("index: preamble and links first, then pattern sections, then always-on ones", () => {
    const files = buildAgentsMdFiles(entries, layout("index"));
    expect(files.map((f) => f.path)).toEqual(["AGENTS.md", ".agents/uac-instructions/frontend.md"]);
    expect(files[0]!.content).toBe(
      [
        `${INDEX_PREAMBLE}\n\n- \`packages/frontend/\` → \`.agents/uac-instructions/frontend.md\`\n`,
        "## Tests\n\nApplies to files matching `**/*.test.ts`.\n\ntests body\n",
        "## Alpha\n\nalpha body\n",
        "## Zeta\n\nzeta body\n",
      ].join("\n---\n\n"),
    );
    expect(files[0]!.sourcePaths).toContain("i/frontend.md");
    expect(files[1]!.content).toBe("## Frontend\n\nfrontend body\n");
  });

  it("uses the exact index preamble", () => {
    expect(INDEX_PREAMBLE).toBe(
      "## Scoped instructions\n\n" +
        "Before creating or editing files in a listed path, read the linked file in full.\n" +
        "Read each file once per session, and again if its contents are no longer in your context.\n" +
        "Where these files conflict with this one, they win.",
    );
  });

  it("joins several templates of one folder alphabetically", () => {
    const files = buildAgentsMdFiles(
      [entry("b", { globs: "web/**" }), entry("a", { globs: "web/**" })],
      layout("nested"),
    );
    expect(files).toHaveLength(1);
    expect(files[0]!.content).toBe("## a\n\na body\n\n---\n\n## b\n\nb body\n");
  });

  it("writes no root file when every template is folder-scoped (nested)", () => {
    const files = buildAgentsMdFiles([entry("a", { globs: "web/**" })], layout("nested"));
    expect(files.map((f) => f.path)).toEqual(["web/AGENTS.md"]);
  });
});

describe("checkCodexBudget", () => {
  const big = (kib: number) => "x".repeat(kib * 1024);

  it("reports a chain over 32 KiB once, where it starts", () => {
    const diagnostics: DiagnosticInput[] = [];
    checkCodexBudget(
      [
        { path: "AGENTS.md", content: big(20), sourcePaths: [] },
        { path: "pkg/AGENTS.md", content: big(13), sourcePaths: [] },
        { path: "pkg/deep/AGENTS.md", content: big(1), sourcePaths: [] },
        { path: "other/AGENTS.md", content: big(5), sourcePaths: [] },
        { path: ".agents/uac-instructions/x.md", content: big(40), sourcePaths: [] },
      ],
      (d) => diagnostics.push(d),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: "agents-md-size",
      path: "pkg/AGENTS.md",
      detail: { files: ["AGENTS.md", "pkg/AGENTS.md"], bytes: 33 * 1024, limit: 32 * 1024 },
    });
  });

  it("reports an oversized root alone", () => {
    const diagnostics: DiagnosticInput[] = [];
    checkCodexBudget(
      [
        { path: "AGENTS.md", content: big(33), sourcePaths: [] },
        { path: "pkg/AGENTS.md", content: big(1), sourcePaths: [] },
      ],
      (d) => diagnostics.push(d),
    );
    expect(diagnostics.map((d) => d.path)).toEqual(["AGENTS.md"]);
  });
});
