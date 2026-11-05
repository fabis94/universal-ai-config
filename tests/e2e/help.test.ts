import { describe, expect, it } from "vitest";
import { UAC_VERSION } from "../../src/version.js";
import { fitsWidth, screenOf, useProjects } from "./helpers.js";

describe("help screens at 80 columns", () => {
  const project = useProjects();

  it("lists the commands without wrapping", async () => {
    const p = await project();
    const session = await p.start([]);
    await session.waitForExit();

    expect(fitsWidth(session.screen(), 80)).toBe(true);
    expect(screenOf(session)).toMatchInlineSnapshot(`
      "One set of templates for Claude Code, Copilot, Cursor and Codex (uac v<uac>)

      USAGE uac generate|init|clean|seed|skill

      COMMANDS

        generate    Render templates into each configured target's output
            init    Set up uac for this project or this machine (alias: setup)
           clean    Remove what uac generated (every target, enabled types)
            seed    Add a pre-built template set or the .gitignore block
           skill    Manage skill templates

      Use uac <command> --help for more information about a command.

      No command specified."
    `);
  });

  it.each(["setup", "generate", "clean", "seed"])("uac %s --help fits", async (command) => {
    const p = await project();
    const session = await p.start([command, "--help"]);
    await session.waitForExit();

    expect(fitsWidth(session.screen(), 80)).toBe(true);
  });

  it("--version prints the package version", async () => {
    const p = await project();
    const session = await p.start(["--version"]);
    await session.waitForExit();

    expect(session.screen()).toBe(UAC_VERSION);
  });
});
