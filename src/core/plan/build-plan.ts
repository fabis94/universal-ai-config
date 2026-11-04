import { targets as registry } from "../../targets/index.js";
import type { ForeignRead, Reconcile, TargetDefinition } from "../../targets/define-target.js";
import type { AgentsMdVariation, ResolvedConfig, Target, TemplateType } from "../../types.js";

/** AGENTS.md output for one run. */
export interface AgentsMdPlan {
  variation: AgentsMdVariation;
  indexDir: string;
  /** The target the shared files are rendered for (its overrides, exclude and EJS `target`) */
  view: Target;
  /** Every target in the run that reads the AGENTS.md files */
  consumers: Target[];
  /** True when a target that reads only AGENTS.md (codex) is in the run */
  forced: boolean;
}

/** A target that skips its own output for a type because it reads another output instead. */
export interface ServedBy {
  target: Target;
  type: TemplateType;
  by: Target | "agentsMd";
  reconcile: Reconcile;
  loses: string;
}

/** A tool that runs another target's hooks too, but skips commands identical to its own. */
export interface DuplicateRunCheck {
  target: Target;
  against: Target;
  events: readonly string[];
}

/** What a run generates, decided once from the target set and the targets' `reads` facts. */
export interface OutputPlan {
  /** The run's effective targets (config, overrides, `-t`/`targets` option) */
  targets: Target[];
  types: TemplateType[];
  /** Set when AGENTS.md files are generated */
  agentsMd?: AgentsMdPlan;
  servedBy: ServedBy[];
  duplicateRunChecks: DuplicateRunCheck[];
  /** Why `target` skips its own `type` output, if it does */
  servedFor(target: Target, type: TemplateType): ServedBy | undefined;
  /** Whether `target`'s instructions come from the AGENTS.md files */
  readsAgentsMdInstructions(target: Target): boolean;
  /** Every target that reads what `target` generates for `type` (itself included) */
  consumersOf(target: Target, type: TemplateType): Target[];
}

type Registry = Record<string, TargetDefinition>;

function readsAgentsMd(def: TargetDefinition | undefined): boolean {
  if (!def) return false;
  return (
    def.instructions === "agentsMd" ||
    (def.reads?.instructions ?? []).some((read) => read.from === "agentsMd")
  );
}

function planAgentsMd(
  config: Pick<ResolvedConfig, "targets" | "types" | "agentsMd">,
  definitions: Registry,
): AgentsMdPlan | undefined {
  if (!config.types.includes("instructions")) return undefined;
  const native = config.targets.filter((t) => definitions[t]?.instructions === "agentsMd");
  const forced = native.length > 0;
  if (!forced && config.agentsMd.enable !== true) return undefined;

  const consumers = config.targets.filter((t) => readsAgentsMd(definitions[t]));
  const view = native[0] ?? consumers[0];
  if (!view) return undefined;
  return {
    variation: config.agentsMd.variation,
    indexDir: config.agentsMd.indexDir,
    view,
    consumers,
    forced,
  };
}

/**
 * Decide which outputs to generate. One rule for every type: when a tool would
 * load two copies of the same thing (`loads-both`), or two targets write the
 * same file (`same-file`), only the source's copy is generated and the reader
 * skips its own. `dedupes-identical` reads keep both and are checked for
 * entries that would still run twice; `prefers-own` reads need nothing.
 *
 * The target set is the run's, never the project's: a developer generating
 * only copilot (`-t copilot`) gets Copilot's own outputs.
 */
export function buildPlan(
  config: Pick<ResolvedConfig, "targets" | "types" | "agentsMd">,
  definitions: Registry = registry,
): OutputPlan {
  const agentsMd = planAgentsMd(config, definitions);
  const inRun = new Set(config.targets);
  const supports = (target: Target, type: TemplateType): boolean =>
    inRun.has(target) &&
    config.types.includes(type) &&
    (definitions[target]?.supportedTypes.includes(type) ?? false);

  // Memoized "does `target` yield `type`, and to whom". A target only counts
  // as a source when it doesn't yield the type itself, so chains and cycles
  // resolve deterministically in target order.
  const yields = new Map<string, ForeignRead | null>();
  const visiting = new Set<string>();
  const yieldOf = (target: Target, type: TemplateType): ForeignRead | null => {
    const key = `${target}:${type}`;
    const known = yields.get(key);
    if (known !== undefined) return known;
    if (visiting.has(key)) return null;
    visiting.add(key);

    let result: ForeignRead | null = null;
    if (supports(target, type)) {
      for (const read of definitions[target]?.reads?.[type] ?? []) {
        if (read.reconcile !== "loads-both" && read.reconcile !== "same-file") continue;
        const produced =
          read.from === "agentsMd"
            ? agentsMd !== undefined
            : read.from !== target && supports(read.from, type) && !yieldOf(read.from, type);
        if (produced) {
          result = read;
          break;
        }
      }
    }
    visiting.delete(key);
    yields.set(key, result);
    return result;
  };

  const servedBy: ServedBy[] = [];
  const duplicateRunChecks: DuplicateRunCheck[] = [];
  for (const target of config.targets) {
    for (const type of config.types) {
      const read = yieldOf(target, type);
      if (read) {
        servedBy.push({
          target,
          type,
          by: read.from,
          reconcile: read.reconcile,
          loses: read.loses,
        });
        continue;
      }
      if (!supports(target, type)) continue;
      for (const other of definitions[target]?.reads?.[type] ?? []) {
        if (other.reconcile !== "dedupes-identical" || other.from === "agentsMd") continue;
        if (supports(other.from, type) && !yieldOf(other.from, type)) {
          duplicateRunChecks.push({ target, against: other.from, events: other.events ?? [] });
        }
      }
    }
  }

  const servedFor = (target: Target, type: TemplateType) =>
    servedBy.find((s) => s.target === target && s.type === type);

  return {
    targets: [...config.targets],
    types: [...config.types],
    agentsMd,
    servedBy,
    duplicateRunChecks,
    servedFor,
    readsAgentsMdInstructions: (target) =>
      agentsMd !== undefined && agentsMd.consumers.includes(target),
    consumersOf: (target, type) => {
      if (type === "instructions" && agentsMd?.consumers.includes(target)) {
        return [...agentsMd.consumers];
      }
      return [
        target,
        ...servedBy.filter((s) => s.by === target && s.type === type).map((s) => s.target),
      ];
    },
  };
}
