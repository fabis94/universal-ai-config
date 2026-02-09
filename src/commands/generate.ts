import { defineCommand } from "citty";
import { consola } from "consola";
import { generate } from "../core/generate.js";
import { writeGeneratedFiles, cleanTargetFiles } from "../core/writer.js";
import type { Target, TemplateType } from "../types.js";

export default defineCommand({
  meta: {
    name: "generate",
    description: "Generate config files for specified targets",
  },
  args: {
    target: {
      type: "string",
      alias: "t",
      description: "Comma-separated targets: claude,copilot,cursor",
    },
    type: {
      type: "string",
      description: "Comma-separated types: instructions,skills,agents,hooks,mcp",
    },
    config: {
      type: "string",
      alias: "c",
      description: "Config file path",
    },
    root: {
      type: "string",
      alias: "r",
      description: "Project root (default: cwd)",
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
  },
  async run({ args }) {
    const root = args.root ?? process.cwd();
    const targets = args.target
      ? (args.target.split(",").map((s) => s.trim()) as Target[])
      : undefined;
    const types = args.type
      ? (args.type.split(",").map((s) => s.trim()) as TemplateType[])
      : undefined;

    if (args.clean) {
      await cleanTargetFiles(root, targets);
    }

    const files = await generate({
      root,
      targets,
      types,
      config: args.config,
      dryRun: args["dry-run"],
      clean: args.clean,
    });

    if (args["dry-run"]) {
      consola.info(`Would generate ${files.length} file(s):\n`);
      for (const file of files) {
        consola.log(`  ${file.path} (${file.target}/${file.type} ← ${file.sourcePath})`);
      }
      return;
    }

    await writeGeneratedFiles(files, root);
    consola.success(`Generated ${files.length} file(s)`);
  },
});
