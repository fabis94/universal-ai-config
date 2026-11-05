import { loadProjectConfig } from "../../config/loader.js";
import { agentsOverrideDiagnostic, findAgentsOverrideFiles } from "../clean/agents-overrides.js";
import { DiagnosticSink, printDiagnostic, type Diagnostic } from "../diagnostics.js";
import { buildPlan, type OutputPlan } from "../plan/build-plan.js";
import { createLocator } from "../plan/locate.js";
import { targets } from "../../targets/index.js";
import type { GeneratedFile, GenerateOptions, TemplateType } from "../../types.js";
import { generateAgentsMdFiles } from "./agents-md.js";
import { assertNoPathCollisions, assertNoStandardWrites } from "./collisions.js";
import type { GenerateRun } from "./context.js";
import { buildDocsIndex, discoverJsonFiles, discoverTemplates } from "./discover.js";
import { generateHooksFiles } from "./hooks.js";
import { generateMCPFiles } from "./mcp.js";
import { FileReader } from "./read-cache.js";
import { resolveWinners } from "./select.js";
import { generateFromStandards, setAsideSourcedTemplates } from "./standards/index.js";
import { buildTemplatesIndexes, generateTemplateFiles } from "./templates.js";

export interface GenerateResult {
  /** Every file to write; nothing is on disk until `writeGeneratedFiles()` */
  files: GeneratedFile[];
  /** Every diagnostic of the run, in report order */
  diagnostics: Diagnostic[];
  /** What was generated for which target, and what was shared or skipped */
  plan: OutputPlan;
}

/** Warn when `agentsMd.enable: false` is overridden by codex being a target. */
function reportForcedAgentsMd(run: GenerateRun, plan: OutputPlan): void {
  if (plan.agentsMd?.forced && run.config.agentsMd.enable === false) {
    run.sink.report({
      code: "agents-md-forced",
      type: "instructions",
      message:
        "agentsMd.enable is false, but codex is a target and reads only AGENTS.md, so AGENTS.md is generated anyway",
      detail: { enable: false },
    });
  }
}

/**
 * Report each output a target skipped because it reads another one — for
 * types the project has templates of, so a project without, say, MCP
 * templates hears nothing about MCP. (It still fires when the source ended
 * up writing nothing: the reader then gets nothing either.)
 */
function reportServedBy(
  run: GenerateRun,
  plan: OutputPlan,
  typesWithTemplates: Set<TemplateType>,
): void {
  for (const served of plan.servedBy) {
    if (!typesWithTemplates.has(served.type)) continue;
    const optIn = served.by === "agentsMd" && !plan.agentsMd?.forced;
    const source =
      served.by === "agentsMd"
        ? "the AGENTS.md files"
        : `${served.by}'s ${served.type === "mcp" ? "MCP config" : served.type}`;
    const message = optIn
      ? `agentsMd.enable is on, so ${served.target} reads the AGENTS.md files instead of its own instruction files. ` +
        `${served.target} loses: ${served.loses}`
      : `${served.target} reads ${source} too, so uac skips ${served.target}'s own ${served.type} output. ` +
        `Usually you only need one of these targets on a machine: set \`targets\` in universal-ai-config.overrides.ts (\`uac setup\` writes it). ` +
        `${served.target} loses: ${served.loses}`;
    run.sink.report({
      code: "served-by",
      target: served.target,
      type: served.type,
      message,
      detail: {
        by: served.by,
        loses: served.loses,
        reason: optIn ? "agents-md-enabled" : "overlap",
      },
    });
  }
}

/**
 * Generate every output for a project: the files, every diagnostic, and the
 * plan that decided which target generates what.
 */
export async function generateProject(options: GenerateOptions = {}): Promise<GenerateResult> {
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
  const plan = buildPlan(config);
  const run: GenerateRun = {
    root,
    config,
    sink,
    locator: createLocator(config, plan),
    shadow: (event) =>
      sink.report({
        code: "shadowed",
        target: event.target,
        type: event.type,
        message: `${event.losingPath} shadowed by ${event.winningPath}`,
        detail: event,
      }),
  };
  reportForcedAgentsMd(run, plan);

  const slots = await discoverTemplates(root, config, options.templates);
  // Types read from a standard have no templates: the template pipeline never sees them
  setAsideSourcedTemplates(run, plan, slots);
  resolveWinners(slots, config.targets, config, run.shadow);

  const reader = new FileReader();
  // Docs are target-independent, so every target shares one index and one
  // missing-name set (a broken link warns once, not once per target).
  const docs = await buildDocsIndex(root, config);
  const missingDocs = new Set<string>();
  const indexes = await buildTemplatesIndexes(run, plan, slots, reader, docs, missingDocs);

  const files = await generateTemplateFiles(run, slots, reader, indexes, plan);
  files.push(...(await generateAgentsMdFiles(run, plan, slots, reader, indexes)));
  files.push(...(await generateFromStandards(run, plan, reader)));

  for (const name of missingDocs) {
    sink.report({
      code: "missing-doc",
      message: `docPath('${name}') matched no file under docs/ in templatesDir or any additionalTemplateDirs entry`,
      detail: { name },
    });
  }

  if (config.types.includes("hooks")) files.push(...(await generateHooksFiles(run, plan)));
  if (config.types.includes("mcp")) files.push(...(await generateMCPFiles(run, plan)));

  const typesWithTemplates = new Set<TemplateType>([...slots.values()].map((slot) => slot.type));
  for (const type of ["hooks", "mcp"] as const) {
    if (!config.types.includes(type)) continue;
    if ((await discoverJsonFiles(root, config, type)).size > 0) typesWithTemplates.add(type);
  }
  reportServedBy(run, plan, typesWithTemplates);

  // uac 2.x's Codex output: a leftover one hides the AGENTS.md uac now writes
  if (config.types.includes("instructions")) {
    const overrides = await findAgentsOverrideFiles(root, config);
    if (overrides.length > 0) sink.report(agentsOverrideDiagnostic(overrides));
  }
  assertNoStandardWrites(files, plan.sourced);
  return { files: assertNoPathCollisions(files), diagnostics: sink.items, plan };
}

/** Generate every output for a project. Same as `generateProject()`, returning only the files. */
export async function generate(options: GenerateOptions = {}): Promise<GeneratedFile[]> {
  return (await generateProject(options)).files;
}
