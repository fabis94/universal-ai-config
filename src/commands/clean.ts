import { defineCommand } from "citty";
import { consola } from "consola";
import { cleanTargetFiles } from "../core/writer.js";
import type { Target } from "../types.js";

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

    await cleanTargetFiles(root, targets);
    consola.success("Clean complete");
  },
});
