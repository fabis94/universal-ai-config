import { defineCommand } from "citty";
import { consola } from "consola";
import { runClean } from "./run-clean.js";
import { resolveCliRoot } from "./resolve-root.js";
import { parseTargets, parseTypes } from "./cli-args.js";

export default defineCommand({
  meta: {
    name: "clean",
    description: "Remove what uac generated (every target, enabled types)",
  },
  args: {
    target: {
      type: "string",
      alias: "t",
      description: "claude,copilot,cursor,codex (default: every target)",
    },
    type: {
      type: "string",
      description: "instructions,skills,agents,hooks,mcp or all; replaces config",
    },
    config: {
      type: "string",
      alias: "c",
      description: "Config file path",
    },
    root: {
      type: "string",
      alias: "r",
      description: "Project root (default: nearest uac root above cwd)",
    },
    "dry-run": {
      type: "boolean",
      alias: "d",
      description: "Print what would be removed without deleting",
      default: false,
    },
  },
  async run({ args }) {
    const root = resolveCliRoot(args.root);
    const targets = parseTargets(args.target);
    const types = parseTypes(args.type);

    // Always per-path: `clean` has no other output worth reading.
    await runClean({
      root,
      targets,
      types,
      configPath: args.config,
      verbose: true,
      dryRun: args["dry-run"],
    });

    consola.success(args["dry-run"] ? "Dry run complete" : "Clean complete");
  },
});
