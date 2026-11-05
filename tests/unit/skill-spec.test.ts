import { describe, expect, it } from "vitest";
import { checkSkillSpec } from "../../src/core/generate/skill-spec.js";
import type { DiagnosticInput } from "../../src/core/diagnostics.js";
import type { UniversalFrontmatter } from "../../src/types.js";

function check(folder: string, fm: UniversalFrontmatter): string[] {
  const diagnostics: DiagnosticInput[] = [];
  checkSkillSpec(folder, fm, `skills/${folder}/SKILL.md`, (d) => diagnostics.push(d));
  return diagnostics.map((d) => `${(d.detail as { field: string }).field}: ${d.message}`);
}

describe("checkSkillSpec", () => {
  it("accepts a spec-compliant skill", () => {
    expect(check("deploy-helper", { description: "Deploys", metadata: { owner: "ops" } })).toEqual(
      [],
    );
  });

  it("requires a description", () => {
    expect(check("a", {})).toEqual([
      'description: skill "a": description is required (Agent Skills spec)',
    ]);
    expect(check("a", { description: "   " })).toHaveLength(1);
  });

  it("checks name length, characters and the folder match", () => {
    expect(check("x".repeat(65), { description: "d" }).map((m) => m.split(":")[0])).toEqual([
      "name",
    ]);
    expect(check("Deploy_Helper", { description: "d" })).toHaveLength(1);
    expect(check("-a", { description: "d" })).toHaveLength(1);
    expect(check("a--b", { description: "d" })).toHaveLength(1);
    expect(check("deploy", { name: "deployer", description: "d" })).toEqual([
      'name: skill "deploy": name "deployer" must match the skill\'s folder name "deploy" (Agent Skills spec)',
    ]);
  });

  it("checks description and compatibility lengths", () => {
    expect(check("a", { description: "x".repeat(1025) })).toHaveLength(1);
    expect(check("a", { description: "d", compatibility: "x".repeat(501) })).toHaveLength(1);
  });

  it("requires metadata values to be strings", () => {
    expect(check("a", { description: "d", metadata: { version: 2 } })).toEqual([
      'metadata: skill "a": metadata must map keys to string values (Agent Skills spec)',
    ]);
  });
});
