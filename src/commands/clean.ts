import { defineCommand } from "citty";
import { consola } from "consola";
import { cleanTargetFiles } from "../core/writer.js";
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
      description: "Comma-separated targets to clean: claude,copilot,cursor",
    },
    type: {
      type: "string",
      description: "Comma-separated types to clean: instructions,skills,agents,hooks,mcp",
    },
    root: {
      type: "string",
      alias: "r",
      description: "Project root (default: cwd)",
    },
  },
  async run({ args }) {
    const root = args.root ?? process.cwd();
    const targets = args.target
      ? (args.target.split(",").map((s) => s.trim()) as Target[])
      : undefined;
    const types = args.type
      ? (args.type.split(",").map((s) => s.trim()) as TemplateType[])
      : undefined;

    await cleanTargetFiles(root, targets, types, { verbose: true });
    consola.success("Clean complete");
  },
});
