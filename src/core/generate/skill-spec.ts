import type { Reporter } from "../diagnostics.js";
import type { UniversalFrontmatter } from "../../types.js";

/** Agent Skills spec limits (agentskills.io/specification). */
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;
const MAX_COMPATIBILITY = 500;
/** Lowercase letters, digits and single hyphens, not at either end. */
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Check a skill against the Agent Skills spec. Codex rejects names over 64
 * characters, and Codex and Cursor break on a missing description, so these
 * warn at generate time instead of failing silently in the tool.
 *
 * @param folder the skill's folder name, which the spec requires `name` to match
 */
export function checkSkillSpec(
  folder: string,
  frontmatter: UniversalFrontmatter,
  source: string,
  report: Reporter,
): void {
  const warn = (field: string, problem: string): void =>
    report({
      code: "skill-spec",
      source,
      message: `skill "${folder}": ${problem} (Agent Skills spec)`,
      detail: { skill: folder, field },
    });

  const name = frontmatter.name ?? folder;
  if (name.length === 0 || name.length > MAX_NAME) {
    warn("name", `name must be 1–${MAX_NAME} characters, got ${name.length}`);
  }
  if (!NAME_PATTERN.test(name)) {
    warn("name", `name "${name}" must use only lowercase letters, digits and single hyphens`);
  }
  if (name !== folder) {
    warn("name", `name "${name}" must match the skill's folder name "${folder}"`);
  }

  const description = typeof frontmatter.description === "string" ? frontmatter.description : "";
  if (description.trim() === "") {
    warn("description", "description is required");
  } else if (description.length > MAX_DESCRIPTION) {
    warn("description", `description must be at most ${MAX_DESCRIPTION} characters`);
  }

  if (
    typeof frontmatter.compatibility === "string" &&
    frontmatter.compatibility.length > MAX_COMPATIBILITY
  ) {
    warn("compatibility", `compatibility must be at most ${MAX_COMPATIBILITY} characters`);
  }

  const { metadata } = frontmatter;
  if (metadata !== undefined) {
    const valid =
      metadata !== null &&
      typeof metadata === "object" &&
      !Array.isArray(metadata) &&
      Object.values(metadata).every((value) => typeof value === "string");
    if (!valid) warn("metadata", "metadata must map keys to string values");
  }
}
