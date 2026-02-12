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
