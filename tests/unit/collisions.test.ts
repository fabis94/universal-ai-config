import { describe, expect, it } from "vitest";
import { assertNoPathCollisions } from "../../src/core/generate/collisions.js";
import type { GeneratedFile } from "../../src/types.js";

const file = (over: Partial<GeneratedFile>): GeneratedFile => ({
  path: "a.json",
  content: "{}",
  target: "claude",
  type: "mcp",
  sourcePath: "mcp",
  ...over,
});

describe("assertNoPathCollisions", () => {
  it("collapses identical files at one path, merging consumers", () => {
    const result = assertNoPathCollisions([
      file({ consumers: ["claude"] }),
      file({ target: "copilot", consumers: ["copilot"] }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.consumers).toEqual(["claude", "copilot"]);
  });

  it("compares bytes for binary content", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(
      assertNoPathCollisions([
        file({ content: bytes }),
        file({ content: new Uint8Array([1, 2, 3]) }),
      ]),
    ).toHaveLength(1);
  });

  it("throws on different content at one path", () => {
    expect(() =>
      assertNoPathCollisions([file({}), file({ target: "copilot", content: "{ }" })]),
    ).toThrow(/claude and copilot both generate a.json/);
  });

  it("keeps different merge keys of one file apart", () => {
    const result = assertNoPathCollisions([
      file({ mergeKey: "hooks", content: "1" }),
      file({ mergeKey: "permissions", content: "2" }),
    ]);
    expect(result).toHaveLength(2);
  });

  it("defaults consumers to the target", () => {
    expect(assertNoPathCollisions([file({})])[0]!.consumers).toEqual(["claude"]);
  });
});
