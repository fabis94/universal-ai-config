import { describe, expect, it } from "vitest";
import { classify, globRootDir } from "../../../src/core/agents-md/routing.js";
import type { DiagnosticInput } from "../../../src/core/diagnostics.js";

describe("globRootDir", () => {
  it("returns the segments before the first wildcard", () => {
    expect(globRootDir("packages/frontend/**/*.ts")).toBe("packages/frontend");
    expect(globRootDir("src/**")).toBe("src");
    expect(globRootDir("src/api/**/*.ts")).toBe("src/api");
  });

  it("treats braces, character classes, ? and extglobs as wildcards", () => {
    expect(globRootDir("src/{a,b}/**")).toBe("src");
    expect(globRootDir("src/[ab]/x.ts")).toBe("src");
    expect(globRootDir("src/v?/x.ts")).toBe("src");
    expect(globRootDir("src/@(a|b)/x.ts")).toBe("src");
    expect(globRootDir("src/!(test)/x.ts")).toBe("src");
    expect(globRootDir("src/+(a)/x.ts")).toBe("src");
  });

  it("keeps a plain @scope segment, which is not an extglob", () => {
    expect(globRootDir("packages/@scope/pkg/**")).toBe("packages/@scope/pkg");
  });

  it("returns null for leading-wildcard globs", () => {
    expect(globRootDir("**/*.ts")).toBeNull();
    expect(globRootDir("*.md")).toBeNull();
    expect(globRootDir("{src,lib}/**")).toBeNull();
  });

  it("anchors a glob with no wildcard to its parent folder", () => {
    expect(globRootDir("src/index.ts")).toBe("src");
    expect(globRootDir("src/foo")).toBe("src");
    expect(globRootDir("README.md")).toBeNull();
  });
});

describe("classify", () => {
  const diagnostics: DiagnosticInput[] = [];
  const report = (d: DiagnosticInput) => diagnostics.push(d);

  it("alwaysApply wins over globs", () => {
    expect(classify("a", { alwaysApply: true, globs: ["src/**"] })).toEqual({ kind: "always" });
  });

  it("no globs means always", () => {
    expect(classify("a", {})).toEqual({ kind: "always" });
    expect(classify("a", { globs: [] })).toEqual({ kind: "always" });
  });

  it("folder-less globs make a pattern", () => {
    expect(classify("a", { globs: ["**/*.test.ts", "*.md"] })).toEqual({
      kind: "pattern",
      globs: ["**/*.test.ts", "*.md"],
    });
  });

  it("folder globs make dirs, sorted, marking whole-folder globs", () => {
    expect(classify("a", { globs: ["src/web/**", "src/api/**/*.ts", "lib/**/*"] })).toEqual({
      kind: "dirs",
      dirs: [
        { dir: "lib", globs: ["lib/**/*"], whole: true },
        { dir: "src/api", globs: ["src/api/**/*.ts"], whole: false },
        { dir: "src/web", globs: ["src/web/**"], whole: true },
      ],
      residual: [],
    });
  });

  it("keeps folder-less globs as residual next to dirs", () => {
    expect(classify("a", { globs: "packages/web/**, **/*.sql" })).toEqual({
      kind: "dirs",
      dirs: [{ dir: "packages/web", globs: ["packages/web/**"], whole: true }],
      residual: ["**/*.sql"],
    });
  });

  it("drops a folder already covered by a whole parent folder of the same template", () => {
    const route = classify("a", { globs: ["src/**", "src/api/**/*.ts"] });
    expect(route).toEqual({
      kind: "dirs",
      dirs: [{ dir: "src", globs: ["src/**"], whole: true }],
      residual: [],
    });
  });

  it("strips ./ and leading slashes", () => {
    expect(classify("a", { globs: ["./src/**", "/lib/**"] })).toMatchObject({
      dirs: [{ dir: "lib" }, { dir: "src" }],
    });
  });

  it("ignores negated and .. globs with a diagnostic", () => {
    diagnostics.length = 0;
    const route = classify("rule", { globs: ["!src/gen/**", "../other/**", "src/**"] }, report);
    expect(route).toMatchObject({ kind: "dirs", dirs: [{ dir: "src" }] });
    expect(diagnostics.map((d) => [d.code, (d.detail as { reason: string }).reason])).toEqual([
      ["agents-md-glob", "negated"],
      ["agents-md-glob", "parent-segment"],
    ]);
  });

  it("falls back to always when every glob is rejected", () => {
    expect(classify("rule", { globs: ["!x/**"] })).toEqual({ kind: "always" });
  });
});
