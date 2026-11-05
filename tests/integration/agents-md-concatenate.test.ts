import { describe, expect, it } from "vitest";
import { runAgentsMd } from "./agents-md-helpers.js";

describe("AGENTS.md — concatenate variation", () => {
  it("writes only the root file, with a scope note on every scoped section", async () => {
    const run = await runAgentsMd(["codex"], { variation: "concatenate" });
    expect(run.paths).toEqual(["AGENTS.md"]);
    const root = run.read("AGENTS.md");
    expect(root).toContain("## Frontend rules\n\nApplies to files in `packages/frontend/`.\n\n");
    expect(root).toContain(
      "## Backend rules\n\nApplies to files in `packages/api/` and files matching `packages/worker/**/*.ts`.\n\n",
    );
    expect(root).toContain(
      "## Docs and SQL\n\nApplies to files in `docs/` and files matching `**/*.sql`.\n\n",
    );
    expect(root).toContain("## Project standards\n\nFollow the coding standards.");
  });

  it("sorts every section alphabetically by template name", async () => {
    const run = await runAgentsMd(["codex"], { variation: "concatenate" });
    const names = [...run.read("AGENTS.md").matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(names).toEqual([
      "Project standards", // always
      "Brace rules", // brace
      "Scripts", // dot-slash
      "Frontend rules", // folder
      "Test files", // leading-wildcard
      "Links",
      "Docs and SQL", // mixed
      "Backend rules", // multi-folder
      "Source minus generated", // negated
      "General notes", // no-globs
    ]);
  });

  it("instructionPath() points every template at the root file", async () => {
    const run = await runAgentsMd(["codex"], { variation: "concatenate" });
    expect(run.read("AGENTS.md")).toContain("- frontend: AGENTS.md");
  });
});
