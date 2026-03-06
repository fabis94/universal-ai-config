import { describe, it, expect } from "vitest";
import { mergeField } from "../../src/config/merge-field.js";

describe("mergeField", () => {
  it("concatenates two plain arrays", () => {
    expect(mergeField(["a", "b"], ["c"])).toEqual(["a", "b", "c"]);
  });

  it("returns empty array when both undefined", () => {
    expect(mergeField(undefined, undefined)).toEqual([]);
  });

  it("returns override when base is undefined", () => {
    expect(mergeField(undefined, ["b"])).toEqual(["b"]);
  });

  it("returns base when override is undefined", () => {
    expect(mergeField(["a"], undefined)).toEqual(["a"]);
  });

  it("returns empty array when both are empty arrays", () => {
    expect(mergeField([], [])).toEqual([]);
  });

  it("merges per-target objects with same keys", () => {
    expect(mergeField({ claude: ["a"] }, { claude: ["b"] })).toEqual({
      claude: ["a", "b"],
    });
  });

  it("merges per-target objects with different keys", () => {
    expect(mergeField({ claude: ["a"] }, { copilot: ["b"] })).toEqual({
      claude: ["a"],
      copilot: ["b"],
    });
  });

  it("uses default as fallback for missing target keys", () => {
    expect(mergeField({ claude: ["a"], default: ["x"] }, { copilot: ["b"] })).toEqual({
      claude: ["a"],
      copilot: ["x", "b"],
      default: ["x"],
    });
  });

  it("merges array + per-target object (array becomes default)", () => {
    expect(mergeField(["a"], { claude: ["b"] })).toEqual({
      claude: ["a", "b"],
      default: ["a"],
    });
  });

  it("merges per-target object + array (array becomes default)", () => {
    expect(mergeField({ claude: ["a"] }, ["b"])).toEqual({
      claude: ["a", "b"],
      default: ["b"],
    });
  });

  it("merges defaults from both sides", () => {
    expect(mergeField({ default: ["a"] }, { default: ["b"], claude: ["c"] })).toEqual({
      default: ["a", "b"],
      claude: ["a", "c"],
    });
  });

  it("simplifies result with only default key to plain array", () => {
    expect(mergeField({ default: ["a"] }, { default: ["b"] })).toEqual(["a", "b"]);
  });

  it("returns per-target override as-is when base is undefined", () => {
    expect(mergeField(undefined, { claude: ["a"], default: ["b"] })).toEqual({
      claude: ["a"],
      default: ["b"],
    });
  });

  it("returns per-target base as-is when override is undefined", () => {
    expect(mergeField({ claude: ["a"], default: ["b"] }, undefined)).toEqual({
      claude: ["a"],
      default: ["b"],
    });
  });

  it("handles all three targets with defaults", () => {
    expect(
      mergeField({ default: ["base"] }, { claude: ["c"], copilot: ["co"], cursor: ["cu"] }),
    ).toEqual({
      claude: ["base", "c"],
      copilot: ["base", "co"],
      cursor: ["base", "cu"],
      default: ["base"],
    });
  });
});
