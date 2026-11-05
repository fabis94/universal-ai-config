import { validateAgentsMdConfig } from "../core/agents-md/config.js";
import { sourcedTypes } from "../core/plan/standards.js";
import type { ResolvedConfig } from "../types.js";

/** Checks that need the merged config (and the project root); throws on the first problem. */
export function validateResolvedConfig(config: ResolvedConfig, root: string): void {
  // agentsMd only shapes generated AGENTS.md output: unused with instructions
  // off, or while the project writes its own AGENTS.md files
  const generatesAgentsMd =
    config.types.includes("instructions") && !sourcedTypes(config).has("instructions");
  if (generatesAgentsMd) validateAgentsMdConfig(config, root);
}
