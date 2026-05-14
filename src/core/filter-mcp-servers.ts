import { resolveForTarget } from "./resolve-overrides.js";
import type { MCPConfig, UniversalMCPServer } from "../types.js";

interface FilterResult {
  servers: Record<string, UniversalMCPServer>;
  unknownNames: string[];
}

/**
 * Filter resolved MCP servers by the opt-in allow-list configured under `mcp`.
 *
 * When `forceOptIn` resolves to false (or is unset) for the target, returns the
 * input unchanged. When true, returns only the subset of `servers` whose names
 * appear in the resolved `mcpServers` list — an empty/missing list yields an
 * empty result (caller is responsible for skipping output emission).
 *
 * Names in the allow-list that don't match any discovered server are returned
 * via `unknownNames` so the caller can warn.
 */
export function filterMCPServers(
  servers: Record<string, UniversalMCPServer>,
  mcpConfig: MCPConfig,
  target: string,
): FilterResult {
  const forceOptIn =
    (resolveForTarget(mcpConfig.forceOptIn, target) as boolean | undefined) ?? false;
  if (!forceOptIn) return { servers, unknownNames: [] };

  const allowList = (resolveForTarget(mcpConfig.mcpServers, target) as string[] | undefined) ?? [];
  const known = new Set(Object.keys(servers));
  const unknownNames = allowList.filter((name) => !known.has(name));

  const filtered: Record<string, UniversalMCPServer> = {};
  for (const name of allowList) {
    const server = servers[name];
    if (server !== undefined) filtered[name] = server;
  }
  return { servers: filtered, unknownNames };
}
