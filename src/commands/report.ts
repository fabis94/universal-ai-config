import { consola } from "consola";
import pc from "picocolors";
import type { Diagnostic, DiagnosticDetails } from "../core/diagnostics.js";
import type { GeneratedFile, ShadowEvent, Target, TemplateType } from "../types.js";

interface TypeStats {
  count: number;
  inputs: number;
}

/** Who reads a file: its consumers, or just its target. */
function readersOf(file: GeneratedFile): Target[] {
  return file.consumers && file.consumers.length > 0 ? file.consumers : [file.target];
}

function typeLabel(type: string, count: number): string {
  return `${count} ${count === 1 ? type.replace(/s$/, "") : type}`;
}

/**
 * One line per target — or per group of targets for shared files like
 * AGENTS.md — with a file count per type.
 */
export function formatTargetSummary(files: GeneratedFile[]): string[] {
  const byReaders = new Map<string, Map<string, TypeStats>>();
  for (const file of files) {
    const readers = readersOf(file);
    const key =
      readers.length > 1 ? `shared by ${readers.join(", ")}` : (readers[0] ?? file.target);
    let types = byReaders.get(key);
    if (!types) {
      types = new Map();
      byReaders.set(key, types);
    }
    const stats = types.get(file.type) ?? { count: 0, inputs: 0 };
    stats.count += 1;
    if (file.inputCount !== undefined) stats.inputs += file.inputCount;
    types.set(file.type, stats);
  }

  return [...byReaders].map(([readers, types]) => {
    const parts = [...types].map(([type, { count, inputs }]) => {
      const label = typeLabel(type, count);
      return inputs > 0 ? `${label} (${inputs} input${inputs === 1 ? "" : "s"})` : label;
    });
    return `${readers} — ${parts.join(", ")}`;
  });
}

/** One dry-run line per file: path, what it was generated for, and who else reads it. */
export function formatFileLine(file: GeneratedFile): string {
  const inputs =
    file.inputCount !== undefined
      ? `, ${file.inputCount} input${file.inputCount === 1 ? "" : "s"}`
      : "";
  const readers = readersOf(file);
  const shared = readers.length > 1 ? `, read by ${readers.join(", ")}` : "";
  return `  ${file.path} (${file.target}/${file.type} ← ${file.sourcePath}${inputs}${shared})`;
}

/** Names the thing that collided, for scopes where the path alone doesn't say it. */
function scopeLabel(event: ShadowEvent): string {
  switch (event.scope) {
    case "server":
      return `mcp server "${event.name}"`;
    case "input":
      return `mcp input "${event.name}"`;
    case "handler":
      return `hooks ${event.name} handler`;
    default:
      return "";
  }
}

/** One line describing a candidate that lost a name collision. */
function formatShadow(event: ShadowEvent): string {
  const label = scopeLabel(event);

  // A whole template or JSON file losing to the same path in another source dir:
  // both sides share a relative path, so name it once and contrast the dirs.
  if (!label && event.losingSource !== event.winningSource) {
    const relative = event.losingSource
      ? event.losingPath.slice(event.losingSource.length + 1)
      : event.losingPath;
    return `${relative}: ${event.losingSource} shadowed by ${event.winningSource}`;
  }

  if (event.losingPath === event.winningPath) {
    return `${label}: duplicate within ${event.winningPath}`;
  }

  const prefix = label ? `${label}: ` : "";
  return `${prefix}${event.losingPath} shadowed by ${event.winningPath}`;
}

interface ShadowGroup {
  event: ShadowEvent;
  targets: string[];
}

/**
 * Collapse the per-target events into one entry per distinct collision. The same
 * template usually loses for every target, and that shouldn't print four times —
 * but a per-target `exclude` can make targets disagree, so the targets a
 * collision applies to are tracked and shown when they're only a subset.
 */
function groupShadows(shadows: ShadowEvent[]): ShadowGroup[] {
  const groups = new Map<string, ShadowGroup>();
  for (const event of shadows) {
    const key = [event.scope, event.type, event.name, event.losingPath, event.winningPath].join(
      "\u0000",
    );
    const existing = groups.get(key);
    if (existing) existing.targets.push(event.target);
    else groups.set(key, { event, targets: [event.target] });
  }
  return [...groups.values()];
}

