import type { TargetDefinition } from "./define-target.js";
import claude from "./claude/index.js";
import copilot from "./copilot/index.js";
import cursor from "./cursor/index.js";

export const targets: Record<string, TargetDefinition> = { claude, copilot, cursor };
