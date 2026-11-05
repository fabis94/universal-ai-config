import { consola } from "consola";
import type { Diagnostic } from "../core/diagnostics.js";
import { generateProject } from "../core/generate/index.js";
import { writeGeneratedFiles } from "../core/writer.js";
import type { Target, TemplateType } from "../types.js";
import { offerAgentsOverrideRemoval } from "./agents-overrides.js";
import { formatFileLine, formatTargetSummary, printDiagnostics } from "./report.js";
import { runClean } from "./run-clean.js";
import { printSetupHints } from "./setup-hints.js";

interface RunGenerateOptions {
  root: string;
  /** CLI `--target`, replacing the configured targets */
  targets?: Target[];
  /** CLI `--type`, replacing the configured types */
  types?: TemplateType[];
  configPath?: string;
  dryRun?: boolean;
  /** Remove existing generated files first */
  clean?: boolean;
  verbose?: boolean;
}

/**
 * Shared implementation behind `uac generate` and `uac setup`'s generate step.
 */
export async function runGenerate(options: RunGenerateOptions): Promise<void> {
  const { root, targets, types, configPath, dryRun = false, verbose = false } = options;

  if (options.clean) {
    await runClean({
      root,
      targets,
      types,
      configPath,
      verbose,
      dryRun,
      // Asked once, after generating
      askAboutOverrideFiles: false,
    });
  }

  const { files, diagnostics } = await generateProject({
    root,
    targets,
    types,
    config: configPath,
    // Printed grouped below, after the files are known
    onDiagnostic: () => {},
  });

  const allTargets = new Set<string>([
    ...files.map((f) => f.target),
    ...diagnostics.flatMap((d) => (d.target ? [d.target] : [])),
  ]);

  if (dryRun) {
    if (verbose) {
      consola.info(`Would generate ${files.length} file(s):\n`);
      for (const file of files) consola.log(formatFileLine(file));
    } else {
      for (const line of formatTargetSummary(files)) consola.info(line);
    }
    printDiagnostics(diagnostics, { verbose, allTargets });
    if (!verbose) consola.info(`Would generate ${files.length} file(s)`);
    await printSetupHints(root, configPath);
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
  await printSetupHints(root, configPath);

  const overrides = diagnostics.find(
    (d): d is Extract<Diagnostic, { code: "agents-override-present" }> =>
      d.code === "agents-override-present",
  );
  await offerAgentsOverrideRemoval(root, overrides?.detail.paths ?? [], { dryRun: false });
}
