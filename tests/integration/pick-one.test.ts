import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { generateProject } from "../../src/core/generate/index.js";
import type { Diagnostic } from "../../src/core/diagnostics.js";
import type { GenerateOptions, Target, TemplateType } from "../../src/types.js";

const FIXTURE = join(import.meta.dirname, "../fixtures/pick-one-project");

async function run(
  targets: Target[] | undefined,
  types: TemplateType[],
  extra: GenerateOptions = {},
) {
  const diagnostics: Diagnostic[] = [];
  const result = await generateProject({
    root: FIXTURE,
    targets,
    types,
    onDiagnostic: (d) => diagnostics.push(d),
    ...extra,
  });
  const servedBy = diagnostics
    .filter((d) => d.code === "served-by")
    .map((d) => [d.target, d.type, (d.detail as { by: string }).by]);
  return { ...result, paths: result.files.map((f) => f.path).sort(), diagnostics, servedBy };
}

describe("pick one: instructions", () => {
  it("[claude] keeps .claude/rules and writes no AGENTS.md", async () => {
    const { paths, servedBy } = await run(["claude"], ["instructions"]);
    expect(paths).toEqual([".claude/rules/frontend.md", ".claude/rules/general.md"]);
    expect(servedBy).toEqual([]);
  });

  it("[claude, codex] writes only AGENTS.md files, read by both", async () => {
    const { paths, files, servedBy } = await run(["claude", "codex"], ["instructions"]);
    expect(paths).toEqual(["AGENTS.md", "packages/frontend/AGENTS.md"]);
    for (const file of files) expect(file.consumers).toEqual(["claude", "codex"]);
    expect(servedBy).toEqual([["claude", "instructions", "agentsMd"]]);
  });

  it("[claude, copilot] and [copilot] keep each target's own instructions", async () => {
    expect((await run(["claude", "copilot"], ["instructions"])).paths).toEqual([
      ".claude/rules/frontend.md",
      ".claude/rules/general.md",
      ".github/copilot-instructions.md",
      ".github/instructions/frontend.instructions.md",
    ]);
    expect((await run(["copilot"], ["instructions"])).paths).toEqual([
      ".github/copilot-instructions.md",
      ".github/instructions/frontend.instructions.md",
    ]);
  });

  it("every target: only AGENTS.md, and claude, copilot and cursor are switched", async () => {
    const { paths, servedBy } = await run(
      ["claude", "copilot", "cursor", "codex"],
      ["instructions"],
    );
    expect(paths).toEqual(["AGENTS.md", "packages/frontend/AGENTS.md"]);
    expect(servedBy).toEqual([
      ["claude", "instructions", "agentsMd"],
      ["copilot", "instructions", "agentsMd"],
      ["cursor", "instructions", "agentsMd"],
    ]);
  });

  it("enable: true without codex switches the readers in the run", async () => {
    const { paths, files } = await run(["cursor"], ["instructions"], {
      overrides: { agentsMd: { enable: true } },
    });
    expect(paths).toEqual(["AGENTS.md", "packages/frontend/AGENTS.md"]);
    expect(files[0]).toMatchObject({ target: "cursor", consumers: ["cursor"] });
  });

  it("the served-by warning leads with the per-machine targets fix", async () => {
    const { diagnostics } = await run(["claude", "codex"], ["instructions"]);
    const warning = diagnostics.find((d) => d.code === "served-by");
    expect(warning!.severity).toBe("warn");
    expect(warning!.message).toContain("universal-ai-config.overrides.ts");
  });

  it("uses the config's targets when no targets option is given", async () => {
    const { plan } = await run(undefined, ["instructions"]);
    expect(plan.targets).toEqual(["claude", "copilot"]);
  });
});
