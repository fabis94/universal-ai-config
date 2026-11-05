import { describe, expect, it } from "vitest";
import { screenOf, useProjects } from "./helpers.js";

describe("uac setup in a project without uac", () => {
  const project = useProjects();

  it("sets up the project, then asks for coding agents, examples and generating", async () => {
    const p = await project();
    const session = await p.start(["setup"], { rows: 40 });

    // Config, meta-instructions and .gitignore happen without asking
    await session.waitFor("Which coding agents do you use on this machine?");
    expect(screenOf(session)).toMatchInlineSnapshot(`
      "┌  uac setup
      ✔ Created universal-ai-config.config.ts (all coding agents)
      ✔ Seeded meta-instructions (uac <uac>): 21 created
      ✔ Created .gitignore with universal-ai-config patterns
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
      ◆  Which coding agents do you use on this machine?
      │  ◻ Claude Code (claude · .claude/)
      │  ◻ GitHub Copilot
      │  ◻ Cursor
      │  ◻ Codex
      └"
    `);

    await session.press("space", "enter");
    await session.waitFor("Add example templates?");
    expect(screenOf(session)).toMatchInlineSnapshot(`
      "┌  uac setup
      ✔ Created universal-ai-config.config.ts (all coding agents)
      ✔ Seeded meta-instructions (uac <uac>): 21 created
      ✔ Created .gitignore with universal-ai-config patterns
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
      │  Claude Code
      ✔ Saved Claude Code to universal-ai-config.overrides.ts
      │
      ◆  Add example templates? (one of each type, to copy from)
      │  ○ Yes / ● No
      └"
    `);

    await session.press("enter");
    await session.waitFor("Generate now?");
    expect(screenOf(session)).toMatchInlineSnapshot(`
      "┌  uac setup
      ✔ Created universal-ai-config.config.ts (all coding agents)
      ✔ Seeded meta-instructions (uac <uac>): 21 created
      ✔ Created .gitignore with universal-ai-config patterns
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
      │  Claude Code
      ✔ Saved Claude Code to universal-ai-config.overrides.ts
      │
      ◇  Add example templates? (one of each type, to copy from)
      │  No
      │
      ◆  Generate now?
      │  ○ Generate
      │  ● Clean, then generate (removes output of agents you dropped)
      │  ○ Skip
      └"
    `);

    await session.press("enter");
    expect(await session.waitForExit()).toBe(0);
    expect(screenOf(session)).toMatchInlineSnapshot(`
      "┌  uac setup
      ✔ Created universal-ai-config.config.ts (all coding agents)
      ✔ Seeded meta-instructions (uac <uac>): 21 created
      ✔ Created .gitignore with universal-ai-config patterns
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
      │  Claude Code
      ✔ Saved Claude Code to universal-ai-config.overrides.ts
      │
      ◇  Add example templates? (one of each type, to copy from)
      │  No
      │
      ◇  Generate now?
      │  Clean, then generate
      ✔ claude — 2 instructions, 10 skills
      ✔ Generated 12 file(s)
      │
      └  Done"
    `);

    expect(await p.read("universal-ai-config.overrides.ts")).toContain('targets: ["claude"]');
    expect(await p.exists(".claude/rules")).toBe(true);
    expect(await p.exists(".cursor")).toBe(false);
    expect(await p.exists(".universal-ai-config/agents")).toBe(false);
  });

  it("adds the examples when asked", async () => {
    const p = await project();
    const session = await p.start(["setup"], { rows: 40 });
    await session.waitFor("Which coding agents");
    await session.press("space", "enter");
    await session.waitFor("Add example templates?");

    await session.press("left", "enter");
    await session.waitFor("Generate now?");
    // From the default "Clean, then generate" to "Skip"
    await session.press("down", "enter");

    expect(await session.waitForExit()).toBe(0);
    expect(await p.exists(".universal-ai-config/agents/code-reviewer.md")).toBe(true);
    // Skipped generating
    expect(await p.exists(".claude")).toBe(false);
  });
});
