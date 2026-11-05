import { checkClaudeMd, checkCodexBudget } from "../agents-md/checks.js";
import { buildAgentsMdFiles, type AgentsMdEntry } from "../agents-md/index.js";
import { parseTemplate, type TemplatesIndex } from "../parser.js";
import type { AgentsMdPlan, OutputPlan } from "../plan/build-plan.js";
import { toPosixPath } from "../plan/locate.js";
import { resolveOverrides } from "../resolve-overrides.js";
import type { GeneratedFile, Target, UniversalFrontmatter } from "../../types.js";
import type { GenerateRun } from "./context.js";
import type { DiscoveredTemplate, TemplateSlot } from "./discover.js";
import type { FileReader } from "./read-cache.js";
import { stableStringify } from "./stable-stringify.js";

/** One instruction template rendered for one target. */
async function renderEntry(
  run: GenerateRun,
  template: DiscoveredTemplate,
  target: Target,
  reader: FileReader,
  indexes: Map<Target, TemplatesIndex>,
  consumers: Target[],
): Promise<AgentsMdEntry> {
  const parsed = parseTemplate(await reader.text(template), {
    target,
    type: "instructions",
    config: run.config,
    templatesIndex: indexes.get(target),
    locator: run.locator,
    consumers,
  });
  return {
    name: template.name,
    sourcePath: toPosixPath(template.relativePath),
    frontmatter: resolveOverrides(
      parsed.frontmatter as Record<string, unknown>,
      target,
    ) as UniversalFrontmatter,
    body: parsed.body,
  };
}

/** The parts of an entry that change what a reader gets. */
function fingerprint(entry: AgentsMdEntry): string {
  const { description, globs, alwaysApply } = entry.frontmatter;
  return stableStringify({ description, globs, alwaysApply, body: entry.body.trim() });
}

/**
 * Report what each non-view reader gets differently from the shared files:
 * templates it would have had but the view excluded (`missing`), templates it
 * excluded but gets anyway (`extra`), and templates that render differently
 * for it (`different` — per-target overrides or `target` checks in EJS).
 */
async function reportDivergence(
  run: GenerateRun,
  agentsMd: AgentsMdPlan,
  slots: TemplateSlot[],
  viewEntries: Map<string, AgentsMdEntry>,
  reader: FileReader,
  indexes: Map<Target, TemplatesIndex>,
): Promise<void> {
  const { view } = agentsMd;
  for (const readerTarget of agentsMd.consumers) {
    if (readerTarget === view) continue;
    const report = run.sink.scoped(readerTarget, "instructions");
    for (const slot of slots) {
      const own = slot.winnerByTarget.get(readerTarget);
      const shared = viewEntries.get(slot.name);
      const base = { view, reader: readerTarget, name: slot.name };
      if (own && !shared) {
        report({
          code: "shared-divergence",
          source: toPosixPath(own.relativePath),
          message: `instruction "${slot.name}" is excluded for ${view}, so it is missing from AGENTS.md, which ${readerTarget} reads instead of its own output`,
          detail: { ...base, kind: "missing" },
        });
      } else if (!own && shared) {
        report({
          code: "shared-divergence",
          source: shared.sourcePath,
          message: `instruction "${slot.name}" is excluded for ${readerTarget}, but ${readerTarget} reads AGENTS.md (rendered for ${view}), which includes it`,
          detail: { ...base, kind: "extra" },
        });
      } else if (own && shared) {
        const mine = await renderEntry(run, own, readerTarget, reader, indexes, agentsMd.consumers);
        if (
          toPosixPath(own.relativePath) !== shared.sourcePath ||
          fingerprint(mine) !== fingerprint(shared)
        ) {
          report({
            code: "shared-divergence",
            severity: "info",
            source: shared.sourcePath,
            message: `instruction "${slot.name}" renders differently for ${readerTarget}; AGENTS.md carries the ${view} version`,
            detail: { ...base, kind: "different" },
          });
        }
      }
    }
  }
}

/** Render the shared AGENTS.md files for every target that reads them. */
export async function generateAgentsMdFiles(
  run: GenerateRun,
  plan: OutputPlan,
  slots: Map<string, TemplateSlot>,
  reader: FileReader,
  indexes: Map<Target, TemplatesIndex>,
): Promise<GeneratedFile[]> {
  const agentsMd = plan.agentsMd;
  if (!agentsMd) return [];
  const { view, consumers } = agentsMd;
  const report = run.sink.scoped(view, "instructions");

  const instructionSlots = [...slots.values()].filter((slot) => slot.type === "instructions");
  const viewEntries = new Map<string, AgentsMdEntry>();
  for (const slot of instructionSlots) {
    const winner = slot.winnerByTarget.get(view);
    if (!winner) continue;
    viewEntries.set(slot.name, await renderEntry(run, winner, view, reader, indexes, consumers));
  }

  const files = buildAgentsMdFiles(
    [...viewEntries.values()],
    { variation: agentsMd.variation, indexDir: toPosixPath(agentsMd.indexDir) },
    report,
  );

  if (consumers.includes("codex"))
    checkCodexBudget(files, run.sink.scoped("codex", "instructions"));
  if (consumers.includes("claude")) {
    await checkClaudeMd(run.root, run.sink.scoped("claude", "instructions"));
  }
  await reportDivergence(run, agentsMd, instructionSlots, viewEntries, reader, indexes);

  return files.map((file) => ({
    path: file.path,
    content: file.content,
    target: view,
    type: "instructions",
    sourcePath: file.sourcePaths.join(","),
    consumers: [...consumers],
  }));
}
