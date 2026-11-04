import { expect } from "vitest";

/**
 * Helper to check for YAML field regardless of quoting style.
 * Matches: key: value OR key: "value" OR key: 'value'
 */
export function expectYamlField(content: string, key: string, value: string) {
  // Escape special regex characters in the value
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`${key}:\\s*["']?${escapedValue}["']?`);
  expect(content).toMatch(regex);
}

/** A generated file's content as UTF-8 text, whether it was emitted as a string or as bytes. */
export function text(file: { content: string | Uint8Array } | undefined): string {
  if (!file) throw new Error("expected a generated file, got undefined");
  return typeof file.content === "string"
    ? file.content
    : Buffer.from(file.content).toString("utf-8");
}
