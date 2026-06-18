import { describe, it, expect } from "vitest";
import { buildSkillOptions } from "../../src/commands/skill/options.js";
import type { DiscoveredSkill } from "../../src/core/skill-discovery.js";

function skill(name: string, description = ""): DiscoveredSkill {
  return { name, description, dir: `/tmp/${name}` };
}

describe("buildSkillOptions", () => {
  it("maps name to both value and label", () => {
    const [option] = buildSkillOptions([skill("my-skill")]);
    expect(option).toMatchObject({ value: "my-skill", label: "my-skill" });
  });

  it("includes the description as a hint when present", () => {
    const [option] = buildSkillOptions([skill("my-skill", "Does a thing")]);
    expect(option).toEqual({ value: "my-skill", label: "my-skill", hint: "Does a thing" });
  });

  it("omits the hint when the description is empty", () => {
    const [option] = buildSkillOptions([skill("my-skill")]);
    expect(option).not.toHaveProperty("hint");
  });

  it("preserves order and returns an empty array for no skills", () => {
    expect(buildSkillOptions([])).toEqual([]);
    expect(buildSkillOptions([skill("a"), skill("b")]).map((o) => o.value)).toEqual(["a", "b"]);
  });
});
