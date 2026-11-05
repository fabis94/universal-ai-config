import { describe, expect, it } from "vitest";
import { runAgentsMd } from "./agents-md-helpers.js";

describe("AGENTS.md — nested variation (default)", () => {
  it("writes the root file plus one AGENTS.md per folder, never overrides", async () => {
    const run = await runAgentsMd(["codex"]);
    expect(run.paths).toEqual([
      "AGENTS.md",
      "docs/AGENTS.md",
      "lib/AGENTS.md",
      "packages/api/AGENTS.md",
      "packages/frontend/AGENTS.md",
      "packages/worker/AGENTS.md",
      "scripts/AGENTS.md",
      "src/app/AGENTS.md",
    ]);
    expect(run.paths.some((p) => p.includes("override"))).toBe(false);
  });

  it("puts always-on, folder-less and unscoped templates in the root, alphabetically", async () => {
    const run = await runAgentsMd(["codex"]);
    const root = run.read("AGENTS.md");
    const headings = [...root.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual([
      "Project standards",
      "Test files",
      "Links",
      "Docs and SQL",
      "General notes",
    ]);
    expect(root).toContain(
      "## Test files\n\nApplies to files matching `**/*.test.ts`.\n\nTests body.",
    );
    // mixed: the folder glob goes to docs/, the folder-less one stays in the root
    expect(root).toContain(
      "## Docs and SQL\n\nApplies to files matching `**/*.sql`.\n\nMixed body.",
    );
    expect(run.read("docs/AGENTS.md")).toBe("## Docs and SQL\n\nMixed body.\n");
  });

  it("notes folders the globs only partly cover", async () => {
    const run = await runAgentsMd(["codex"]);
    expect(run.read("packages/api/AGENTS.md")).toBe("## Backend rules\n\nBackend body.\n");
    expect(run.read("packages/worker/AGENTS.md")).toBe(
      "## Backend rules\n\nApplies to files matching `packages/worker/**/*.ts`.\n\nBackend body.\n",
    );
    expect(run.read("lib/AGENTS.md")).toContain("Applies to files matching `lib/{a,b}/**`.");
    expect(run.read("scripts/AGENTS.md")).toBe("## Scripts\n\nScripts body.\n");
  });

  it("ignores a negated glob with a diagnostic", async () => {
    const run = await runAgentsMd(["codex"]);
    expect(run.read("src/app/AGENTS.md")).toBe("## Source minus generated\n\nNegated body.\n");
    expect(run.diagnostics.filter((d) => d.code === "agents-md-glob")).toHaveLength(1);
  });

  it("instructionPath() and consumers follow AGENTS.md", async () => {
    const run = await runAgentsMd(["claude", "codex"]);
    const root = run.read("AGENTS.md");
    expect(root).toContain("- root: AGENTS.md");
    expect(root).toContain("- frontend: packages/frontend/AGENTS.md");
    expect(root).toContain("- readers: claude,codex");
  });

  it("writes a template named AGENTS to its folder like any other", async () => {
    const run = await runAgentsMd(
      ["codex"],
      {},
      {
        templates: [
          {
            name: "AGENTS",
            type: "instructions",
            content: '---\nglobs: "tools/**"\n---\nTools.\n',
          },
        ],
      },
    );
    expect(run.read("tools/AGENTS.md")).toBe("## AGENTS\n\nTools.\n");
  });
});
