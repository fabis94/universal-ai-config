import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { parseSkillSource } from "../../src/core/skill-source.js";

describe("parseSkillSource", () => {
  it("parses GitHub shorthand", () => {
    expect(parseSkillSource("owner/repo")).toEqual({
      type: "github",
      cloneUrl: "https://github.com/owner/repo.git",
    });
  });

  it("parses shorthand with a subpath", () => {
    expect(parseSkillSource("owner/repo/path/to/skills")).toEqual({
      type: "github",
      cloneUrl: "https://github.com/owner/repo.git",
      subpath: "path/to/skills",
    });
  });

  it("parses shorthand with an @skill filter", () => {
    expect(parseSkillSource("owner/repo@my-skill")).toEqual({
      type: "github",
      cloneUrl: "https://github.com/owner/repo.git",
      skillFilter: "my-skill",
    });
  });

  it("parses a #ref fragment", () => {
    expect(parseSkillSource("owner/repo#dev")).toEqual({
      type: "github",
      cloneUrl: "https://github.com/owner/repo.git",
      ref: "dev",
    });
  });

  it("parses a #ref@skill fragment", () => {
    expect(parseSkillSource("owner/repo#dev@my-skill")).toEqual({
      type: "github",
      cloneUrl: "https://github.com/owner/repo.git",
      ref: "dev",
      skillFilter: "my-skill",
    });
  });

  it("strips the github: prefix", () => {
    expect(parseSkillSource("github:owner/repo")).toEqual({
      type: "github",
      cloneUrl: "https://github.com/owner/repo.git",
    });
  });

  it("parses a full github.com URL", () => {
    expect(parseSkillSource("https://github.com/owner/repo")).toEqual({
      type: "github",
      cloneUrl: "https://github.com/owner/repo.git",
    });
  });

  it("parses a github.com URL with .git suffix and trailing slash", () => {
    expect(parseSkillSource("https://github.com/owner/repo.git/")).toEqual({
      type: "github",
      cloneUrl: "https://github.com/owner/repo.git",
    });
  });

  it("parses a github.com URL with branch", () => {
    expect(parseSkillSource("https://github.com/owner/repo/tree/main")).toEqual({
      type: "github",
      cloneUrl: "https://github.com/owner/repo.git",
      ref: "main",
    });
  });

  it("parses a github.com URL with branch and subpath", () => {
    expect(parseSkillSource("https://github.com/owner/repo/tree/main/skills/foo")).toEqual({
      type: "github",
      cloneUrl: "https://github.com/owner/repo.git",
      ref: "main",
      subpath: "skills/foo",
    });
  });

  it("parses relative local paths", () => {
    expect(parseSkillSource("./local/skills")).toEqual({
      type: "local",
      localPath: resolve("./local/skills"),
    });
  });

  it("parses absolute local paths", () => {
    expect(parseSkillSource("/tmp/skills")).toEqual({
      type: "local",
      localPath: resolve("/tmp/skills"),
    });
  });

  it("rejects subpaths containing .. traversal segments", () => {
    expect(() => parseSkillSource("owner/repo/../../etc")).toThrow(/traversal/);
  });

  it("throws on empty input", () => {
    expect(() => parseSkillSource("   ")).toThrow(/empty/);
  });
});
