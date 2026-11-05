import { readFile } from "node:fs/promises";
import { posix } from "node:path";
import { toPosixPath } from "../plan/locate.js";
import { resolveJsonVariables } from "../resolve-json-variables.js";
import { resolveOverrides } from "../resolve-overrides.js";
import { flattenCommand } from "../shell.js";
import { stringifyToml } from "../toml.js";
import { targets } from "../../targets/index.js";
import type { Reporter } from "../diagnostics.js";
import type { GeneratedFile, HookHandlerType, Target, UniversalHookHandler } from "../../types.js";
import type { OutputPlan } from "../plan/build-plan.js";
import type { GenerateRun } from "./context.js";
import { discoverJsonFiles, type DiscoveredJsonFile } from "./discover.js";
import { selectJsonFiles, type ShadowReporter } from "./select.js";
import { stableStringify } from "./stable-stringify.js";

interface MergedHookData {
  hooks: Record<string, Record<string, unknown>[]>;
  /** Maps each merged handler object back to the file it came from */
  handlerSources: WeakMap<Record<string, unknown>, DiscoveredJsonFile>;
}

async function mergeHookFiles(
  files: DiscoveredJsonFile[],
  variables: Record<string, unknown>,
): Promise<MergedHookData | null> {
  if (files.length === 0) return null;

  const merged: Record<string, Record<string, unknown>[]> = {};
  const handlerSources = new WeakMap<Record<string, unknown>, DiscoveredJsonFile>();

  for (const file of files) {
    const rawParsed = JSON.parse(await readFile(file.filePath, "utf-8"));
    const parsed = resolveJsonVariables(rawParsed, variables) as {
      hooks?: Record<string, Record<string, unknown>[]>;
    };
    if (!parsed.hooks) continue;

    for (const [event, handlers] of Object.entries(parsed.hooks)) {
      const list = (merged[event] ??= []);
      for (const handler of handlers) {
        list.push(handler);
        handlerSources.set(handler, file);
      }
    }
  }

  return Object.keys(merged).length > 0 ? { hooks: merged, handlerSources } : null;
}

/** Fields a handler of each type must have to do anything. */
const REQUIRED_FIELDS: Record<HookHandlerType, readonly (keyof UniversalHookHandler)[]> = {
  command: ["command"],
  http: ["url"],
  mcp_tool: ["server", "tool"],
  prompt: ["prompt"],
  agent: ["prompt"],
};

/**
 * Whether a resolved handler should reach this target's transform.
 *
 * A handler missing a required field is dropped silently: that is how a
 * per-target override opts a target out (`command: { claude: "x" }` has no
 * command for copilot). A handler whose type the target can't run is dropped
 * with a diagnostic, because the user asked for something the target lacks.
 */
function isRunnable(
  handler: Record<string, unknown>,
  event: string,
  handlerTypes: readonly HookHandlerType[],
  report: Reporter,
): boolean {
  const type = (handler.type ?? "command") as HookHandlerType;
  const required = REQUIRED_FIELDS[type] as readonly string[] | undefined;
  if (required && required.some((field) => !handler[field])) return false;
  if (!required || !handlerTypes.includes(type)) {
    report({
      code: "unsupported",
      message: `${event}: "${String(type)}" hook handlers are not supported (supported: ${handlerTypes.join(", ")}); dropping`,
      detail: { kind: "handler-type", name: String(type) },
    });
    return false;
  }
  return true;
}

/**
 * Resolve per-target overrides on every merged handler, dropping duplicates.
 *
 * Handlers have no name to key on, so identity is the resolved handler itself:
 * two files that produce an identical handler for this target declared the same
 * hook, and the first one wins. Comparing *after* override resolution is what
 * makes `{ command: { claude: "x" } }` and `{ command: "x" }` collapse for
 * claude while staying distinct elsewhere.
 */
