import { describe, it, expect } from "vitest";
import { formatSkillList } from "../../src/commands/skill/list.js";
import type { DiscoveredSkill } from "../../src/core/skill-discovery.js";

function skill(name: string, description = ""): DiscoveredSkill {
  return { name, description, dir: `/tmp/${name}` };
}

describe("formatSkillList", () => {
  it("pluralizes the header by count", () => {
    expect(formatSkillList([])).toContain("Found 0 skills:");
    expect(formatSkillList([skill("a")])).toContain("Found 1 skill:");
    expect(formatSkillList([skill("a"), skill("b")])).toContain("Found 2 skills:");
  });

  it("renders the name and its description on an indented line beneath it", () => {
    const out = formatSkillList([skill("my-skill", "Does a thing")]);
    expect(out).toContain("my-skill");
    expect(out).toContain("\n      Does a thing");
  });

  it("omits the description line when there is no description", () => {
    const out = formatSkillList([skill("my-skill")]);
    expect(out).toContain("my-skill");
    expect(out).not.toContain("\n      ");
  });

  it("does not emit logger-style timestamps", () => {
    const out = formatSkillList([skill("a", "desc"), skill("b")]);
    expect(out).not.toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });
});
