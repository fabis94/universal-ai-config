/**
 * Normalize globs input to a string array.
 * Accepts single strings, comma-separated strings, or arrays of strings.
 * Comma-separated strings are split into individual patterns.
 */
export function normalizeGlobs(value: unknown): string[] {
  if (Array.isArray(value)) {
    // Flatten array and split any comma-separated strings
    return value.flatMap((item) => {
      if (typeof item === "string") {
        return item
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
      return [];
    });
  }

  if (typeof value === "string") {
    // Split comma-separated string
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return [];
}
