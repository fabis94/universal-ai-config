import type { FrontmatterMapper, TargetContext } from "./define-target.js";

/**
 * Map a field the tools accept only as a boolean (`user-invocable`). Any
 * other value is dropped with a warning instead of being written out for the
 * tool to misread.
 */
export function booleanField(key: string): FrontmatterMapper {
  return (value, _fm, { report }) => {
    if (typeof value === "boolean") return { [key]: value };
    report({
      code: "suspicious-value",
      message: `${key} must be true or false, got ${JSON.stringify(value)}; dropped`,
      detail: { field: key, value },
    });
    return {};
  };
}

/**
 * Warn when a tool-event hook matcher names a Claude tool the target calls
 * something else (a universal `matcher: "Bash"` never fires in Cursor, whose
 * shell tool is `Shell`). The matcher is written as given: the fix is a
 * per-target override, which the warning spells out.
 *
 * @param names Claude tool name → this target's name for the same tool
 */
export function checkMatcherToolNames(
  targetLabel: string,
  event: string,
  matcher: string | undefined,
  names: Readonly<Record<string, string>>,
  report: TargetContext["report"],
): void {
  if (!matcher) return;
  const misnamed = matcher
    .split(/[|,]/)
    .map((token) => token.trim())
    .filter((token) => names[token] !== undefined);
  const [first] = misnamed;
  if (first === undefined) return;
  const renamed = misnamed.map((token) => `${token} → ${names[token]}`).join(", ");
  report({
    code: "suspicious-value",
    message:
      `${event} matcher "${matcher}" uses Claude tool names, which never match in ${targetLabel} (${renamed}). ` +
      `Give the matcher per-target values, e.g. matcher: { claude: "${first}", ${targetLabel.toLowerCase()}: "${names[first]}" }`,
    detail: { field: "matcher", value: matcher },
  });
}
