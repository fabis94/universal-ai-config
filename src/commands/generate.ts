import { defineCommand } from "citty";
import { runGenerate } from "./run-generate.js";
import { resolveCliRoot } from "./resolve-root.js";
import { parseTargets, parseTypes } from "./cli-args.js";

export default defineCommand({
  meta: {
    name: "generate",
    description: "Render templates into each configured target's output",
  },
  args: {
    target: {
      type: "string",
      alias: "t",
      description: "claude,copilot,cursor,codex — replaces the configured set",
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
      description: "Print what would be generated without writing",
      default: false,
    },
    clean: {
      type: "boolean",
      description: "Remove existing generated files before generating",
      default: false,
    },
    verbose: {
      type: "boolean",
      alias: "v",
      description: "Show per-file output instead of summary",
      default: false,
    },
  },
  async run({ args }) {
    await runGenerate({
      root: resolveCliRoot(args.root),
      targets: parseTargets(args.target),
      types: parseTypes(args.type),
      configPath: args.config,
      dryRun: args["dry-run"],
      clean: args.clean,
      verbose: args.verbose,
    });
  },
});
