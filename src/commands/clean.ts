import { defineCommand } from "citty";
import { consola } from "consola";
import { runClean } from "./run-clean.js";
import { resolveCliRoot } from "./resolve-root.js";
import type { Target, TemplateType } from "../types.js";

export default defineCommand({
  meta: {
    name: "clean",
    description: "Remove all generated config directories",
  },
  args: {
    target: {
      type: "string",
      alias: "t",
      description: "Comma-separated targets to clean: claude,copilot,cursor,codex",
    },
    type: {
      type: "string",
      description: "Comma-separated types to clean: instructions,skills,agents,hooks,mcp",
    },
    config: {
      type: "string",
      alias: "c",
      description: "Config file path",
    },
    root: {
      type: "string",
      alias: "r",
      description: "Project root (default: nearest uac root, searching up from cwd)",
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
    const targets = args.target
      ? (args.target.split(",").map((s) => s.trim()) as Target[])
      : undefined;
    const types = args.type
      ? (args.type.split(",").map((s) => s.trim()) as TemplateType[])
      : undefined;

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
