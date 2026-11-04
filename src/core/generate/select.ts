import { createExcludeMatcher } from "../exclude.js";
import type { ResolvedConfig, ShadowEvent, Target } from "../../types.js";
import type { DiscoveredJsonFile, JsonSlot, TemplateSlot } from "./discover.js";

/** Reports a candidate that lost a name collision. */
export type ShadowReporter = (event: ShadowEvent) => void;

/**
 * Pick the first candidate `exclude` didn't remove, and report every
 * non-excluded candidate behind it as shadowed.
 *
 * Candidates *ahead* of the winner were removed by `exclude` — the user asked
 * for that, so they stay silent. Only precedence losers are reported.
 */
function selectWinner<T extends { excludePaths: string[]; displayPath: string }>(
  candidates: T[],
  isExcluded: (path: string) => boolean,
  onShadowed: (loser: T, winner: T) => void,
): T | undefined {
  const kept = candidates.filter((c) => !c.excludePaths.some((p) => isExcluded(p)));
  const [winner, ...losers] = kept;
  if (!winner) return undefined;
  for (const loser of losers) onShadowed(loser, winner);
  return winner;
}

/**
 * Resolve every name collision, per target: the first candidate `exclude`
 * didn't remove wins, everything behind it is shadowed. This is per-target
 * because `exclude` is — excluding the winner for one target promotes the
 * runner-up for that target alone.
 */
export function resolveWinners(
  slots: Map<string, TemplateSlot>,
  targetNames: Target[],
  config: ResolvedConfig,
  report: ShadowReporter,
): void {
  for (const targetName of targetNames) {
    const isExcluded = createExcludeMatcher(config.exclude, targetName);
    for (const slot of slots.values()) {
      const winner = selectWinner(slot.candidates, isExcluded, (loser, won) =>
        report({
          target: targetName,
          type: slot.type,
          scope: "template",
          name: slot.name,
          losingPath: loser.displayPath,
          winningPath: won.displayPath,
          losingSource: loser.sourceId,
          winningSource: won.sourceId,
        }),
      );
      slot.winnerByTarget.set(targetName, winner);
    }
  }
}

/** Resolve each basename slot to its winning file for one target, reporting shadowed copies. */
export function selectJsonFiles(
  slots: Map<string, JsonSlot>,
  type: "hooks" | "mcp",
  targetName: Target,
  config: ResolvedConfig,
  report: ShadowReporter,
): DiscoveredJsonFile[] {
  const isExcluded = createExcludeMatcher(config.exclude, targetName);
  const selected: DiscoveredJsonFile[] = [];
  for (const slot of slots.values()) {
    const winner = selectWinner(slot.candidates, isExcluded, (loser, won) =>
      report({
        target: targetName,
        type,
        scope: "file",
        name: slot.name,
        losingPath: loser.displayPath,
        winningPath: won.displayPath,
        losingSource: loser.sourceId,
        winningSource: won.sourceId,
      }),
    );
    if (winner) selected.push(winner);
  }
  return selected;
}
