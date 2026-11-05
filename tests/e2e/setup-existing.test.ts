import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { UAC_VERSION } from "../../src/version.js";
import { screenOf, useProjects, type E2eProject } from "./helpers.js";

/** A project set up by an older uac: old stamp, a .gitignore block missing a path, no overrides. */
async function upgradedProject(create: () => Promise<E2eProject>): Promise<E2eProject> {
  const p = await create();
  expect(await p.runToExit(["init", "--yes"])).toBe(0);
  await p.write(".universal-ai-config/.uac-version", "2.0.0\n");
  await p.write(".gitignore", (await p.read(".gitignore")).replace(".cursor/rules/\n", ""));
  return p;
}

describe("uac setup in an existing project", () => {
  const project = useProjects();

  it("preselects what an upgrade left to do, and hints why", async () => {
    const p = await upgradedProject(project);
    const session = await p.start(["setup"]);
    await session.waitFor("What should setup do?");
    const menu = screenOf(session);
    expect(menu).toMatchInlineSnapshot(`
      "┌  uac setup
      │
      ◆  What should setup do?
      │  ◼ Pick the coding agents you use on this machine (not set —
      │  generating for all 4; pick just yours for best results)
      │  ◼ Update uac's meta-instructions (seeded by uac 2.0.0, you have
      │  <uac> — overwrites edits to them)
      │  ◼ Update the uac block in .gitignore (out of date: 1 path to add)
      │  ◻ Add example templates
      └"
    `);

    // Hints of unselected items show only when focused
    await session.press("down", "down", "down");
    expect(screenOf(session)).toMatchInlineSnapshot(`
      "┌  uac setup
      │
      ◆  What should setup do?
      │  ◼ Pick the coding agents you use on this machine (not set —
      │  generating for all 4; pick just yours for best results)
      │  ◼ Update uac's meta-instructions (seeded by uac 2.0.0, you have
      │  <uac> — overwrites edits to them)
      │  ◼ Update the uac block in .gitignore (out of date: 1 path to add)
      │  ◻ Add example templates (one of each type, to copy from)
      └"
    `);

    // Moving back gives the same screen: no ghost or duplicated rows
    await session.press("up", "up", "up");
    expect(screenOf(session)).toBe(menu);
  });

  it("runs the picked steps and records the new version", async () => {
    const p = await upgradedProject(project);
    const session = await p.start(["setup"], { rows: 40 });
    await session.waitFor("What should setup do?");

    await session.press("enter");
    await session.waitFor("Which coding agents");
    await session.press("down", "down", "space", "enter");
    await session.waitFor("Generate now?");
    await session.press("enter");

    expect(await session.waitForExit()).toBe(0);
    expect(screenOf(session)).toMatchInlineSnapshot(`
      "┌  uac setup
      │
      ◇  What should setup do?
      │  Pick the coding agents you use on this machine, Update uac's
      │  meta-instructions, Update the uac block in .gitignore
      │
      ◇   ──────────────────────────────────────────────────────────────────────────╮
      │                                                                             │
      │  Pick just one if you can. Coding agents read each other's files, so with   │
      │  several selected they can load duplicate or conflicting instructions,      │
      │  which wastes context. Run \`uac setup\` again when you switch. Saved to      │
      │  universal-ai-config.overrides.ts (gitignored).                             │
      │                                                                             │
      ├─────────────────────────────────────────────────────────────────────────────╯
      │
      ◇  Which coding agents do you use on this machine?
      │  Cursor
      ✔ Saved Cursor to universal-ai-config.overrides.ts
      ✔ Seeded meta-instructions (uac <uac>): 21 unchanged
      ✔ Updated universal-ai-config patterns in .gitignore
      │
      ◇  Generate now?
      │  Clean, then generate
      ✔ cursor — 2 instructions, 10 skills
      ✔ Generated 12 file(s)
      │
      └  Done"
    `);
    expect((await p.read(".universal-ai-config/.uac-version")).trim()).toBe(UAC_VERSION);
    expect(await p.read(".gitignore")).toContain(".cursor/rules/");
    expect(await p.read("universal-ai-config.overrides.ts")).toContain('targets: ["cursor"]');
    expect(await p.exists(".cursor/rules")).toBe(true);
  });

  it("switches coding agents, generating for the new ones", async () => {
    const p = await project();
    expect(await p.runToExit(["init", "--yes", "--target", "claude"])).toBe(0);
    expect(await p.runToExit(["generate"])).toBe(0);
    expect(await p.exists(".claude/rules")).toBe(true);

    const session = await p.start(["setup"], { rows: 40 });
    await session.waitFor("What should setup do?");
    expect(screenOf(session)).toMatchInlineSnapshot(`
      "┌  uac setup
      │
      ◆  What should setup do?
      │  ◻ Pick the coding agents you use on this machine (currently: Claude
      │   Code)
      │  ◻ Update uac's meta-instructions
      │  ◻ Update the uac block in .gitignore
      │  ◻ Add example templates
      └"
    `);
    // Nothing is due: tick "Pick the coding agents", swap Claude Code for Cursor
    await session.press("space", "enter");
    await session.waitFor("Which coding agents");
    await session.press("space", "down", "down", "space", "enter");
    await session.waitFor("Generate now?");
    await session.press("enter");

    expect(await session.waitForExit()).toBe(0);
    expect(await p.exists(".cursor/rules")).toBe(true);
    expect(await p.exists(".claude/rules")).toBe(false);
  });

  it("asks before replacing an overrides file that sets more than targets", async () => {
    const p = await upgradedProject(project);
    await p.write(
      "universal-ai-config.overrides.json",
      JSON.stringify({ targets: ["claude"], variables: { name: "me" } }),
    );
    const session = await p.start(["setup"], { rows: 40 });
    await session.waitFor("What should setup do?");

    await session.press("space", "enter");
    await session.waitFor("Replace universal-ai-config.overrides.json?");
    expect(screenOf(session)).toMatchInlineSnapshot(`
      "┌  uac setup
      │
      ◇  What should setup do?
      │  Pick the coding agents you use on this machine, Update uac's
      │  meta-instructions, Update the uac block in .gitignore
      │
      ◆  Replace universal-ai-config.overrides.json? Its variables settings
      │  will be lost
      │  ○ Yes / ● No
      └"
    `);

    // Default: keep it
    await session.press("enter");
    await session.waitFor("Generate now?");
    await session.press("down", "down", "enter");
    expect(await session.waitForExit()).toBe(0);
    expect(await p.exists("universal-ai-config.overrides.json")).toBe(true);
    expect(await p.exists("universal-ai-config.overrides.ts")).toBe(false);
  });

  it("stops on ctrl-c without doing anything", async () => {
    const p = await upgradedProject(project);
    const session = await p.start(["setup"]);
    await session.waitFor("What should setup do?");

    await session.press("ctrl-c");
    expect(await session.waitForExit()).toBe(1);
    expect(screenOf(session)).toMatchInlineSnapshot(`
      "┌  uac setup
      │
      ■  What should setup do?
      │  Pick the coding agents you use on this machine, Update uac's
      │  meta-instructions, Update the uac block in .gitignore
      │
      └  Setup cancelled"
    `);
    expect((await p.read(".universal-ai-config/.uac-version")).trim()).toBe("2.0.0");
  });

  it("asks which project to set up from a subfolder", async () => {
    const p = await upgradedProject(project);
    await p.write("packages/web/package.json", "{}");
    const session = await p.start(["setup"], { cwd: join(p.root, "packages/web") });
    await session.waitFor("Found a uac project");
    expect(screenOf(session)).toMatchInlineSnapshot(`
      "┌  uac setup
      │
      ◆  Found a uac project at ../..
      │  ● Set up this machine for ../..
      │  ○ Create a new uac project here
      └"
    `);

    await session.press("enter");
    await session.waitFor("What should setup do?");
    await session.press("ctrl-c");
    await session.waitForExit();
  });
});

