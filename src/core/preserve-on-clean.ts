import picomatch from "picomatch";
import { resolveForTarget } from "./resolve-overrides.js";
import type { PerTargetValue } from "../types.js";

/**
 * Creates a matcher that tests root-relative **output** paths against the
 * resolved `preserveOnClean` patterns for a given target.
 * Returns true if the path must NOT be deleted.
 *
 * The mirror image of `createExcludeMatcher`, which matches template *input*
 * paths — the two configs look alike but operate on opposite ends of the
 * pipeline.
 */
export function createPreserveMatcher(
  preserveOnClean: PerTargetValue<string[]> | undefined,
  target: string,
): (path: string) => boolean {
  if (preserveOnClean === undefined) return () => false;
  const patterns = (resolveForTarget(preserveOnClean, target) as string[] | undefined) ?? [];
  if (patterns.length === 0) return () => false;
  return picomatch(patterns);
}
