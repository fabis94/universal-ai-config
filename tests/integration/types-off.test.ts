import { afterEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { runCommand } from "citty";
import { consola } from "consola";
import { vi } from "vitest";
import addCommand from "../../src/commands/skill/add.js";
import { loadProjectConfig } from "../../src/config/loader.js";
import { generateProject } from "../../src/core/generate/index.js";
import { CliProject } from "./cli-project.js";

const SKILL = "---\nname: s\ndescription: A skill\n---\nDo things.\n";

/** A type left out of `types` is off for every command, not just generation. */
describe("types switches a template type off everywhere", () => {
  const projects: CliProject[] = [];
  async function project(config: Record<string, unknown>): Promise<CliProject> {
    const p = await CliProject.create();
    projects.push(p);
    await p.config(config);
    return p;
  }
  afterEach(async () => {
    for (const p of projects.splice(0)) await p.dispose();
  });

  /** Outputs of every type, as earlier runs would have left them. */
  async function writeOutputs(p: CliProject): Promise<void> {
    await p.write(".claude/rules/a.md");
    await p.write(".claude/skills/s/SKILL.md");
    await p.write(".claude/agents/x.md");
    await p.write(".claude/settings.json", JSON.stringify({ hooks: {}, model: "opus" }));
    await p.write(".mcp.json", "{}");
    await p.write("AGENTS.md");
  }

  it("clean leaves the files of disabled types alone", async () => {
    const p = await project({ types: ["skills"] });
    await writeOutputs(p);

    await p.run("clean");

    expect(await p.exists(".claude/skills")).toBe(false);
    expect(await p.exists(".claude/rules/a.md")).toBe(true);
    expect(await p.exists(".claude/agents/x.md")).toBe(true);
    expect(JSON.parse(await p.read(".claude/settings.json"))).toHaveProperty("hooks");
    expect(await p.exists(".mcp.json")).toBe(true);
    expect(await p.exists("AGENTS.md")).toBe(true);
  });

  it("clean --type replaces the configured types, so leftovers of a disabled type can go", async () => {
    const p = await project({ types: ["skills"] });
    await writeOutputs(p);

    await p.run("clean", ["--type", "instructions"]);

    expect(await p.exists(".claude/rules")).toBe(false);
    expect(await p.exists("AGENTS.md")).toBe(false);
    expect(await p.exists(".claude/skills/s/SKILL.md")).toBe(true);
  });

  it("clean --type all cleans every type, whatever the config allows", async () => {
    const p = await project({ types: ["skills"] });
    await writeOutputs(p);

    await p.run("clean", ["--type", "all"]);

    for (const path of [
      ".claude/rules",
      ".claude/skills",
      ".claude/agents",
      ".mcp.json",
      "AGENTS.md",
    ]) {
      expect(await p.exists(path)).toBe(false);
    }
    expect(JSON.parse(await p.read(".claude/settings.json"))).toEqual({ model: "opus" });
  });

  it("generate --clean only cleans and regenerates the enabled types", async () => {
    const p = await project({ types: ["skills"], targets: ["claude"] });
    await writeOutputs(p);
    await p.write(".universal-ai-config/skills/s/SKILL.md", SKILL);

    await p.run("generate", ["--clean"]);

    expect(await p.read(".claude/skills/s/SKILL.md")).toContain("Do things.");
    expect(await p.exists(".claude/rules/a.md")).toBe(true);
    expect(await p.exists(".claude/agents/x.md")).toBe(true);
    expect(await p.exists("AGENTS.md")).toBe(true);
  });

  it("clean doesn't warn about AGENTS.override.md files when instructions are off", async () => {
    const p = await project({ types: ["skills"] });
    await p.write("AGENTS.override.md", "old codex output");

    const lines = await p.run("clean");

    expect(lines.join("\n")).not.toContain("AGENTS.override.md");
  });

  it("generate ignores in-memory templates of disabled types", async () => {
    const p = await project({ types: ["skills"], targets: ["claude"] });

    const { files, diagnostics } = await generateProject({
      root: p.root,
      templates: [
        { type: "instructions", name: "rule", content: "Always do X." },
        { type: "skills", name: "s", content: SKILL },
      ],
      onDiagnostic: () => {},
    });

    expect(files.map((f) => f.path)).toEqual([".claude/skills/s/SKILL.md"]);
    expect(diagnostics).toEqual([]);
  });

  it("doesn't validate agentsMd.indexDir when instructions are off", async () => {
    const p = await project({ types: ["skills"], agentsMd: { indexDir: "../outside" } });
    await expect(loadProjectConfig({ root: p.root })).resolves.toBeDefined();

    await p.config({ agentsMd: { indexDir: "../outside" } });
    await expect(loadProjectConfig({ root: p.root })).rejects.toThrow("agentsMd.indexDir");
  });

  it("skill add installs nothing when skills are off", async () => {
    const p = await project({ types: ["instructions"] });
    await p.write("source/s/SKILL.md", SKILL);
    const warnings: string[] = [];
    const warn = vi.spyOn(consola, "warn").mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });

    try {
      await runCommand(addCommand, {
        rawArgs: [join(p.root, "source"), "--root", p.root, "--all"],
      });
    } finally {
      warn.mockRestore();
    }

    expect(await p.exists(".universal-ai-config/skills")).toBe(false);
    expect(warnings).toEqual([expect.stringContaining("Skills are turned off")]);
  });
});
