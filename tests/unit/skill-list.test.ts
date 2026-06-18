import { describe, it, expect } from "vitest";
import { formatSkillList } from "../../src/commands/skill/list.js";
import type { DiscoveredSkill } from "../../src/core/skill-discovery.js";

function skill(name: string, description = ""): DiscoveredSkill {
  return { name, description, dir: `/tmp/${name}` };
}

// picocolors emits ANSI when color is supported (e.g. CI sets the CI env var),
// so strip it to assert on structure regardless of the ambient environment.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
function plain(value: string): string {
  return value.replace(ANSI, "");
}

describe("formatSkillList", () => {
  it("pluralizes the header by count", () => {
    expect(plain(formatSkillList([]))).toContain("Found 0 skills:");
    expect(plain(formatSkillList([skill("a")]))).toContain("Found 1 skill:");
    expect(plain(formatSkillList([skill("a"), skill("b")]))).toContain("Found 2 skills:");
  });

  it("renders the name and its description on an indented line beneath it", () => {
    const out = plain(formatSkillList([skill("my-skill", "Does a thing")]));
    expect(out).toContain("my-skill");
    expect(out).toContain("\n      Does a thing");
  });

  it("omits the description line when there is no description", () => {
    const out = plain(formatSkillList([skill("my-skill")]));
    expect(out).toContain("my-skill");
    expect(out).not.toContain("\n      ");
  });

  it("does not emit logger-style timestamps", () => {
    const out = plain(formatSkillList([skill("a", "desc"), skill("b")]));
    expect(out).not.toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });
});
