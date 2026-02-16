import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { generate } from "../../src/core/generate.js";
import { expectYamlField } from "../test-helpers.js";
import type { InMemoryTemplate } from "../../src/types.js";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures/basic-project");

describe("in-memory templates", () => {
  it("generates an in-memory instruction template", async () => {
    const templates: InMemoryTemplate[] = [
      {
        name: "memory-rule",
        type: "instructions",
        content: [
          "---",
          "description: In-memory coding rule",
          "alwaysApply: true",
          "---",
          "This rule came from an in-memory template.",
          "Target: <%= target %>",
        ].join("\n"),
      },
    ];

    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["claude"],
      types: ["instructions"],
      templates,
    });

    const memoryRule = files.find((f) => f.path.includes("memory-rule"));
    expect(memoryRule).toBeDefined();
    expect(memoryRule!.path).toBe(".claude/rules/memory-rule.md");
    expect(memoryRule!.target).toBe("claude");
    expect(memoryRule!.type).toBe("instructions");
    expectYamlField(memoryRule!.content, "description", "In-memory coding rule");
    // EJS should be rendered
    expect(memoryRule!.content).toContain("Target: claude");
    expect(memoryRule!.content).not.toContain("<%= target %>");
    // sourcePath should use synthesized relative path
    expect(memoryRule!.sourcePath).toBe("instructions/memory-rule.md");
  });

  it("generates an in-memory skill with extraFiles", async () => {
    const templates: InMemoryTemplate[] = [
      {
        name: "memory-skill",
        type: "skills",
        content: [
          "---",
          "description: In-memory skill",
          "---",
          "A skill from memory. Target: <%= target %>",
        ].join("\n"),
        extraFiles: [
          {
            relativePath: "references/guide.md",
            content: "Guide for <%= target %>",
          },
          {
            relativePath: "data/config.txt",
            content: "raw data content",
          },
        ],
      },
    ];

    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["claude"],
      types: ["skills"],
      templates,
    });

    // Main skill file
    const skill = files.find((f) => f.path.includes("memory-skill") && f.path.endsWith("SKILL.md"));
    expect(skill).toBeDefined();
    expect(skill!.path).toBe(".claude/skills/memory-skill/SKILL.md");
    expect(skill!.content).toContain("Target: claude");

    // Extra .md file — should have EJS rendered
    const guide = files.find((f) => f.path.includes("references/guide.md"));
    expect(guide).toBeDefined();
    expect(guide!.content).toBe("Guide for claude");
    expect(guide!.sourcePath).toBe("references/guide.md");

    // Extra non-.md file — should be raw
    const config = files.find((f) => f.path.includes("data/config.txt"));
    expect(config).toBeDefined();
    expect(config!.content).toBe("raw data content");
  });

  it("works alongside file-discovered templates", async () => {
    const templates: InMemoryTemplate[] = [
      {
        name: "extra-memory-rule",
        type: "instructions",
        content: [
          "---",
          "description: Extra in-memory rule",
          "alwaysApply: true",
          "---",
          "Extra rule from memory.",
        ].join("\n"),
      },
    ];

    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["claude"],
      types: ["instructions"],
      templates,
    });

    // File-discovered templates should still be present
    const alwaysRule = files.find((f) => f.path.includes("always-rule"));
    expect(alwaysRule).toBeDefined();

    const globRule = files.find((f) => f.path.includes("glob-rule"));
    expect(globRule).toBeDefined();

    // In-memory template should also be present
    const memoryRule = files.find((f) => f.path.includes("extra-memory-rule"));
    expect(memoryRule).toBeDefined();
  });

  it("file-discovered templates win on name conflicts", async () => {
    const templates: InMemoryTemplate[] = [
      {
        name: "always-rule",
        type: "instructions",
        content: [
          "---",
          "description: SHOULD NOT APPEAR",
          "alwaysApply: true",
          "---",
          "This in-memory template should be ignored.",
        ].join("\n"),
      },
    ];

    const files = await generate({
      root: FIXTURES_DIR,
      targets: ["claude"],
      types: ["instructions"],
      templates,
    });

    const alwaysRule = files.find((f) => f.path.includes("always-rule"));
    expect(alwaysRule).toBeDefined();
    // Should have the file-discovered content, not the in-memory one
    expectYamlField(alwaysRule!.content, "description", "Always applied coding standards");
    expect(alwaysRule!.content).not.toContain("SHOULD NOT APPEAR");
  });

  it("works with only in-memory templates (no templates dir)", async () => {
    const templates: InMemoryTemplate[] = [
      {
        name: "standalone-rule",
        type: "instructions",
        content: [
          "---",
          "description: Standalone rule",
          "globs: '**/*.ts'",
          "---",
          "Works without any templates directory.",
        ].join("\n"),
      },
    ];

    // Use a root that has no .universal-ai-config/ directory
    const files = await generate({
      root: "/tmp",
      targets: ["claude"],
      types: ["instructions"],
      templates,
    });

    expect(files).toHaveLength(1);
    const rule = files[0];
    expect(rule.path).toBe(".claude/rules/standalone-rule.md");
    expectYamlField(rule.content, "description", "Standalone rule");
    expect(rule.content).toContain("Works without any templates directory.");
  });
});
