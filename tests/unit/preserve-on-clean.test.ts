import { describe, it, expect } from "vitest";
import { createPreserveMatcher } from "../../src/core/preserve-on-clean.js";

describe("createPreserveMatcher", () => {
  it("matches nothing when undefined", () => {
    const isPreserved = createPreserveMatcher(undefined, "codex");
    expect(isPreserved("AGENTS.md")).toBe(false);
  });

  it("matches nothing when empty", () => {
    const isPreserved = createPreserveMatcher([], "codex");
    expect(isPreserved("AGENTS.md")).toBe(false);
  });

  it("matches an exact root-relative path", () => {
    const isPreserved = createPreserveMatcher(["AGENTS.md"], "codex");
    expect(isPreserved("AGENTS.md")).toBe(true);
    expect(isPreserved("packages/app/AGENTS.md")).toBe(false);
    expect(isPreserved(".agents/skills/x/SKILL.md")).toBe(false);
  });

  it("matches glob patterns", () => {
    const isPreserved = createPreserveMatcher([".claude/skills/manual/**"], "claude");
    expect(isPreserved(".claude/skills/manual/SKILL.md")).toBe(true);
    expect(isPreserved(".claude/skills/manual/refs/data.txt")).toBe(true);
    expect(isPreserved(".claude/skills/generated/SKILL.md")).toBe(false);
  });

  it("resolves per-target objects, falling back to default", () => {
    const preserve = {
      codex: ["AGENTS.md"],
      default: ["CLAUDE.md"],
    };
    expect(createPreserveMatcher(preserve, "codex")("AGENTS.md")).toBe(true);
    expect(createPreserveMatcher(preserve, "codex")("CLAUDE.md")).toBe(false);
    expect(createPreserveMatcher(preserve, "claude")("CLAUDE.md")).toBe(true);
    expect(createPreserveMatcher(preserve, "claude")("AGENTS.md")).toBe(false);
  });

  it("matches nothing for a target absent from a per-target object with no default", () => {
    const isPreserved = createPreserveMatcher({ codex: ["AGENTS.md"] }, "claude");
    expect(isPreserved("AGENTS.md")).toBe(false);
  });
});
