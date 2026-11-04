import { stringify as stringifyYAML } from "yaml";
import type { TemplateTypeConfig } from "../../targets/define-target.js";
import type { UniversalFrontmatter } from "../../types.js";

/** Transform universal frontmatter keys into a target's keys via its `frontmatterMap`. */
export function mapFrontmatter(
  universal: UniversalFrontmatter,
  typeConfig: Pick<TemplateTypeConfig, "frontmatterMap">,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [universalKey, mapper] of Object.entries(typeConfig.frontmatterMap)) {
    const value = (universal as Record<string, unknown>)[universalKey];
    if (value === undefined) continue;

    if (typeof mapper === "string") {
      result[mapper] = value;
    } else {
      Object.assign(result, mapper(value, universal));
    }
  }
  return result;
}

/** Serialize frontmatter as YAML, dropping undefined/null values. Empty string when nothing is left. */
function formatFrontmatter(data: Record<string, unknown>): string {
  const filteredData = Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined && value !== null),
  );
  if (Object.keys(filteredData).length === 0) return "";

  return stringifyYAML(filteredData, {
    // Quote strings for safety and explicitness - avoids YAML ambiguity
    defaultStringType: "QUOTE_DOUBLE",
    defaultKeyType: "PLAIN",
    indent: 2,
  }).trim();
}

/** Assemble a markdown file: `---` frontmatter block (when non-empty) followed by the body. */
export function renderMarkdown(frontmatter: Record<string, unknown>, body: string): string {
  const fmString = formatFrontmatter(frontmatter);
  if (fmString.length === 0) {
    return body.startsWith("\n") ? body.slice(1) : body;
  }
  return `---\n${fmString}\n---\n${body}`;
}
