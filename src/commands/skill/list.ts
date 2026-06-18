import pc from "picocolors";
import type { DiscoveredSkill } from "../../core/skill-discovery.js";

/**
 * Format a discovered-skill list for `skill add --list` as plain stdout output
 * (not via the consola logger, which prefixes timestamps). Each skill renders on
 * its own line with the name highlighted and the description dimmed underneath, so
 * names stay scannable even when descriptions are long.
 */
export function formatSkillList(skills: DiscoveredSkill[]): string {
  const header = `Found ${skills.length} skill${skills.length === 1 ? "" : "s"}:`;
  const entries = skills.map((skill) => {
    const name = `  ${pc.bold(pc.cyan(skill.name))}`;
    return skill.description ? `${name}\n      ${pc.dim(skill.description)}` : name;
  });
  return [header, "", ...entries].join("\n");
}