function resolveHookHandlers(
  hooks: Record<string, Record<string, unknown>[]>,
  target: Target,
  handlerTypes: readonly HookHandlerType[],
  handlerSources: WeakMap<Record<string, unknown>, DiscoveredJsonFile>,
  survivingSources: Set<DiscoveredJsonFile>,
  shadow: ShadowReporter,
  report: Reporter,
): Record<string, UniversalHookHandler[]> {
  const result: Record<string, UniversalHookHandler[]> = {};
  for (const [event, handlers] of Object.entries(hooks)) {
    const resolved: UniversalHookHandler[] = [];
    const winners = new Map<string, DiscoveredJsonFile | undefined>();
    for (const handler of handlers) {
      const r = resolveOverrides(handler, target);
      if (!isRunnable(r, event, handlerTypes, report)) continue;

      const fingerprint = stableStringify(r);
      const source = handlerSources.get(handler);
      if (winners.has(fingerprint)) {
        const winner = winners.get(fingerprint);
        shadow({
          target,
          type: "hooks",
          scope: "handler",
          name: event,
          losingPath: source?.displayPath ?? event,
          winningPath: winner?.displayPath ?? event,
          losingSource: source?.sourceId ?? "",
          winningSource: winner?.sourceId ?? "",
        });
        continue;
      }

      winners.set(fingerprint, source);
      resolved.push(r as unknown as UniversalHookHandler);
      if (source) survivingSources.add(source);
    }
    if (resolved.length > 0) result[event] = resolved;
  }
  return result;
}

/** A target's handlers after selection, overrides and type filtering. */
interface ResolvedTargetHooks {
  handlers: Record<string, UniversalHookHandler[]>;
  inputCount: number;
}

/** What a hook runs, as a tool compares it: the command line, or the prompt text. */
function runKey(handler: UniversalHookHandler, withArgs: boolean): string | undefined {
  const type = handler.type ?? "command";
  if (type === "prompt") return `prompt:${handler.prompt ?? ""}`;
  if (type !== "command") return undefined;
  return `command:${withArgs ? flattenCommand(handler.command ?? "", handler.args) : (handler.command ?? "")}`;
}

/**
 * A tool that imports another target's hook file (Cursor reads Claude's) runs
 * those handlers too, skipping only commands identical to its own. Warn about
 * every imported handler that isn't identical: it runs a second time, or runs
 * where a per-target override meant to keep it out.
 */
function checkDuplicateRuns(
  run: GenerateRun,
  plan: OutputPlan,
  resolved: Map<Target, ResolvedTargetHooks>,
): void {
  for (const check of plan.duplicateRunChecks) {
    const source = resolved.get(check.against);
    const own = resolved.get(check.target);
    const sourceEvents = targets[check.against]?.hooks?.events ?? {};
    if (!source) continue;
    if (check.onlyWithMatcher) {
      const hasMatcher = Object.entries(source.handlers).some(
        ([event, handlers]) => sourceEvents[event] && handlers.some((h) => h.matcher),
      );
      if (!hasMatcher) continue;
    }

    const report = run.sink.scoped(check.target, "hooks");
    for (const event of check.events) {
      // The importing tool runs the source's command as written, without its args
      const ownKeys = new Set(
        (own?.handlers[event] ?? []).map((h) => runKey(h, true)).filter(Boolean),
      );
      for (const handler of source.handlers[event] ?? []) {
        const key = runKey(handler, false);
        if (!key || ownKeys.has(key)) continue;
        const what =
          handler.type === "prompt" ? `prompt "${handler.prompt}"` : `"${handler.command}"`;
        report({
          code: "duplicate-hook-run",
          message:
            `${check.target} also runs ${check.against}'s ${event} hook ${what}, because its own hooks don't have the identical command (it skips only identical ones). ` +
            `Usually you only need one of these targets on a machine: set \`targets\` in universal-ai-config.overrides.ts.`,
          detail: {
            against: check.against,
            event,
            command: handler.command ?? handler.prompt ?? "",
          },
        });
      }
    }
  }
}

