import { describe, expect, it } from "vitest";
import { parseTargets, parseTypes } from "../../src/commands/cli-args.js";

describe("parseTypes (--type)", () => {
  it("splits a comma-separated list", () => {
    expect(parseTypes("skills, hooks")).toEqual(["skills", "hooks"]);
  });

  it("all means every template type", () => {
    expect(parseTypes("all")).toEqual(["instructions", "skills", "agents", "hooks", "mcp"]);
    expect(parseTypes("skills,all")).toEqual(["instructions", "skills", "agents", "hooks", "mcp"]);
  });

  it("is undefined without the flag, so the configured types apply", () => {
    expect(parseTypes(undefined)).toBeUndefined();
  });

  it("rejects unknown types instead of silently doing nothing", () => {
    expect(() => parseTypes("skils")).toThrow(
      'Unknown type "skils". Available: instructions, skills, agents, hooks, mcp, all',
    );
  });
});

describe("parseTargets (--target)", () => {
  it("splits a comma-separated list and rejects unknown targets", () => {
    expect(parseTargets("claude,cursor")).toEqual(["claude", "cursor"]);
    expect(parseTargets(undefined)).toBeUndefined();
    expect(() => parseTargets("zed")).toThrow('Unknown target "zed"');
  });
});
