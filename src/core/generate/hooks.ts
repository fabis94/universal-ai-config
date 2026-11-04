import { readFile } from "node:fs/promises";
import { posix } from "node:path";
import { toPosixPath } from "../plan/locate.js";
import { resolveJsonVariables } from "../resolve-json-variables.js";
import { resolveOverrides } from "../resolve-overrides.js";
import { stringifyToml } from "../toml.js";
import { targets } from "../../targets/index.js";
import type { Reporter } from "../diagnostics.js";
import type { GeneratedFile, HookHandlerType, Target, UniversalHookHandler } from "../../types.js";
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

/** Merge every `hooks/*.json`, resolve it per target and render each target's hooks file. */
export async function generateHooksFiles(run: GenerateRun): Promise<GeneratedFile[]> {
  const { root, config, sink, shadow } = run;
  const hookSlots = await discoverJsonFiles(root, config, "hooks");
  if (hookSlots.size === 0) return [];

  const generatedFiles: GeneratedFile[] = [];
  const hooksRelativePath = toPosixPath(posix.join(config.templatesDir, "hooks"));

  for (const targetName of config.targets) {
    const targetDef = targets[targetName];
    if (!targetDef?.hooks || !targetDef.supportedTypes.includes("hooks")) continue;

    // Resolve same-named files and drop excluded ones — both are per-target
    const filteredFiles = selectJsonFiles(hookSlots, "hooks", targetName, config, shadow);
    const mergedHooks = await mergeHookFiles(filteredFiles, config.variables);
    if (!mergedHooks) continue;

    const hooksConfig = targetDef.hooks;
    const survivingSources = new Set<DiscoveredJsonFile>();
    const report = sink.scoped(targetName, "hooks");
    const resolvedHooks = resolveHookHandlers(
      mergedHooks.hooks,
      targetName,
      hooksConfig.handlerTypes,
      mergedHooks.handlerSources,
      survivingSources,
      shadow,
      report,
    );
    const transformed = hooksConfig.transform(resolvedHooks, { report });
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
      inputCount: survivingSources.size,
    });
  }

  return generatedFiles;
}
