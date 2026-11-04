import { afterEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { CliProject } from "./cli-project.js";

const FIXTURE = join(import.meta.dirname, "../fixtures/codex-overrides-project");

describe("AGENTS.md ownership and clean (CLI)", () => {
  const projects: CliProject[] = [];
  async function project(): Promise<CliProject> {
    const p = await CliProject.create(FIXTURE);
    projects.push(p);
    return p;
  }
  afterEach(async () => {
    for (const p of projects.splice(0)) await p.dispose();
  });

  it("generate overwrites a hand-written AGENTS.md at a generated path", async () => {
    const p = await project();
    await p.write("AGENTS.md", "hand-written");
    await p.run("generate", ["-t", "codex", "--type", "instructions"]);
    expect(await p.read("AGENTS.md")).toContain("## Project-wide standards");
  });

  it("clean -t codex removes root and nested AGENTS.md, the index dir and legacy overrides", async () => {
    const p = await project();
    await p.run("generate", ["-t", "codex", "--type", "instructions"]);
    expect(await p.exists("packages/frontend/AGENTS.md")).toBe(true);
    // Left behind by an earlier run with the index variation
    await p.write(".agents/uac-instructions/frontend.md");
    await p.write("packages/legacy/AGENTS.override.md");
    await p.write("packages/stale/AGENTS.md", "from a template that no longer exists");

    await p.run("clean", ["-t", "codex"]);

    for (const path of [
      "AGENTS.md",
      "packages/frontend/AGENTS.md",
      "packages/app/lib/tests/AGENTS.md",
      "packages/stale/AGENTS.md",
      "packages/legacy/AGENTS.override.md",
      ".agents/uac-instructions",
    ]) {
      expect(await p.exists(path), path).toBe(false);
    }
    // Folders themselves are user source
    expect(await p.exists("packages/frontend")).toBe(true);
  });

  it("removes an AGENTS.md generated into the templates dir root, but not template inputs", async () => {
    const p = await project();
    await p.write(".universal-ai-config/AGENTS.md", "generated for .universal-ai-config/**");
    await p.write(".universal-ai-config/skills/x/AGENTS.md", "skill input");
    await p.write(".universal-ai-config/docs/AGENTS.md", "doc input");

    await p.run("clean", ["-t", "codex"]);

    expect(await p.exists(".universal-ai-config/AGENTS.md")).toBe(false);
    expect(await p.exists(".universal-ai-config/skills/x/AGENTS.md")).toBe(true);
    expect(await p.exists(".universal-ai-config/docs/AGENTS.md")).toBe(true);
  });

  it("honours preserveOnClean for AGENTS.md files", async () => {
    const p = await project();
    await p.config({ preserveOnClean: ["packages/frontend/AGENTS.md"] });
    await p.write("AGENTS.md");
    await p.write("packages/frontend/AGENTS.md", "keep me");

    await p.run("clean", ["-t", "codex"]);

    expect(await p.exists("AGENTS.md")).toBe(false);
    expect(await p.read("packages/frontend/AGENTS.md")).toBe("keep me");
  });

  it("generate --clean after adding codex leaves only AGENTS.md output", async () => {
    const p = await project();
    await p.run("generate", ["-t", "claude", "--type", "instructions"]);
    expect(await p.exists(".claude/rules/frontend.md")).toBe(true);
    await p.write("packages/old/AGENTS.override.md");

    await p.run("generate", ["-t", "claude,codex", "--type", "instructions", "--clean"]);

    expect(await p.exists(".claude/rules")).toBe(false);
    expect(await p.exists("packages/old/AGENTS.override.md")).toBe(false);
    expect(await p.exists("AGENTS.md")).toBe(true);
    expect(await p.exists("packages/frontend/AGENTS.md")).toBe(true);
  });

  it("--dry-run lists what would be removed and deletes nothing", async () => {
    const p = await project();
    await p.run("generate", ["-t", "codex", "--type", "instructions"]);
    const lines = await p.run("clean", ["-t", "codex", "--dry-run"]);
    expect(lines).toContain("Would clean packages/frontend/AGENTS.md");
    expect(await p.exists("packages/frontend/AGENTS.md")).toBe(true);
  });
});
