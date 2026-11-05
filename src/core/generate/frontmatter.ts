import { stringify as stringifyYAML } from "yaml";
import type {
  FrontmatterStyle,
  TargetContext,
  TemplateTypeConfig,
} from "../../targets/define-target.js";
import type { UniversalFrontmatter } from "../../types.js";

/** Transform universal frontmatter keys into a target's keys via its `frontmatterMap`. */
export function mapFrontmatter(
  universal: UniversalFrontmatter,
  typeConfig: Pick<TemplateTypeConfig, "frontmatterMap">,
  ctx: TargetContext = { report: () => {} },
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [universalKey, mapper] of Object.entries(typeConfig.frontmatterMap)) {
    const value = (universal as Record<string, unknown>)[universalKey];
    if (value === undefined) continue;

    if (typeof mapper === "string") {
      result[mapper] = value;
    } else {
      Object.assign(result, mapper(value, universal, ctx));
    }
  }
  return result;
}

const YAML_OPTIONS = {
  // Quote strings for safety and explicitness - avoids YAML ambiguity
  defaultStringType: "QUOTE_DOUBLE",
  defaultKeyType: "PLAIN",
  indent: 2,
} as const;

function present(data: Record<string, unknown>): [string, unknown][] {
  return Object.entries(data).filter(([, value]) => value !== undefined && value !== null);
}

/** Keys a line-safe file writes as a `A, B` list (Claude and Cursor both accept that form). */
const COMMA_LIST_KEYS = new Set(["tools", "disallowedTools"]);

/** Strings YAML would read as something other than the same string. */
const YAML_NON_STRING = /^(?:true|false|yes|no|on|off|y|n|null|~|[-+]?\.?\d.*|\.(?:inf|nan))$/i;

/**
 * Whether `value` reads back as itself both as a YAML plain scalar and when a
 * line-based parser keeps everything after the first `:`.
 */
function isPlainSafe(value: string): boolean {
  if (value === "" || value !== value.trim()) return false;
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(value)) return false;
  if (/: |:$| #|\t/.test(value)) return false;
  return !YAML_NON_STRING.test(value);
}

function lineSafeScalar(value: string): string {
  const folded = value.replace(/\s*\n\s*/g, " ").trim();
  // A value YAML can't hold unquoted stays quoted: correct for YAML parsers,
  // and line parsers then see the quotes — the lesser evil.
  return isPlainSafe(folded) ? folded : JSON.stringify(folded);
}

/**
 * One `key: value` line per scalar, for files that line-based parsers read too
 * (Cursor splits each line at the first `:`). Nested values fall back to YAML
 * blocks; those keys are ones line parsers don't read.
 */
function formatLineSafe(entries: [string, unknown][]): string {
  const lines: string[] = [];
  for (const [key, value] of entries) {
    if (typeof value === "string") {
      lines.push(`${key}: ${lineSafeScalar(value)}`);
    } else if (typeof value === "number" || typeof value === "boolean") {
      lines.push(`${key}: ${String(value)}`);
    } else if (
      COMMA_LIST_KEYS.has(key) &&
      Array.isArray(value) &&
      value.every((item): item is string => typeof item === "string")
    ) {
      lines.push(`${key}: ${lineSafeScalar(value.join(", "))}`);
    } else {
      lines.push(stringifyYAML({ [key]: value }, YAML_OPTIONS).trimEnd());
    }
  }
  return lines.join("\n");
}

/** Serialize frontmatter, dropping undefined/null values. Empty string when nothing is left. */
function formatFrontmatter(data: Record<string, unknown>, style: FrontmatterStyle): string {
  const entries = present(data);
  if (entries.length === 0) return "";
  if (style === "line-safe") return formatLineSafe(entries);
  return stringifyYAML(Object.fromEntries(entries), YAML_OPTIONS).trim();
}

/** Assemble a markdown file: `---` frontmatter block (when non-empty) followed by the body. */
export function renderMarkdown(
  frontmatter: Record<string, unknown>,
  body: string,
  style: FrontmatterStyle = "yaml",
): string {
  const fmString = formatFrontmatter(frontmatter, style);
  if (fmString.length === 0) {
    return body.startsWith("\n") ? body.slice(1) : body;
  }
  return `---\n${fmString}\n---\n${body}`;
}
