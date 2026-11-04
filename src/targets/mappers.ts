import type { FrontmatterMapper } from "./define-target.js";

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
