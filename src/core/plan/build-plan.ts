import { targets as registry } from "../../targets/index.js";
import type { ForeignRead, Reconcile, TargetDefinition } from "../../targets/define-target.js";
import {
  isStandardType,
  readsStandard,
  sourcedTypes,
  standardOf,
  type StandardId,
  type StandardType,
} from "./standards.js";
import type {
  AgentsMdVariation,
  HookHandlerType,
  ResolvedConfig,
  Target,
  TemplateType,
} from "../../types.js";

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
  /** Hooks: handler types that make the reader reject the source's whole file */
  rejectsHandlerTypes?: readonly HookHandlerType[];
}

/** A tool that runs another target's hooks too, but skips commands identical to its own. */
export interface DuplicateRunCheck {
  target: Target;
  against: Target;
  events: readonly string[];
  /** The tool reads `against`'s file only when some handler group has a `matcher` key */
  onlyWithMatcher: boolean;
}

/**
 * How one target gets one template type in a run — the single answer every
 * emitter, the locator and the reports go by.
 *
 * - `own`: uac renders the templates into the target's own output.
 * - `agentsMd`: the generated AGENTS.md files are its instructions. `served`
 *   is set for a target that skips its own instruction output for them
 *   (claude, cursor, copilot); codex reads nothing else, so it has none.
 * - `served`: another target's output serves it (`loads-both` / `same-file`).
 * - `native`: the type comes from a standard (`config.standards`) the tool
 *   loads on its own, so uac generates nothing for it.
 * - `copy`: the type comes from a standard the tool doesn't load, so uac
 *   copies the standard's files into the tool's own output.
 * - `off`: nothing for this target and type, and why.
 */
export type OutputMode =
  | { kind: "own" }
  | { kind: "agentsMd"; served?: ServedBy }
  | { kind: "served"; served: ServedBy }
  | { kind: "native"; standard: StandardId }
  | { kind: "copy"; standard: StandardId }
  | { kind: "off"; reason: "not-in-run" | "type-off" | "unsupported" };

/** What a run generates, decided once from the target set and the targets' `reads` facts. */
export interface OutputPlan {
  /** The run's effective targets (config, overrides, `-t`/`targets` option) */
  targets: Target[];
  types: TemplateType[];
  /** The types read from a standard instead of uac templates (`config.standards`) */
  sourced: ReadonlySet<StandardType>;
  /** Set when AGENTS.md files are generated */
  agentsMd?: AgentsMdPlan;
  /** Every target that skips its own output for a type, in target × type order */
  servedBy: ServedBy[];
  duplicateRunChecks: DuplicateRunCheck[];
  /** How `target` gets `type` in this run */
  outputFor(target: Target, type: TemplateType): OutputMode;
  /** Every target that reads what `target` generates for `type` (itself included) */
  consumersOf(target: Target, type: TemplateType): Target[];
}

type Registry = Record<string, TargetDefinition>;

/** The target has its own output config for a type (codex's AGENTS.md-only instructions don't count). */
function hasOwnOutput(def: TargetDefinition, type: TemplateType): boolean {
  return typeof def[type] === "object";
}

/** The config fields a plan is built from. */
type PlanConfig = Pick<ResolvedConfig, "targets" | "types" | "agentsMd" | "standards">;

/**
 * The targets whose cleaning removes the AGENTS.md files: a target that reads
 * nothing but AGENTS.md (codex) always, any other reader only when
 * `agentsMd.enable` made AGENTS.md its instruction output. None while the
 * project writes its AGENTS.md files itself (`standards`).
 */
export function agentsMdOwners(
  targetList: Target[],
  config: Pick<ResolvedConfig, "agentsMd" | "standards" | "types">,
  definitions: Registry = registry,
): Target[] {
  if (sourcedTypes(config).has("instructions")) return [];
  return targetList.filter((target) => {
    const def = definitions[target];
    if (def?.instructions === "agentsMd") return true;
    return config.agentsMd.enable === true && readsStandard(def, "instructions");
  });
}

function planAgentsMd(
  config: PlanConfig,
  sourced: ReadonlySet<StandardType>,
  definitions: Registry,
): AgentsMdPlan | undefined {
  if (!config.types.includes("instructions")) return undefined;
  // The project writes its own AGENTS.md files: uac generates none
  if (sourced.has("instructions")) return undefined;
  const native = config.targets.filter((t) => definitions[t]?.instructions === "agentsMd");
  const forced = native.length > 0;
  if (!forced && config.agentsMd.enable !== true) return undefined;

  const consumers = config.targets.filter((t) => readsStandard(definitions[t], "instructions"));
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
 *
 * A type read from a standard (`config.standards`) has no templates to share,
 * so none of that is planned for it: each target either loads the standard
 * itself (`native`) or gets copies of its files (`copy`).
 */
export function buildPlan(config: PlanConfig, definitions: Registry = registry): OutputPlan {
  const sourced = sourcedTypes(config);
  const agentsMd = planAgentsMd(config, sourced, definitions);
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
      if (isStandardType(type) && sourced.has(type)) continue;
      const read = yieldOf(target, type);
      if (read) {
        servedBy.push({
          target,
          type,
          by: read.from,
          reconcile: read.reconcile,
          loses: read.loses,
          ...(read.rejectsHandlerTypes ? { rejectsHandlerTypes: read.rejectsHandlerTypes } : {}),
        });
        continue;
      }
      if (!supports(target, type)) continue;
      for (const other of definitions[target]?.reads?.[type] ?? []) {
        if (other.reconcile !== "dedupes-identical" || other.from === "agentsMd") continue;
        if (supports(other.from, type) && !yieldOf(other.from, type)) {
          duplicateRunChecks.push({
            target,
            against: other.from,
            events: other.events ?? [],
            onlyWithMatcher: other.onlyWithMatcher ?? false,
          });
        }
      }
    }
  }

  const servedFor = (target: Target, type: TemplateType) =>
    servedBy.find((s) => s.target === target && s.type === type);

  const outputFor = (target: Target, type: TemplateType): OutputMode => {
    const def = definitions[target];
    if (!inRun.has(target) || !def) return { kind: "off", reason: "not-in-run" };
    if (!config.types.includes(type)) return { kind: "off", reason: "type-off" };
    if (!def.supportedTypes.includes(type)) return { kind: "off", reason: "unsupported" };
    if (isStandardType(type) && sourced.has(type)) {
      const standard = standardOf(type);
      if (readsStandard(def, type)) return { kind: "native", standard };
      return hasOwnOutput(def, type)
        ? { kind: "copy", standard }
        : { kind: "off", reason: "unsupported" };
    }
    const served = servedFor(target, type);
    if (type === "instructions" && agentsMd?.consumers.includes(target)) {
      return served ? { kind: "agentsMd", served } : { kind: "agentsMd" };
    }
    if (served) return { kind: "served", served };
    return hasOwnOutput(def, type) ? { kind: "own" } : { kind: "off", reason: "unsupported" };
  };

  return {
    targets: [...config.targets],
    types: [...config.types],
    sourced,
    agentsMd,
    servedBy,
    duplicateRunChecks,
    outputFor,
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
