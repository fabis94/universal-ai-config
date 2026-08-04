import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { dirname, join } from "node:path";
import { mkdtemp, mkdir, rm, writeFile, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { runCommand } from "citty";
import cleanCommand from "../../src/commands/clean.js";

/**
 * End-to-end coverage for the `uac clean` command layer — specifically that it
 * loads config at all, which it historically did not.
 */
describe("uac clean command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "uac-clean-cmd-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function exists(rel: string): Promise<boolean> {
    return access(join(tempDir, rel)).then(
      () => true,
      () => false,
    );
  }

  async function write(rel: string, content = "generated"): Promise<void> {
    const full = join(tempDir, rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content, "utf-8");
  }

  async function writeConfig(config: Record<string, unknown>): Promise<void> {
    await write("universal-ai-config.config.json", JSON.stringify(config, null, 2));
  }

  it("removes artifacts for every target, not just the ones in config.targets", async () => {
    // Dropping a target from `targets` must not strand its previously
    // generated output — this is the speckle-server scenario.
    await writeConfig({ targets: ["claude"] });
    await write(".claude/rules/a.md");
    await write("AGENTS.md");
    await write(".agents/skills/x/SKILL.md");
    await write("packages/frontend-3/AGENTS.override.md");

    await runCommand(cleanCommand, { rawArgs: ["--root", tempDir] });

    expect(await exists(".claude/rules")).toBe(false);
    expect(await exists("AGENTS.md")).toBe(false);
    expect(await exists(".agents/skills")).toBe(false);
    expect(await exists("packages/frontend-3/AGENTS.override.md")).toBe(false);
  });

  it("honors preserveOnClean from the config file", async () => {
    await writeConfig({ preserveOnClean: ["AGENTS.md"] });
    await write("AGENTS.md", "hand-written and committed");
    await write(".agents/skills/x/SKILL.md");
    await write("packages/app/AGENTS.override.md");

    await runCommand(cleanCommand, { rawArgs: ["--root", tempDir] });

    expect(await exists("AGENTS.md")).toBe(true);
    expect(await readFile(join(tempDir, "AGENTS.md"), "utf-8")).toBe("hand-written and committed");
    expect(await exists(".agents/skills")).toBe(false);
    expect(await exists("packages/app/AGENTS.override.md")).toBe(false);
  });

  it("honors outputDirs from the config file", async () => {
    await writeConfig({ outputDirs: { claude: ".custom-claude" } });
    await write(".custom-claude/rules/a.md");
    await write(".claude/rules/untouched.md");

    await runCommand(cleanCommand, { rawArgs: ["--root", tempDir, "--target", "claude"] });

    expect(await exists(".custom-claude/rules")).toBe(false);
    // The default dir isn't uac's output for this project, so it stays
    expect(await exists(".claude/rules/untouched.md")).toBe(true);
  });

  it("--dry-run deletes nothing", async () => {
    await writeConfig({});
    await write(".claude/rules/a.md");
    await write("packages/app/AGENTS.override.md");

    await runCommand(cleanCommand, { rawArgs: ["--root", tempDir, "--dry-run"] });

    expect(await exists(".claude/rules/a.md")).toBe(true);
    expect(await exists("packages/app/AGENTS.override.md")).toBe(true);
  });

  it("--target narrows cleaning to the named target", async () => {
    await writeConfig({});
    await write(".claude/rules/a.md");
    await write("packages/app/AGENTS.override.md");

    await runCommand(cleanCommand, { rawArgs: ["--root", tempDir, "--target", "claude"] });

    expect(await exists(".claude/rules")).toBe(false);
    expect(await exists("packages/app/AGENTS.override.md")).toBe(true);
  });

  it("does not delete override files living inside templatesDir", async () => {
    await writeConfig({});
    await write(".universal-ai-config/skills/x/AGENTS.override.md", "template input");
    await write("packages/app/AGENTS.override.md");

    await runCommand(cleanCommand, { rawArgs: ["--root", tempDir] });

    expect(await exists(".universal-ai-config/skills/x/AGENTS.override.md")).toBe(true);
    expect(await exists("packages/app/AGENTS.override.md")).toBe(false);
  });
});
