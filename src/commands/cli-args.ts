import { DEFAULT_CONFIG } from "../config/defaults.js";
import { targets as registry } from "../targets/index.js";
import type { Target, TemplateType } from "../types.js";

const ALL_TYPES: readonly TemplateType[] = DEFAULT_CONFIG.types;

function parseList<T extends string>(value: string, kind: string, known: readonly string[]): T[] {
  const names = value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const unknown = names.find((name) => !known.includes(name));
  if (unknown !== undefined) {
    throw new Error(`Unknown ${kind} "${unknown}". Available: ${known.join(", ")}`);
  }
  return names as T[];
}

/** `--target`: comma-separated target names. */
export function parseTargets(value: string | undefined): Target[] | undefined {
  return value ? parseList<Target>(value, "target", Object.keys(registry)) : undefined;
}

/** `--type`: comma-separated template types, or `all` for every type. */
export function parseTypes(value: string | undefined): TemplateType[] | undefined {
  if (!value) return undefined;
  const names = parseList<TemplateType | "all">(value, "type", [...ALL_TYPES, "all"]);
  return names.includes("all") ? [...ALL_TYPES] : (names as TemplateType[]);
}