/**
 * A reader that uses another target's hook file instead of its own may reject
 * that whole file over one handler type it can't parse (Copilot and a prompt,
 * agent or mcp_tool handler in .claude/settings.json).
 */
function checkRejectedFiles(
  run: GenerateRun,
  plan: OutputPlan,
  resolved: Map<Target, ResolvedTargetHooks>,
): void {
  for (const served of plan.servedBy) {
    if (served.type !== "hooks" || served.by === "agentsMd") continue;
    const rejected = served.rejectsHandlerTypes ?? [];
    const source = resolved.get(served.by);
    if (!source || rejected.length === 0) continue;
    const found = [
      ...new Set(
        Object.values(source.handlers)
          .flat()
          .map((h) => h.type ?? "command")
          .filter((type) => rejected.includes(type)),
      ),
    ];
    if (found.length === 0) continue;
    run.sink.report({
      code: "unsupported",
      target: served.target,
      type: "hooks",
      message:
        `${served.target} reads ${served.by}'s hook file instead of its own, but rejects that whole file because it has ${found.join(", ")} handlers — so ${served.target} runs none of these hooks. ` +
        `Generate ${served.target} on its own (set \`targets\` in universal-ai-config.overrides.ts), or keep those handlers out of ${served.by} with per-target overrides.`,
      detail: { kind: "handler-type", name: found.join(",") },
    });
  }
}

/** Merge every `hooks/*.json`, resolve it per target and render each target's hooks file. */
export async function generateHooksFiles(
  run: GenerateRun,
  plan: OutputPlan,
): Promise<GeneratedFile[]> {
  const { root, config, sink, shadow } = run;
  const hookSlots = await discoverJsonFiles(root, config, "hooks");
  if (hookSlots.size === 0) return [];

  const hooksRelativePath = toPosixPath(posix.join(config.templatesDir, "hooks"));
  const resolved = new Map<Target, ResolvedTargetHooks>();

  for (const targetName of config.targets) {
    const targetDef = targets[targetName];
    if (!targetDef?.hooks || !targetDef.supportedTypes.includes("hooks")) continue;
    // Another target's file serves this one (see the plan)
    if (plan.servedFor(targetName, "hooks")) continue;

    // Resolve same-named files and drop excluded ones — both are per-target
    const filteredFiles = selectJsonFiles(hookSlots, "hooks", targetName, config, shadow);
    const mergedHooks = await mergeHookFiles(filteredFiles, config.variables);
    if (!mergedHooks) continue;

    const survivingSources = new Set<DiscoveredJsonFile>();
    const handlers = resolveHookHandlers(
      mergedHooks.hooks,
      targetName,
      targetDef.hooks.handlerTypes,
      mergedHooks.handlerSources,
      survivingSources,
      shadow,
      sink.scoped(targetName, "hooks"),
    );
    resolved.set(targetName, { handlers, inputCount: survivingSources.size });
  }

  checkDuplicateRuns(run, plan, resolved);
  checkRejectedFiles(run, plan, resolved);

  const generatedFiles: GeneratedFile[] = [];
  for (const [targetName, { handlers, inputCount }] of resolved) {
    const hooksConfig = targets[targetName]?.hooks;
    if (!hooksConfig) continue;
    const transformed = hooksConfig.transform(handlers, {
      report: sink.scoped(targetName, "hooks"),
    });
    const hooksFormat = hooksConfig.format ?? "json";
    const content =
      hooksFormat === "toml"
        ? stringifyToml(transformed) + "\n"
        : JSON.stringify(transformed, null, 2) + "\n";

    generatedFiles.push({
      path: run.locator.hooksPath(targetName) ?? "",
      content,
      target: targetName,
      type: "hooks",
      sourcePath: hooksRelativePath,
      mergeKey: hooksConfig.mergeKey,
      mergeFormat: hooksFormat === "toml" ? "toml" : undefined,
      inputCount,
      consumers: plan.consumersOf(targetName, "hooks"),
    });
  }

  return generatedFiles;
}
