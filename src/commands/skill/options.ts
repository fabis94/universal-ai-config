import type { Option } from "@clack/prompts";
import type { DiscoveredSkill } from "../../core/skill-discovery.js";

/**
 * Build the clack multiselect option list from discovered skills. The skill name
 * is both the value and the label; the description (when present) becomes the hint
 * shown for the active option.
 */
export function buildSkillOptions(skills: DiscoveredSkill[]): Option<string>[] {
  return skills.map((skill) => ({
    value: skill.name,
    label: skill.name,
    ...(skill.description ? { hint: skill.description } : {}),
  }));
}
