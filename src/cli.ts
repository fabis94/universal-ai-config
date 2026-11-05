#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { consola } from "consola";
import generateCommand from "./commands/generate.js";
import initCommand, { setupCommand } from "./commands/init/index.js";
import cleanCommand from "./commands/clean.js";
import seedCommand from "./commands/seed.js";
import skillCommand from "./commands/skill/index.js";
import { UAC_VERSION } from "./version.js";

// A clock on every line is noise in a CLI that runs for seconds, and pushes
// long lines into wrapping
consola.options.formatOptions.date = false;

const main = defineCommand({
  meta: {
    name: "uac",
    version: UAC_VERSION,
    // citty appends " (uac vX.Y.Z)": keep the line under 80 columns
    description: "One set of templates for Claude Code, Copilot, Cursor and Codex",
  },
  subCommands: {
    generate: generateCommand,
    init: initCommand,
    setup: setupCommand,
    clean: cleanCommand,
    seed: seedCommand,
    skill: skillCommand,
  },
});

runMain(main);
