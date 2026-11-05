import { expect } from "vitest";
import type { DiagnosticInput } from "../src/core/diagnostics.js";

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

/** A target context whose `report` collects diagnostics into `diagnostics`. */
export function collectingContext(): {
  ctx: { report: (d: DiagnosticInput) => void };
  diagnostics: DiagnosticInput[];
} {
  const diagnostics: DiagnosticInput[] = [];
  return { ctx: { report: (d) => diagnostics.push(d) }, diagnostics };
}
