import type { Target, PerTargetValue } from "../types.js";

const TARGET_KEYS: ReadonlySet<string> = new Set(["claude", "copilot", "cursor", "default"]);

type PerTargetObject<T> = Partial<Record<Target, T>> & { default?: T };

function isPerTargetObject<T>(value: PerTargetValue<T[]>): value is PerTargetObject<T[]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  return keys.every((k) => TARGET_KEYS.has(k));
}

function normalize<T>(value: PerTargetValue<T[]>): PerTargetObject<T[]> {
  if (Array.isArray(value)) return { default: value };
  if (isPerTargetObject(value)) return value;
  return { default: [] };
}

/**
 * Merge two `PerTargetValue<T[]>` values by concatenating arrays,
 * with `default` acting as a fallback for missing target keys.
 *
 * Useful in override config files to *add to* a base config field
 * instead of replacing it entirely.
 *
 * @example
 * ```ts
 * import { defineConfig, mergeField } from "universal-ai-config";
 * import base from "./universal-ai-config.config";
 *
 * export default defineConfig({
 *   exclude: mergeField(base.exclude, ["additional-pattern/**"]),
 * });
 * ```
 */
export function mergeField<T>(
  base: PerTargetValue<T[]> | undefined,
  override: PerTargetValue<T[]> | undefined,
): PerTargetValue<T[]> {
  if (base === undefined) return override ?? [];
  if (override === undefined) return base;

  const a = normalize(base);
  const b = normalize(override);

  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const result: Record<string, T[]> = {};

  for (const key of allKeys) {
    const effectiveA = (a as Record<string, T[]>)[key] ?? a.default ?? [];
    const effectiveB = (b as Record<string, T[]>)[key] ?? b.default ?? [];
    result[key] = [...effectiveA, ...effectiveB];
  }

  // Simplify: if only "default" key, return plain array
  const resultKeys = Object.keys(result);
  if (resultKeys.length === 1 && resultKeys[0] === "default") {
    return result["default"] ?? [];
  }

  return result as PerTargetObject<T[]>;
}
