import { describe, it, expect } from "vitest";
import { normalizeGlobs } from "../../src/core/normalize-globs.js";

describe("normalizeGlobs", () => {
  it("handles single string pattern", () => {
    expect(normalizeGlobs("**/*.ts")).toEqual(["**/*.ts"]);
  });

  it("splits comma-separated string patterns", () => {
    expect(normalizeGlobs("**/*.ts,**/*.tsx")).toEqual(["**/*.ts", "**/*.tsx"]);
  });

  it("trims whitespace from split patterns", () => {
    expect(normalizeGlobs("**/*.ts, **/*.tsx, **/*.js")).toEqual([
      "**/*.ts",
      "**/*.tsx",
      "**/*.js",
    ]);
  });

  it("handles array of strings", () => {
    expect(normalizeGlobs(["**/*.ts", "**/*.tsx"])).toEqual(["**/*.ts", "**/*.tsx"]);
  });

  it("splits comma-separated strings within arrays", () => {
    expect(normalizeGlobs(["**/*.ts,**/*.tsx", "**/*.js"])).toEqual([
      "**/*.ts",
      "**/*.tsx",
      "**/*.js",
    ]);
  });

  it("handles mixed array with single and comma-separated patterns", () => {
    expect(normalizeGlobs(["**/*.ts", "**/*.tsx,**/*.jsx", "**/*.js"])).toEqual([
      "**/*.ts",
      "**/*.tsx",
      "**/*.jsx",
      "**/*.js",
    ]);
  });

  it("filters out empty strings after splitting", () => {
    expect(normalizeGlobs("**/*.ts,,**/*.tsx")).toEqual(["**/*.ts", "**/*.tsx"]);
  });

  it("handles empty string", () => {
    expect(normalizeGlobs("")).toEqual([]);
  });

  it("handles empty array", () => {
    expect(normalizeGlobs([])).toEqual([]);
  });

  it("handles undefined", () => {
    expect(normalizeGlobs(undefined)).toEqual([]);
  });

  it("handles null", () => {
    expect(normalizeGlobs(null)).toEqual([]);
  });

  it("handles non-string, non-array values", () => {
    expect(normalizeGlobs(123)).toEqual([]);
    expect(normalizeGlobs({ pattern: "**/*.ts" })).toEqual([]);
  });

  it("handles array with non-string elements", () => {
    expect(normalizeGlobs(["**/*.ts", 123, null, "**/*.tsx"])).toEqual(["**/*.ts", "**/*.tsx"]);
  });
});
