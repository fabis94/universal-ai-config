#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import generateCommand from "./commands/generate.js";
import initCommand from "./commands/init.js";
import cleanCommand from "./commands/clean.js";
import seedCommand from "./commands/seed.js";

const main = defineCommand({
  meta: {
    name: "uac",
    version: "0.1.0",
    description: "Generate tool-specific AI config files from shared templates",
  },
  subCommands: {
    generate: generateCommand,
    init: initCommand,
    clean: cleanCommand,
    seed: seedCommand,
  },
});

runMain(main);
