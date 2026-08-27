import picomatch from "picomatch";
import { resolveForTarget } from "./resolve-overrides.js";
import type { PerTargetValue } from "../types.js";

/** Strip a leading `./` so `"./shared/x.md"` and `"shared/x.md"` are the same pattern. */
function normalizePattern(pattern: string): string {
  let p = pattern;
  while (p.startsWith("./")) p = p.slice(2);
  return p;
}

/**
 * Creates a matcher function that tests template-relative paths against
 * the resolved exclude patterns for a given target.
 * Returns true if the path IS excluded.
 *
 * `dot: true` because the default `templatesDir` is `.universal-ai-config`:
 * without it a wildcard in a source-qualified pattern (`**\/instructions/foo.md`,
 * `*\/mcp/servers.json`) would silently never match the main dir's candidates,
 * since picomatch won't let `*` cross a dot-leading segment.
 */
export function createExcludeMatcher(
  exclude: PerTargetValue<string[]>,
  target: string,
): (path: string) => boolean {
  const patterns = ((resolveForTarget(exclude, target) as string[] | undefined) ?? []).map(
    normalizePattern,
  );
  if (patterns.length === 0) return () => false;
  return picomatch(patterns, { dot: true });
}
