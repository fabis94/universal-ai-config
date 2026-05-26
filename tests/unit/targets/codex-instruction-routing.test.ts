import { describe, it, expect } from "vitest";
import { getCodexInstructionEmissionPaths } from "../../../src/targets/codex/instruction-routing.js";
import type { UniversalFrontmatter } from "../../../src/types.js";

function fm(input: Partial<UniversalFrontmatter>): UniversalFrontmatter {
  return input as UniversalFrontmatter;
}

describe("getCodexInstructionEmissionPaths", () => {
  it("routes alwaysApply: true to AGENTS.md regardless of globs", () => {
    expect(getCodexInstructionEmissionPaths(fm({ alwaysApply: true }))).toEqual(["AGENTS.md"]);
    expect(
      getCodexInstructionEmissionPaths(fm({ alwaysApply: true, globs: ["packages/foo/**"] })),
    ).toEqual(["AGENTS.md"]);
  });

  it("routes templates with no globs to AGENTS.md (default broadest scope)", () => {
    expect(getCodexInstructionEmissionPaths(fm({}))).toEqual(["AGENTS.md"]);
    expect(getCodexInstructionEmissionPaths(fm({ globs: [] }))).toEqual(["AGENTS.md"]);
  });

  it("routes all-leading-wildcard globs to AGENTS.md", () => {
    expect(getCodexInstructionEmissionPaths(fm({ globs: ["**/*.ts"] }))).toEqual(["AGENTS.md"]);
    expect(getCodexInstructionEmissionPaths(fm({ globs: ["*.md", "**/*.tsx"] }))).toEqual([
      "AGENTS.md",
    ]);
  });

  it("routes a single resolvable-prefix glob to a single override file", () => {
    expect(getCodexInstructionEmissionPaths(fm({ globs: ["packages/frontend/**"] }))).toEqual([
      "packages/frontend/AGENTS.override.md",
    ]);
    expect(getCodexInstructionEmissionPaths(fm({ globs: ["src/api/**/*.ts"] }))).toEqual([
      "src/api/AGENTS.override.md",
    ]);
  });

  it("ignores leading-wildcard globs when at least one resolvable glob exists", () => {
    expect(getCodexInstructionEmissionPaths(fm({ globs: ["**/*.ts", "src/api/**"] }))).toEqual([
      "src/api/AGENTS.override.md",
    ]);
  });

  it("emits one override file per unique resolvable dir, alpha-sorted", () => {
    expect(getCodexInstructionEmissionPaths(fm({ globs: ["src/web/**", "src/api/**"] }))).toEqual([
      "src/api/AGENTS.override.md",
      "src/web/AGENTS.override.md",
    ]);
  });

  it("dedupes overlapping globs that resolve to the same dir", () => {
    expect(
      getCodexInstructionEmissionPaths(
        fm({ globs: ["src/api/**", "src/api/**/*.ts", "src/api/*.md"] }),
      ),
    ).toEqual(["src/api/AGENTS.override.md"]);
  });

  it("supports comma-separated glob strings (via normalizeGlobs)", () => {
    expect(
      getCodexInstructionEmissionPaths(fm({ globs: "src/api/**,src/web/**" } as never)),
    ).toEqual(["src/api/AGENTS.override.md", "src/web/AGENTS.override.md"]);
  });
});
