import { describe, it, expect } from "vitest";
import { resolveForTarget, resolveOverrides } from "../../src/core/resolve-overrides.js";

describe("resolveForTarget", () => {
  it("passes through plain string values", () => {
    expect(resolveForTarget("hello", "claude")).toBe("hello");
  });

  it("passes through plain number values", () => {
    expect(resolveForTarget(42, "claude")).toBe(42);
  });

  it("passes through plain boolean values", () => {
    expect(resolveForTarget(true, "cursor")).toBe(true);
  });

  it("passes through arrays", () => {
    const arr = ["a", "b"];
    expect(resolveForTarget(arr, "claude")).toBe(arr);
  });

  it("resolves per-target object for matching target", () => {
    const value = { claude: "Claude value", copilot: "Copilot value" };
    expect(resolveForTarget(value, "claude")).toBe("Claude value");
    expect(resolveForTarget(value, "copilot")).toBe("Copilot value");
  });

  it("returns undefined for missing target without default", () => {
    const value = { claude: "only claude" };
    expect(resolveForTarget(value, "cursor")).toBeUndefined();
  });

  it("falls back to default when target is missing", () => {
    const value = { default: "fallback", claude: "Claude value" };
    expect(resolveForTarget(value, "claude")).toBe("Claude value");
    expect(resolveForTarget(value, "cursor")).toBe("fallback");
    expect(resolveForTarget(value, "copilot")).toBe("fallback");
  });

  it("treats default-only object as per-target override", () => {
    const value = { default: ["a", "b"] };
    expect(resolveForTarget(value, "claude")).toEqual(["a", "b"]);
    expect(resolveForTarget(value, "cursor")).toEqual(["a", "b"]);
  });

  it("resolves per-target arrays", () => {
    const value = {
      claude: ["Read", "Grep"],
      copilot: ["read", "grep"],
    };
    expect(resolveForTarget(value, "claude")).toEqual(["Read", "Grep"]);
    expect(resolveForTarget(value, "copilot")).toEqual(["read", "grep"]);
  });

  it("does not treat objects with non-target keys as overrides", () => {
    const value = { category: "devops", priority: "high" };
    expect(resolveForTarget(value, "claude")).toBe(value);
  });

  it("does not treat objects with mixed target/non-target keys as overrides", () => {
    const value = { claude: "foo", other: "bar" };
    expect(resolveForTarget(value, "claude")).toBe(value);
  });

  it("does not treat empty objects as overrides", () => {
    const value = {};
    expect(resolveForTarget(value, "claude")).toBe(value);
  });

  it("does not treat null as an override", () => {
    expect(resolveForTarget(null, "claude")).toBeNull();
  });
});

describe("resolveOverrides", () => {
  it("resolves mixed plain and per-target fields", () => {
    const obj = {
      name: "test",
      description: { claude: "Claude desc", copilot: "Copilot desc" },
      tools: { claude: ["Read"], copilot: ["read"] },
      model: "sonnet",
    };

    const claude = resolveOverrides(obj, "claude");
    expect(claude).toEqual({
      name: "test",
      description: "Claude desc",
      tools: ["Read"],
      model: "sonnet",
    });

    const copilot = resolveOverrides(obj, "copilot");
    expect(copilot).toEqual({
      name: "test",
      description: "Copilot desc",
      tools: ["read"],
      model: "sonnet",
    });
  });

  it("uses default fallback for missing targets", () => {
    const obj = {
      name: "test",
      tools: { default: ["read"], claude: ["Read"] },
    };

    expect(resolveOverrides(obj, "claude")).toEqual({ name: "test", tools: ["Read"] });
    expect(resolveOverrides(obj, "copilot")).toEqual({ name: "test", tools: ["read"] });
    expect(resolveOverrides(obj, "cursor")).toEqual({ name: "test", tools: ["read"] });
  });

  it("drops fields when target is not in per-target object", () => {
    const obj = {
      name: "test",
      permissionMode: { claude: "acceptEdits" },
    };

    const cursor = resolveOverrides(obj, "cursor");
    expect(cursor).toEqual({ name: "test" });
    expect(cursor).not.toHaveProperty("permissionMode");
  });

  it("drops undefined values", () => {
    const obj = { name: "test", description: undefined };
    expect(resolveOverrides(obj, "claude")).toEqual({ name: "test" });
  });

  it("preserves non-target objects as-is", () => {
    const metadata = { category: "devops", priority: "high" };
    const obj = { name: "test", metadata };
    const result = resolveOverrides(obj, "claude");
    expect(result.metadata).toBe(metadata);
  });
});
