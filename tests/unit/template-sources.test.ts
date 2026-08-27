import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  displayPathFor,
  excludePathsFor,
  normalizeSourceId,
  resolveSourceDir,
  resolveTemplateSources,
  type TemplateSource,
} from "../../src/core/template-sources.js";
import { DEFAULT_CONFIG } from "../../src/config/defaults.js";
import type { ResolvedConfig } from "../../src/types.js";

const ROOT = "/projects/app";

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return { ...DEFAULT_CONFIG, ...overrides } as ResolvedConfig;
}

describe("normalizeSourceId", () => {
  it("strips a leading ./", () => {
    expect(normalizeSourceId("./shared")).toBe("shared");
  });

  it("strips trailing slashes", () => {
    expect(normalizeSourceId("shared/")).toBe("shared");
  });

  it("converts backslashes to forward slashes", () => {
    expect(normalizeSourceId("shared\\templates")).toBe("shared/templates");
  });

  it("leaves ~ and absolute paths alone", () => {
    expect(normalizeSourceId("~/.universal-ai-config")).toBe("~/.universal-ai-config");
    expect(normalizeSourceId("/abs/shared")).toBe("/abs/shared");
  });

  it("treats '.' as no prefix at all", () => {
    expect(normalizeSourceId(".")).toBe("");
  });
});

describe("resolveSourceDir", () => {
  it("expands ~ against the home directory", () => {
    expect(resolveSourceDir(ROOT, "~/.uac")).toBe(join(homedir(), "/.uac"));
  });

  it("resolves relative paths against the project root", () => {
    expect(resolveSourceDir(ROOT, "shared")).toBe(resolve(ROOT, "shared"));
  });

  it("passes absolute paths through", () => {
    expect(resolveSourceDir(ROOT, "/abs/shared")).toBe("/abs/shared");
  });
});

describe("resolveTemplateSources", () => {
  it("ranks the main templatesDir ahead of additional dirs, in order", () => {
    const sources = resolveTemplateSources(
      ROOT,
      makeConfig({ additionalTemplateDirs: ["shared", "~/.uac"] }),
    );

    expect(sources.map((s) => s.id)).toEqual([".universal-ai-config", "shared", "~/.uac"]);
    expect(sources.map((s) => s.rank)).toEqual([0, 1, 2]);
    expect(sources[0]!.dir).toBe(resolve(ROOT, ".universal-ai-config"));
    expect(sources[2]!.dir).toBe(join(homedir(), "/.uac"));
  });
});

describe("excludePathsFor", () => {
  const rel = "instructions/foo.md";

  it("always offers the unqualified path", () => {
    const source: TemplateSource = { dir: resolve(ROOT, "shared"), id: "shared", rank: 1 };
    expect(excludePathsFor(source, ROOT, rel)).toContain(rel);
  });

  it("offers the config spelling, the absolute path and the root-relative path", () => {
    const source: TemplateSource = { dir: resolve(ROOT, "shared"), id: "shared", rank: 1 };
    const paths = excludePathsFor(source, ROOT, rel);

    expect(paths).toContain(`shared/${rel}`);
    expect(paths).toContain(`${resolve(ROOT, "shared")}/${rel}`);
  });

  it("offers both ~ and absolute spellings for a dir under home, however it was written", () => {
    const absolute = join(homedir(), ".uac");
    const written: TemplateSource = { dir: absolute, id: "~/.uac", rank: 1 };
    const asAbsolute: TemplateSource = { dir: absolute, id: absolute, rank: 1 };

    for (const source of [written, asAbsolute]) {
      const paths = excludePathsFor(source, ROOT, rel);
      expect(paths).toContain(`~/.uac/${rel}`);
      expect(paths).toContain(`${absolute}/${rel}`);
    }
  });

  it("does not offer a root-relative alias for a dir outside the project", () => {
    const source: TemplateSource = { dir: "/elsewhere/shared", id: "/elsewhere/shared", rank: 1 };
    const paths = excludePathsFor(source, ROOT, rel);

    expect(paths).toEqual([rel, `/elsewhere/shared/${rel}`]);
  });

  it("deduplicates equivalent spellings", () => {
    const source: TemplateSource = { dir: resolve(ROOT, "shared"), id: "./shared/", rank: 1 };
    const paths = excludePathsFor(source, ROOT, rel);

    expect(paths.filter((p) => p === `shared/${rel}`)).toHaveLength(1);
  });
});

describe("displayPathFor", () => {
  it("qualifies the path with the source id", () => {
    const source: TemplateSource = { dir: "/x/shared", id: "shared", rank: 1 };
    expect(displayPathFor(source, "skills/a/SKILL.md")).toBe("shared/skills/a/SKILL.md");
  });

  it("falls back to the bare path when there is no id", () => {
    const source: TemplateSource = { dir: "/x", id: "", rank: 0 };
    expect(displayPathFor(source, "skills/a/SKILL.md")).toBe("skills/a/SKILL.md");
  });
});
