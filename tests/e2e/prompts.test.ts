import { describe, expect, it } from "vitest";
import { screenOf, useProjects, type E2eProject } from "./helpers.js";

const skill = (name: string, description: string) =>
  `---\nname: ${name}\ndescription: ${description}\n---\nInstructions for ${name}.\n`;

async function skillSource(p: E2eProject): Promise<string> {
  await p.write("source/review/SKILL.md", skill("review", "Review a pull request"));
  await p.write(
    "source/release/SKILL.md",
    skill("release", "Cut a release, bumping the version and writing the changelog"),
  );
  await p.write("source/triage/SKILL.md", skill("triage", "Label new issues"));
  await p.write("universal-ai-config.config.json", JSON.stringify({ targets: ["claude"] }));
  // Relative, so the snapshots don't contain the temp dir
  return "./source";
}

describe("uac skill add", () => {
  const project = useProjects();

  it("picks skills from a multiselect, then confirms", async () => {
    const p = await project();
    const session = await p.start(["skill", "add", await skillSource(p)]);
    await session.waitFor("Select skills to install");
    expect(screenOf(session)).toMatchInlineSnapshot(`
      "ℹ Fetching skills from ./source…
      │
      ◆  Select skills to install
      │  ◻ release (release — Cut a release, bumping the version and writing
      │   the changelog)
      │  ◻ review
      │  ◻ triage
      └"
    `);

    await session.press("down", "space", "enter");
    await session.waitFor("Install 1 skill(s)");
    expect(screenOf(session)).toMatchInlineSnapshot(`
      "ℹ Fetching skills from ./source…
      │
      ◇  Select skills to install
      │  review
      │
      ◆  Install 1 skill(s) into .universal-ai-config/skills?
      │    • review (review)
      │  ● Yes / ○ No
      └"
    `);

    await session.press("enter");
    expect(await session.waitForExit()).toBe(0);
    expect(await p.exists(".universal-ai-config/skills/review/SKILL.md")).toBe(true);
    expect(await p.exists(".universal-ai-config/skills/release")).toBe(false);
  });

  it("wraps long hints at 50 columns without breaking the list", async () => {
    const p = await project();
    const session = await p.start(["skill", "add", await skillSource(p)], { cols: 50 });
    await session.waitFor("Select skills to install");
    await session.press("down");
    const focused = screenOf(session);
    expect(focused).toMatchInlineSnapshot(`
      "ℹ Fetching skills from ./source…
      │
      ◆  Select skills to install
      │  ◻ release
      │  ◻ review (review — Review a pull
      │  request)
      │  ◻ triage
      └"
    `);

    await session.press("down", "down", "up", "up");
    expect(screenOf(session)).toBe(focused);
    await session.press("ctrl-c");
    await session.waitForExit();
  });
});

describe("uac generate", () => {
  const project = useProjects();

  it("asks before deleting leftover AGENTS.override.md files", async () => {
    const p = await project();
    await p.write("universal-ai-config.config.json", JSON.stringify({ targets: ["codex"] }));
    await p.write(".universal-ai-config/instructions/style.md", "---\n---\nUse tabs.\n");
    await p.write("AGENTS.override.md", "uac 2.x output");

    const session = await p.start(["generate"]);
    await session.waitFor("Delete this file?");
    expect(screenOf(session)).toMatchInlineSnapshot(`
      "✔ codex — 1 instruction

       WARN  [uac] Found an AGENTS.override.md file, probably left by uac 2.x. Codex r
      eads it instead of the AGENTS.md in the same folder, so it hides uac's instructi
      ons there. Delete it, or set agentsMd.keepOverrideFiles: true if it's yours.

        ↳ AGENTS.override.md
      ✔ Generated 1 file(s)
      │
      ◆  Delete this file?
      │  ● Yes / ○ No
      └"
    `);

    await session.press("enter");
    expect(await session.waitForExit()).toBe(0);
    expect(await p.exists("AGENTS.override.md")).toBe(false);
    expect(await p.read("AGENTS.md")).toContain("Use tabs.");
  });
});
