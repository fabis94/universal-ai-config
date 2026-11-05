import type { DiscoveredSkill } from "../../core/skill-discovery.js";
import type { Choice } from "../interactive.js";

/**
 * Build the multiselect option list from discovered skills. The skill name
 * is both the value and the label; the hint shows the source path (so the user can
 * tell which copy will be taken) followed by the description when present.
 */
export function buildSkillOptions(skills: DiscoveredSkill[]): Choice<string>[] {
  return skills.map((skill) => {
    const hint = skill.description ? `${skill.relPath} — ${skill.description}` : skill.relPath;
    return {
      value: skill.name,
      label: skill.name,
      hint,
    };
  });
}
