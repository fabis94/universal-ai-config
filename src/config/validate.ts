import { validateAgentsMdConfig } from "../core/agents-md/config.js";
import type { ResolvedConfig } from "../types.js";

/** Checks that need the merged config (and the project root); throws on the first problem. */
export function validateResolvedConfig(config: ResolvedConfig, root: string): void {
  // agentsMd only shapes instruction output; with instructions off it's unused
  if (config.types.includes("instructions")) validateAgentsMdConfig(config, root);
}
