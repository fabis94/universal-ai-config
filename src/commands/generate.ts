import { defineCommand } from "citty";
import { consola } from "consola";
import { generateProject } from "../core/generate/index.js";
import type { Diagnostic } from "../core/diagnostics.js";
import { writeGeneratedFiles } from "../core/writer.js";
import { offerAgentsOverrideRemoval } from "./agents-overrides.js";
import { formatFileLine, formatTargetSummary, printDiagnostics } from "./report.js";
import { runClean } from "./run-clean.js";
import { resolveCliRoot } from "./resolve-root.js";
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
      description:
        "Comma-separated targets to generate, replacing the configured set: claude,copilot,cursor,codex",
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
      description: "Project root (default: nearest uac root, searching up from cwd)",
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
    const root = resolveCliRoot(args.root);
    const targets = args.target
      ? (args.target.split(",").map((s) => s.trim()) as Target[])
      : undefined;
    const types = args.type
      ? (args.type.split(",").map((s) => s.trim()) as TemplateType[])
      : undefined;

    if (args.clean) {
      await runClean({
        root,
        targets,
        types,
        configPath: args.config,
        verbose: args.verbose,
        dryRun: args["dry-run"],
        // Asked once, after generating
        askAboutOverrideFiles: false,
      });
    }

    const { files, diagnostics } = await generateProject({
      root,
      targets,
      types,
      config: args.config,
      // Printed grouped below, after the files are known
      onDiagnostic: () => {},
    });

    const verbose = args.verbose;
    const allTargets = new Set<string>([
      ...files.map((f) => f.target),
      ...diagnostics.flatMap((d) => (d.target ? [d.target] : [])),
    ]);

    if (args["dry-run"]) {
      if (verbose) {
        consola.info(`Would generate ${files.length} file(s):\n`);
        for (const file of files) consola.log(formatFileLine(file));
      } else {
        for (const line of formatTargetSummary(files)) consola.info(line);
      }
      printDiagnostics(diagnostics, { verbose, allTargets });
      if (!verbose) consola.info(`Would generate ${files.length} file(s)`);
      return;
    }

    const report = await writeGeneratedFiles(files, root);

    if (verbose) {
      for (const file of files) {
        const status = report.unchanged.includes(file.path) ? "Unchanged" : "Generated";
        consola.success(`${status} ${formatFileLine(file).trim()}`);
      }
    } else {
      for (const line of formatTargetSummary(files)) consola.success(line);
    }
    printDiagnostics(diagnostics, { verbose, allTargets });
    const unchanged = report.unchanged.length > 0 ? ` (${report.unchanged.length} unchanged)` : "";
    consola.success(`Generated ${files.length} file(s)${unchanged}`);

    const overrides = diagnostics.find(
      (d): d is Extract<Diagnostic, { code: "agents-override-present" }> =>
        d.code === "agents-override-present",
    );
    await offerAgentsOverrideRemoval(root, overrides?.detail.paths ?? [], { dryRun: false });
  },
});
