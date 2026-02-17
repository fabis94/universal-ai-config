import { defineCommand } from "citty";
import { consola } from "consola";
import { generate } from "../core/generate.js";
import { writeGeneratedFiles, cleanTargetFiles } from "../core/writer.js";
import type { GeneratedFile, Target, TemplateType } from "../types.js";

function formatTargetSummary(files: GeneratedFile[]): string[] {
  const byTarget = new Map<string, Map<string, number>>();
  for (const file of files) {
    let types = byTarget.get(file.target);
    if (!types) {
      types = new Map<string, number>();
      byTarget.set(file.target, types);
    }
    types.set(file.type, (types.get(file.type) ?? 0) + 1);
  }

  const lines: string[] = [];
  for (const [target, types] of byTarget) {
    const parts = [...types.entries()].map(
      ([type, count]) => `${count} ${count === 1 ? type.replace(/s$/, "") : type}`,
    );
    lines.push(`${target} — ${parts.join(", ")}`);
  }
  return lines;
}

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
    verbose: {
      type: "boolean",
      alias: "v",
      description: "Show per-file output instead of summary",
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
      const cleaned = await cleanTargetFiles(root, targets, { verbose: args.verbose });
      if (!args.verbose && cleaned.length > 0) {
        consola.info(`Cleaned ${cleaned.length} existing path(s)`);
      }
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
      if (args.verbose) {
        consola.info(`Would generate ${files.length} file(s):\n`);
        for (const file of files) {
          consola.log(`  ${file.path} (${file.target}/${file.type} ← ${file.sourcePath})`);
        }
      } else {
        for (const line of formatTargetSummary(files)) {
          consola.info(line);
        }
        consola.info(`Would generate ${files.length} file(s)`);
      }
      return;
    }

    await writeGeneratedFiles(files, root, { verbose: args.verbose });

    if (!args.verbose) {
      for (const line of formatTargetSummary(files)) {
        consola.success(line);
      }
    }
    consola.success(`Generated ${files.length} file(s)`);
  },
});
