import { describe, it, expect } from "vitest";
import { userConfigSchema, defineConfig } from "../../src/config/schema.js";

describe("userConfigSchema", () => {
  it("validates a complete config", () => {
    const config = {
      templatesDir: ".my-templates",
      targets: ["claude", "copilot"] as const,
      types: ["instructions", "skills"] as const,
      variables: { projectName: "test" },
      outputDirs: { claude: ".claude-custom" },
    };
    const result = userConfigSchema.parse(config);
    expect(result.templatesDir).toBe(".my-templates");
    expect(result.targets).toEqual(["claude", "copilot"]);
  });

  it("validates an empty config", () => {
    const result = userConfigSchema.parse({});
    expect(result.templatesDir).toBeUndefined();
    expect(result.targets).toBeUndefined();
  });

  it("rejects invalid target names", () => {
    expect(() => userConfigSchema.parse({ targets: ["invalid"] })).toThrow();
  });

  it("rejects invalid type names", () => {
    expect(() => userConfigSchema.parse({ types: ["invalid"] })).toThrow();
  });
});

describe("defineConfig", () => {
  it("returns the config as-is (identity helper)", () => {
    const config = { targets: ["claude" as const], variables: { x: 1 } };
    expect(defineConfig(config)).toBe(config);
  });
});
