import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { generate } from "../../src/core/generate.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures/basic-project");

describe("generate", () => {
  it("generates files for all targets", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["claude", "copilot", "cursor"],
      types: ["instructions", "skills", "agents"],
    });

    expect(files.length).toBeGreaterThan(0);

    // Check each file has required properties
    for (const file of files) {
      expect(file.path).toBeTruthy();
      expect(file.content).toBeTruthy();
      expect(file.target).toBeTruthy();
      expect(file.type).toBeTruthy();
      expect(file.sourcePath).toBeTruthy();
    }
  });

  it("generates claude instruction files correctly", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["claude"],
      types: ["instructions"],
    });

    const alwaysRule = files.find((f) => f.path.includes("always-rule"));
    expect(alwaysRule).toBeDefined();
    expect(alwaysRule!.path).toBe(".claude/rules/always-rule.md");
    expect(alwaysRule!.content).toContain("description: Always applied coding standards");
    // alwaysApply should result in no paths field for claude
    expect(alwaysRule!.content).not.toContain("paths:");
    // EJS should render claude-specific content
    expect(alwaysRule!.content).toContain("Use the Read tool");

    const globRule = files.find((f) => f.path.includes("glob-rule"));
    expect(globRule).toBeDefined();
    expect(globRule!.path).toBe(".claude/rules/glob-rule.md");
    expect(globRule!.content).toContain("paths:");
  });

  it("generates copilot instruction files correctly", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["copilot"],
      types: ["instructions"],
    });

    // alwaysApply should go to copilot-instructions.md
    const alwaysRule = files.find((f) => f.path.includes("copilot-instructions.md"));
    expect(alwaysRule).toBeDefined();
    expect(alwaysRule!.content).toContain("Check existing patterns");
    expect(alwaysRule!.content).not.toContain("Use the Read tool");

    // glob rule should go to instructions/
    const globRule = files.find((f) => f.path.includes("glob-rule"));
    expect(globRule).toBeDefined();
    expect(globRule!.path).toBe(".github/instructions/glob-rule.instructions.md");
    expect(globRule!.content).toContain("applyTo:");
  });

  it("generates cursor instruction files with .mdc extension", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["cursor"],
      types: ["instructions"],
    });

    const globRule = files.find((f) => f.path.includes("glob-rule"));
    expect(globRule).toBeDefined();
    expect(globRule!.path).toBe(".cursor/rules/glob-rule.mdc");
    expect(globRule!.content).toContain("globs:");
  });

  it("skips agents for cursor target", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["cursor"],
      types: ["agents"],
    });

    const agentFiles = files.filter((f) => f.type === "agents" && f.target === "cursor");
    expect(agentFiles).toHaveLength(0);
  });

  it("generates skills correctly", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["claude"],
      types: ["skills"],
    });

    const skill = files.find((f) => f.type === "skills");
    expect(skill).toBeDefined();
    expect(skill!.path).toBe(".claude/skills/test-gen/SKILL.md");
    expect(skill!.content).toContain("disable-model-invocation: true");
    expect(skill!.content).toContain("user-invocable: /test");
  });

  it("generates agents correctly for claude", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["claude"],
      types: ["agents"],
    });

    const agent = files.find((f) => f.type === "agents");
    expect(agent).toBeDefined();
    expect(agent!.path).toBe(".claude/agents/reviewer.md");
    expect(agent!.content).toContain("model: sonnet");
    expect(agent!.content).toContain("tools:");
  });

  it("generates agents correctly for copilot", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["copilot"],
      types: ["agents"],
    });

    const agent = files.find((f) => f.type === "agents");
    expect(agent).toBeDefined();
    expect(agent!.path).toBe(".github/agents/reviewer.agent.md");
  });

  it("filters by type", async () => {
    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["claude"],
      types: ["instructions"],
    });

    expect(files.every((f) => f.type === "instructions")).toBe(true);
  });

  it("throws on unknown target", async () => {
    await expect(
      generate({
        root: FIXTURES_DIR,
        targets: ["nonexistent" as "claude"],
      }),
    ).rejects.toThrow('Unknown target "nonexistent"');
  });
});
