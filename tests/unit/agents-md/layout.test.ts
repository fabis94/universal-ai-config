import { describe, expect, it } from "vitest";
import {
  place,
  primaryFile,
  scopeNote,
  type AgentsMdEntry,
  type LayoutOptions,
} from "../../../src/core/agents-md/layout.js";
import type { DiagnosticInput } from "../../../src/core/diagnostics.js";
import type { UniversalFrontmatter } from "../../../src/types.js";

const entry = (name: string, frontmatter: UniversalFrontmatter): AgentsMdEntry => ({
  name,
  sourcePath: `.universal-ai-config/instructions/${name}.md`,
  frontmatter,
  body: `${name} body`,
});

const nested: LayoutOptions = { variation: "nested", indexDir: ".agents/uac-instructions" };
const concatenate: LayoutOptions = { ...nested, variation: "concatenate" };
const index: LayoutOptions = { ...nested, variation: "index" };

/** Placements as [file, note] pairs (links as ["link", dirs, file]). */
function summary(placements: ReturnType<typeof place>) {
  return placements.map((p) =>
    p.kind === "link" ? ["link", p.link.dirs, p.link.file] : [p.file, p.section.note],
  );
}

describe("scopeNote", () => {
  it("lists folders and globs", () => {
    expect(scopeNote(["a"], [])).toBe("Applies to files in `a/`.");
    expect(scopeNote(["a", "b"], ["**/*.ts"])).toBe(
      "Applies to files in `a/` and `b/` and files matching `**/*.ts`.",
    );
    expect(scopeNote([], ["x", "y", "z"])).toBe("Applies to files matching `x`, `y` and `z`.");
    expect(scopeNote([], [])).toBeUndefined();
  });
});

describe("nested variation", () => {
  it("puts always-on templates in the root with no note", () => {
    expect(summary(place(entry("a", { alwaysApply: true }), nested))).toEqual([
      ["AGENTS.md", undefined],
    ]);
  });

  it("puts folder-less globs in the root with a note", () => {
    expect(summary(place(entry("a", { globs: "**/*.test.ts" }), nested))).toEqual([
      ["AGENTS.md", "Applies to files matching `**/*.test.ts`."],
    ]);
  });

  it("puts each folder in its own AGENTS.md, noting partial folders", () => {
    expect(
      summary(place(entry("a", { globs: ["web/**", "api/**/*.ts", "**/*.sql"] }), nested)),
    ).toEqual([
      ["api/AGENTS.md", "Applies to files matching `api/**/*.ts`."],
      ["web/AGENTS.md", undefined],
      ["AGENTS.md", "Applies to files matching `**/*.sql`."],
    ]);
  });
});

describe("concatenate variation", () => {
  it("puts everything in the root, with the full scope in one note", () => {
    expect(
      summary(place(entry("a", { globs: ["web/**", "api/**/*.ts", "**/*.sql"] }), concatenate)),
    ).toEqual([
      ["AGENTS.md", "Applies to files in `web/` and files matching `api/**/*.ts` and `**/*.sql`."],
    ]);
    expect(summary(place(entry("b", { alwaysApply: true }), concatenate))).toEqual([
      ["AGENTS.md", undefined],
    ]);
  });
});

describe("index variation", () => {
  it("links folders to an index file holding the section", () => {
    expect(summary(place(entry("frontend", { globs: "packages/frontend/**/*" }), index))).toEqual([
      ["link", ["packages/frontend"], ".agents/uac-instructions/frontend.md"],
      [".agents/uac-instructions/frontend.md", undefined],
    ]);
  });

  it("lists only folders in the link, and notes partial folders in the file", () => {
    expect(summary(place(entry("api", { globs: ["src/api/**/*.ts", "lib/**"] }), index))).toEqual([
      ["link", ["lib", "src/api"], ".agents/uac-instructions/api.md"],
      [".agents/uac-instructions/api.md", "Applies to files matching `src/api/**/*.ts`."],
    ]);
  });

  it("inlines folder-less globs in the root", () => {
    expect(summary(place(entry("tests", { globs: "**/*.test.ts" }), index))).toEqual([
      ["AGENTS.md", "Applies to files matching `**/*.test.ts`."],
    ]);
  });

  it("inlines a template whose index file name tools would load on their own", () => {
    const diagnostics: DiagnosticInput[] = [];
    const placements = place(entry("AGENTS", { globs: "src/**" }), index, (d) =>
      diagnostics.push(d),
    );
    expect(summary(placements)).toEqual([["AGENTS.md", "Applies to files in `src/`."]]);
    expect(diagnostics.map((d) => d.code)).toEqual(["suspicious-value"]);
  });
});

describe("primaryFile", () => {
  it("returns where the template's content lands first", () => {
    const fe = entry("fe", { globs: "packages/fe/**" });
    expect(primaryFile(fe, nested)).toBe("packages/fe/AGENTS.md");
    expect(primaryFile(fe, concatenate)).toBe("AGENTS.md");
    expect(primaryFile(fe, index)).toBe(".agents/uac-instructions/fe.md");
    expect(primaryFile(entry("x", { alwaysApply: true }), index)).toBe("AGENTS.md");
  });
});
