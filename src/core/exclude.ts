import picomatch from "picomatch";
import { resolveForTarget } from "./resolve-overrides.js";
import type { PerTargetValue } from "../types.js";

/**
 * Creates a matcher function that tests template-relative paths against
 * the resolved exclude patterns for a given target.
 * Returns true if the path IS excluded.
 */
export function createExcludeMatcher(
  exclude: PerTargetValue<string[]>,
  target: string,
): (path: string) => boolean {
  const patterns = (resolveForTarget(exclude, target) as string[] | undefined) ?? [];
  if (patterns.length === 0) return () => false;
  return picomatch(patterns);
}