type ServedDiagnostic = Extract<Diagnostic, { code: "served-by" }>;

const TYPE_NOUN: Record<TemplateType, string> = {
  instructions: "instructions",
  skills: "skills",
  agents: "agents",
  hooks: "hooks",
  mcp: "MCP config",
};

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/**
 * The switch-over lines: one per shared output, naming who reads it. AGENTS.md
 * gets its own wording, since it replaces a whole instruction mechanism.
 */
function formatServedBy(served: ServedDiagnostic[], verbose: boolean): string[] {
  const groups = new Map<string, ServedDiagnostic[]>();
  for (const d of served) {
    const key = `${d.detail.by}\u0000${d.type ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }

  const lines: string[] = [];
  for (const group of groups.values()) {
    const [first] = group;
    if (!first?.target || !first.type) continue;
    const readers = group.map((d) => d.target).filter((t): t is Target => t !== undefined);
    const by = first.detail.by;
    lines.push(
      by === "agentsMd"
        ? `${list(readers)} read the generated AGENTS.md files — skipping their own instruction files`
        : `${list([by, ...readers])} ${readers.length === 1 ? "both" : "all"} read ${by}'s ${TYPE_NOUN[first.type]} — generating only ${by}'s`,
    );
    if (verbose) {
      for (const d of group) lines.push(`    ${d.target} loses: ${d.detail.loses}`);
    }
  }
  return lines;
}

function printLines(lines: string[]): void {
  for (const line of lines) consola.log(pc.dim(`  ↳ ${line}`));
}

/**
 * Print a run's diagnostics, grouped. Overlapping targets come first as one
 * warning that leads with the fix (generate fewer targets per machine), then
 * every other warning, then counts of info-level diagnostics (detail with
 * `--verbose`).
 */
export function printDiagnostics(
  diagnostics: Diagnostic[],
  options: { verbose: boolean; allTargets: Set<string> },
): void {
  const { verbose } = options;

  const served = diagnostics.filter((d): d is ServedDiagnostic => d.code === "served-by");
  if (served.length > 0) {
    consola.warn(
      "Several targets in this run read the same files. Usually you only need one of them on a machine: " +
        "set `targets` in universal-ai-config.overrides.ts.",
    );
    printLines(formatServedBy(served, verbose));
    if (!verbose) consola.log(pc.dim("  (--verbose for what each target loses)"));
  }

  for (const d of diagnostics) {
    if (d.code === "served-by" || d.severity !== "warn") continue;
    consola.warn(`[${d.target ?? "uac"}] ${d.message}`);
  }

  const shadows = diagnostics
    .filter((d): d is Extract<Diagnostic, { code: "shadowed" }> => d.code === "shadowed")
    .map((d) => d.detail as DiagnosticDetails["shadowed"]);
  const shadowGroups = groupShadows(shadows);
  const divergent = diagnostics.filter(
    (d) => d.code === "shared-divergence" && d.severity === "info",
  );

  if (!verbose) {
    if (shadowGroups.length > 0) {
      consola.info(
        `${shadowGroups.length} shadowed by higher-precedence sources (--verbose to list)`,
      );
    }
    if (divergent.length > 0) {
      consola.info(
        `${divergent.length} instruction(s) render differently for a target that reads the shared AGENTS.md (--verbose to list)`,
      );
    }
    return;
  }

  if (shadowGroups.length > 0) {
    consola.info(`${shadowGroups.length} shadowed by higher-precedence sources:`);
    for (const { event, targets } of shadowGroups) {
      // Only worth naming targets when a collision didn't apply to all of them
      const scope = targets.length < options.allTargets.size ? ` [${targets.join(", ")}]` : "";
      consola.log(pc.dim(`  ↳ ${formatShadow(event)}${scope}`));
    }
  }
  for (const d of diagnostics) {
    if (d.severity !== "info" || d.code === "shadowed") continue;
    consola.info(`[${d.target ?? "uac"}] ${d.message}`);
  }
}
