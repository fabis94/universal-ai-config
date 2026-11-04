import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { filterMCPServers } from "../filter-mcp-servers.js";
import { resolveJsonVariables } from "../resolve-json-variables.js";
import { resolveOverrides } from "../resolve-overrides.js";
import { stringifyToml } from "../toml.js";
import { targets } from "../../targets/index.js";
import type { GeneratedFile, Target, UniversalMCPInput, UniversalMCPServer } from "../../types.js";
import type { GenerateRun } from "./context.js";
import { discoverJsonFiles, type DiscoveredJsonFile } from "./discover.js";
import { selectJsonFiles, type ShadowReporter } from "./select.js";
import { stableStringify } from "./stable-stringify.js";

interface MergedMCPData {
  servers: Record<string, Record<string, unknown>>;
  inputs: UniversalMCPInput[];
  /** server name → the file whose declaration won (first-wins) */
  serverSources: Map<string, DiscoveredJsonFile>;
  /** files that contributed at least one surviving entry to `inputs` */
  inputSources: Set<DiscoveredJsonFile>;
}

/**
 * Merge every `mcp/*.json` that survived file-level selection.
 *
 * Servers are keyed by name and inputs by `id`, and the **first** declaration
 * wins — same rule as every other template type, so a shared dir can never
 * silently override a server the project declared itself.
 */
async function mergeMCPFiles(
  files: DiscoveredJsonFile[],
  variables: Record<string, unknown>,
  targetName: Target,
  shadow: ShadowReporter,
): Promise<MergedMCPData | null> {
  if (files.length === 0) return null;

  const servers: Record<string, Record<string, unknown>> = {};
  const inputs: UniversalMCPInput[] = [];
  const serverSources = new Map<string, DiscoveredJsonFile>();
  const inputSources = new Set<DiscoveredJsonFile>();
  const inputSourceById = new Map<string, DiscoveredJsonFile>();

  for (const file of files) {
    const rawParsed = JSON.parse(await readFile(file.filePath, "utf-8"));
    const parsed = resolveJsonVariables(rawParsed, variables) as {
      mcpServers?: Record<string, Record<string, unknown>>;
      inputs?: UniversalMCPInput[];
    };

    for (const [name, serverConfig] of Object.entries(parsed.mcpServers ?? {})) {
      const winner = serverSources.get(name);
      if (winner) {
        shadow({
          target: targetName,
          type: "mcp",
          scope: "server",
          name,
          losingPath: file.displayPath,
          winningPath: winner.displayPath,
          losingSource: file.sourceId,
          winningSource: winner.sourceId,
        });
        continue;
      }
      servers[name] = serverConfig;
      serverSources.set(name, file);
    }

    for (const input of parsed.inputs ?? []) {
      // `id` is required by the schema, but these files are untyped at runtime —
      // fall back to comparing the whole declaration.
      const key = typeof input?.id === "string" ? input.id : stableStringify(input);
      const winner = inputSourceById.get(key);
      if (winner) {
        shadow({
          target: targetName,
          type: "mcp",
          scope: "input",
          name: key,
          losingPath: file.displayPath,
          winningPath: winner.displayPath,
          losingSource: file.sourceId,
          winningSource: winner.sourceId,
        });
        continue;
      }
      inputSourceById.set(key, file);
      inputs.push(input);
      inputSources.add(file);
    }
  }

  return Object.keys(servers).length > 0 ? { servers, inputs, serverSources, inputSources } : null;
}

function resolveMCPServers(
  servers: Record<string, Record<string, unknown>>,
  target: Target,
): Record<string, UniversalMCPServer> {
  const result: Record<string, UniversalMCPServer> = {};
  for (const [name, serverConfig] of Object.entries(servers)) {
    const resolved = resolveOverrides(serverConfig, target);
    // Drop server if neither command nor url is present
    if (!resolved.command && !resolved.url) continue;
    result[name] = resolved as unknown as UniversalMCPServer;
  }
  return result;
}

/** Merge every `mcp/*.json`, resolve it per target and render each target's MCP config. */
export async function generateMCPFiles(run: GenerateRun): Promise<GeneratedFile[]> {
  const { root, config, sink, shadow } = run;
  const mcpSlots = await discoverJsonFiles(root, config, "mcp");
  if (mcpSlots.size === 0) return [];

  const generatedFiles: GeneratedFile[] = [];
  const mcpRelativePath = join(config.templatesDir, "mcp");

  for (const targetName of config.targets) {
    const targetDef = targets[targetName];
    if (!targetDef?.mcp || !targetDef.supportedTypes.includes("mcp")) continue;

    // Resolve same-named files and drop excluded ones — both are per-target
    const filteredFiles = selectJsonFiles(mcpSlots, "mcp", targetName, config, shadow);
    const mergedData = await mergeMCPFiles(filteredFiles, config.variables, targetName, shadow);
    if (!mergedData) continue;

    const mcpConfig = targetDef.mcp;
    const resolvedServers = resolveMCPServers(mergedData.servers, targetName);

    const { servers: finalServers, unknownNames } = filterMCPServers(
      resolvedServers,
      config.mcp,
      targetName,
    );
    if (unknownNames.length > 0) {
      const known = Object.keys(resolvedServers).join(", ") || "(none)";
      sink.report({
        code: "mcp-unknown-server",
        target: targetName,
        type: "mcp",
        message: `mcp.mcpServers references unknown server name(s): ${unknownNames.join(", ")}. Known: ${known}`,
        detail: { names: unknownNames, known: Object.keys(resolvedServers) },
      });
    }
    if (Object.keys(finalServers).length === 0) continue;

    const transformed = mcpConfig.transform(finalServers, mergedData.inputs, {
      report: sink.scoped(targetName, "mcp"),
    });

    const survivingSources = new Set<DiscoveredJsonFile>();
    for (const name of Object.keys(finalServers)) {
      const src = mergedData.serverSources.get(name);
      if (src) survivingSources.add(src);
    }
    // Files contributing only Copilot `inputs` count only when the transform actually emits them
    const emittedInputs = (transformed as { inputs?: unknown[] }).inputs;
    if (Array.isArray(emittedInputs) && emittedInputs.length > 0) {
      for (const src of mergedData.inputSources) survivingSources.add(src);
    }

    const mcpFormat = mcpConfig.format ?? "json";
    const content =
      mcpFormat === "toml"
        ? stringifyToml(transformed) + "\n"
        : JSON.stringify(transformed, null, 2) + "\n";

    generatedFiles.push({
      path: mcpConfig.outputPath,
      content,
      target: targetName,
      type: "mcp",
      sourcePath: mcpRelativePath,
      mergeKey: mcpConfig.mergeKey,
      mergeFormat: mcpFormat === "toml" ? "toml" : undefined,
      inputCount: survivingSources.size,
    });
  }

  return generatedFiles;
}
