/**
 * Split a comma-separated glob list at top-level commas only, so a brace
 * pattern like `src/{a,b}/**` stays one glob.
 */
function splitGlobList(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "{") depth++;
    else if (char === "}" && depth > 0) depth--;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map((s) => s.trim()).filter(Boolean);
}

/**
 * Normalize globs input to a string array.
 * Accepts single strings, comma-separated strings, or arrays of strings.
 * Comma-separated strings are split into individual patterns (commas inside
 * `{…}` belong to the pattern).
 */
export function normalizeGlobs(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => (typeof item === "string" ? splitGlobList(item) : []));
  }
  if (typeof value === "string") return splitGlobList(value);
  return [];
}
