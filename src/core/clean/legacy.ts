import type { Target } from "../../types.js";
import type { CleanEntry } from "./entries.js";

/**
 * Outputs older uac versions wrote that the current targets no longer do.
 * Clean keeps removing them, so `uac generate --clean` after an upgrade
 * leaves no stale config behind. (Legacy AGENTS.override.md files are found
 * by the AGENTS.md scan.)
 */
const LEGACY_ENTRIES: Partial<Record<Target, CleanEntry[]>> = {
  // uac 2.x wrote Copilot's MCP servers to VS Code's legacy file
  copilot: [{ kind: "path", type: "mcp", path: ".vscode/mcp.json" }],
};

export function legacyEntries(target: Target): CleanEntry[] {
  return LEGACY_ENTRIES[target] ?? [];
}
