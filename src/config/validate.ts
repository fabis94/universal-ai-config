import { validateAgentsMdConfig } from "../core/agents-md/config.js";
import type { ResolvedConfig } from "../types.js";

/** Checks that need the merged config (and the project root); throws on the first problem. */
export function validateResolvedConfig(config: ResolvedConfig, root: string): void {
  validateAgentsMdConfig(config, root);
}
