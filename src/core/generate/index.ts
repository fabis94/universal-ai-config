import { loadProjectConfig } from "../../config/loader.js";
import { DiagnosticSink, printDiagnostic } from "../diagnostics.js";
import { targets } from "../../targets/index.js";
import type { GeneratedFile, GenerateOptions } from "../../types.js";
import type { GenerateRun } from "./context.js";
import { buildDocsIndex, discoverTemplates } from "./discover.js";
import { generateHooksFiles } from "./hooks.js";
import { generateMCPFiles } from "./mcp.js";
import { FileReader } from "./read-cache.js";
import { resolveWinners } from "./select.js";
import { buildTemplatesIndexes, generateTemplateFiles } from "./templates.js";

export async function generate(options: GenerateOptions = {}): Promise<GeneratedFile[]> {
  const root = options.root ?? process.cwd();

  const config = await loadProjectConfig({
    root,
    configPath: options.config,
    cliTargets: options.targets,
    cliTypes: options.types,
    inlineOverrides: options.overrides,
  });

  for (const target of config.targets) {
    if (!targets[target]) {
      const available = Object.keys(targets).join(", ");
      throw new Error(`Unknown target "${target}". Available targets: ${available}`);
    }
  }

  const sink = new DiagnosticSink((diagnostic) => {
    if (diagnostic.code === "shadowed") options.onShadowed?.(diagnostic.detail);
    (options.onDiagnostic ?? printDiagnostic)(diagnostic);
  });
  const run: GenerateRun = {
    root,
    config,
    sink,
    shadow: (event) =>
      sink.report({
        code: "shadowed",
        target: event.target,
        type: event.type,
        message: `${event.losingPath} shadowed by ${event.winningPath}`,
        detail: event,
      }),
  };

  const slots = await discoverTemplates(root, config, options.templates);
  resolveWinners(slots, config.targets, config, run.shadow);

  const reader = new FileReader();
  // Docs are target-independent, so every target shares one index and one
  // missing-name set (a broken link warns once, not once per target).
  const docs = await buildDocsIndex(root, config);
  const missingDocs = new Set<string>();
  const indexes = await buildTemplatesIndexes(run, slots, reader, docs, missingDocs);

  const generatedFiles = await generateTemplateFiles(run, slots, reader, indexes);

  for (const name of missingDocs) {
    sink.report({
      code: "missing-doc",
      message: `docPath('${name}') matched no file under docs/ in templatesDir or any additionalTemplateDirs entry`,
      detail: { name },
    });
  }

  if (config.types.includes("hooks")) generatedFiles.push(...(await generateHooksFiles(run)));
  if (config.types.includes("mcp")) generatedFiles.push(...(await generateMCPFiles(run)));

  return generatedFiles;
}
