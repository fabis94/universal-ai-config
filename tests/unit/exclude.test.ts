import { describe, it, expect } from "vitest";
import { createExcludeMatcher } from "../../src/core/exclude.js";

describe("createExcludeMatcher", () => {
  it("returns false for everything when patterns are empty", () => {
    const isExcluded = createExcludeMatcher([], "claude");
    expect(isExcluded("instructions/foo.md")).toBe(false);
    expect(isExcluded("agents/bar.md")).toBe(false);
  });

  it("matches exact file paths", () => {
    const isExcluded = createExcludeMatcher(["instructions/skip.md"], "claude");
    expect(isExcluded("instructions/skip.md")).toBe(true);
    expect(isExcluded("instructions/keep.md")).toBe(false);
  });

  it("matches glob patterns with **", () => {
    const isExcluded = createExcludeMatcher(["agents/**"], "claude");
    expect(isExcluded("agents/foo.md")).toBe(true);
    expect(isExcluded("agents/nested/bar.md")).toBe(true);
    expect(isExcluded("instructions/foo.md")).toBe(false);
  });

  it("matches glob patterns with *", () => {
    const isExcluded = createExcludeMatcher(["hooks/*.json"], "claude");
    expect(isExcluded("hooks/skip.json")).toBe(true);
    expect(isExcluded("hooks/nested/skip.json")).toBe(false);
  });

  it("resolves per-target patterns", () => {
    const patterns = {
      claude: ["instructions/claude-skip.md"],
      copilot: ["agents/**"],
      default: [] as string[],
    };

    const claudeMatcher = createExcludeMatcher(patterns, "claude");
    expect(claudeMatcher("instructions/claude-skip.md")).toBe(true);
    expect(claudeMatcher("agents/foo.md")).toBe(false);

    const copilotMatcher = createExcludeMatcher(patterns, "copilot");
    expect(copilotMatcher("agents/foo.md")).toBe(true);
    expect(copilotMatcher("instructions/claude-skip.md")).toBe(false);

    const cursorMatcher = createExcludeMatcher(patterns, "cursor");
    expect(cursorMatcher("instructions/claude-skip.md")).toBe(false);
    expect(cursorMatcher("agents/foo.md")).toBe(false);
  });

  it("falls back to default when target not specified", () => {
    const patterns = {
      claude: ["agents/**"],
      default: ["instructions/default-skip.md"],
    };

    const cursorMatcher = createExcludeMatcher(patterns, "cursor");
    expect(cursorMatcher("instructions/default-skip.md")).toBe(true);
    expect(cursorMatcher("agents/foo.md")).toBe(false);
  });

  it("excludes nothing when target not in object and no default", () => {
    const patterns = {
      claude: ["agents/**"],
    };

    const cursorMatcher = createExcludeMatcher(patterns, "cursor");
    expect(cursorMatcher("agents/foo.md")).toBe(false);
    expect(cursorMatcher("instructions/bar.md")).toBe(false);
  });

  it("supports multiple patterns", () => {
    const isExcluded = createExcludeMatcher(["instructions/skip-*.md", "agents/**"], "claude");
    expect(isExcluded("instructions/skip-this.md")).toBe(true);
    expect(isExcluded("instructions/keep-this.md")).toBe(false);
    expect(isExcluded("agents/foo.md")).toBe(true);
    expect(isExcluded("skills/bar/SKILL.md")).toBe(false);
  });
});
