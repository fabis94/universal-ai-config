import { describe, expect, it } from "vitest";
import { INDEX_PREAMBLE } from "../../src/core/agents-md/render.js";
import { runAgentsMd } from "./agents-md-helpers.js";

describe("AGENTS.md — index variation", () => {
  it("writes the root file plus one index file per folder-scoped template", async () => {
    const run = await runAgentsMd(["codex"], { variation: "index" });
    expect(run.paths).toEqual([
      ".agents/uac-instructions/brace.md",
      ".agents/uac-instructions/dot-slash.md",
      ".agents/uac-instructions/folder.md",
      ".agents/uac-instructions/mixed.md",
      ".agents/uac-instructions/multi-folder.md",
      ".agents/uac-instructions/negated.md",
      "AGENTS.md",
    ]);
  });

  it("opens the root with the preamble and directory-only links", async () => {
    const run = await runAgentsMd(["codex"], { variation: "index" });
    const root = run.read("AGENTS.md");
    expect(root.startsWith(`${INDEX_PREAMBLE}\n\n`)).toBe(true);
    const links = root.split("\n").filter((line) => line.startsWith("- `"));
    expect(links).toEqual([
      "- `lib/` → `.agents/uac-instructions/brace.md`",
      "- `scripts/` → `.agents/uac-instructions/dot-slash.md`",
      "- `packages/frontend/` → `.agents/uac-instructions/folder.md`",
      "- `docs/` → `.agents/uac-instructions/mixed.md`",
      "- `packages/api/`, `packages/worker/` → `.agents/uac-instructions/multi-folder.md`",
      "- `src/app/` → `.agents/uac-instructions/negated.md`",
    ]);
  });

  it("inlines folder-less sections after the index, before the always-on ones", async () => {
    const run = await runAgentsMd(["codex"], { variation: "index" });
    const headings = [...run.read("AGENTS.md").matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual([
      "Scoped instructions",
      "Test files",
      "Docs and SQL",
      "Project standards",
      "Links",
      "General notes",
    ]);
  });

  it("writes partial-folder notes into the index file", async () => {
    const run = await runAgentsMd(["codex"], { variation: "index" });
    expect(run.read(".agents/uac-instructions/multi-folder.md")).toBe(
      "## Backend rules\n\nApplies to files matching `packages/worker/**/*.ts`.\n\nBackend body.\n",
    );
    expect(run.read(".agents/uac-instructions/folder.md")).toBe(
      "## Frontend rules\n\nFrontend body.\n",
    );
  });

  it("honours a custom indexDir and points instructionPath() at it", async () => {
    const run = await runAgentsMd(["codex"], { variation: "index", indexDir: "docs/ai/scoped/" });
    expect(run.paths).toContain("docs/ai/scoped/folder.md");
    expect(run.read("AGENTS.md")).toContain("- frontend: docs/ai/scoped/folder.md");
    expect(run.read("AGENTS.md")).toContain("- `packages/frontend/` → `docs/ai/scoped/folder.md`");
  });

  it("inlines a template whose index file name tools would load", async () => {
    const run = await runAgentsMd(
      ["codex"],
      { variation: "index" },
      {
        templates: [
          {
            name: "claude",
            type: "instructions",
            content: '---\nglobs: "tools/**"\n---\nTools.\n',
          },
        ],
      },
    );
    expect(run.paths).not.toContain(".agents/uac-instructions/claude.md");
    expect(run.read("AGENTS.md")).toContain("## claude\n\nApplies to files in `tools/`.\n\nTools.");
    expect(run.diagnostics.some((d) => d.code === "suspicious-value")).toBe(true);
  });
});