describe("uac setup at 50 columns", () => {
  const project = useProjects();

  it("wraps long hints without breaking the menu", async () => {
    const p = await upgradedProject(project);
    const session = await p.start(["setup"], { cols: 50, rows: 40 });
    await session.waitFor("What should setup do?");
    const menu = screenOf(session);
    expect(menu).toMatchInlineSnapshot(`
      "┌  uac setup
      │
      ◆  What should setup do?
      │  ◼ Pick the coding agents you use on
      │  this machine (not set — generating
      │  for all 4; pick just yours for best
      │  results)
      │  ◼ Update uac's meta-instructions
      │  (seeded by uac 2.0.0, you have <uac>
      │  — overwrites edits to them)
      │  ◼ Update the uac block in .gitignore
      │  (out of date: 1 path to add)
      │  ◻ Add example templates
      └"
    `);

    await session.press("down", "down", "down", "up", "up", "up");
    expect(screenOf(session)).toBe(menu);

    await session.press("enter");
    await session.waitFor("Which coding agents");
    expect(screenOf(session)).toMatchInlineSnapshot(`
      "┌  uac setup
      │
      ◇  What should setup do?
      │  Pick the coding agents you use on
      │  this machine, Update uac's
      │  meta-instructions, Update the uac
      │  block in .gitignore
      │
      ◇   ─────────────────────────────────────────────╮
      │                                                │
      │  Pick just one if you can. Coding agents read  │
      │   each other's files, so with several          │
      │  selected they can load duplicate or           │
      │  conflicting instructions, which wastes        │
      │  context. Run \`uac setup\` again when you       │
      │  switch. Saved to                              │
      │  universal-ai-config.overrides.ts              │
      │  (gitignored).                                 │
      │                                                │
      ├────────────────────────────────────────────────╯
      │
      ◆  Which coding agents do you use on
      │  this machine?
      │  ◻ Claude Code (claude · .claude/)
      │  ◻ GitHub Copilot
      │  ◻ Cursor
      │  ◻ Codex
      └"
    `);
  });
});
