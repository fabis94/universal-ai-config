import { describe, it, expect } from "vitest";
import { parseFrontmatter, renderEjs, parseTemplate } from "../../src/core/parser.js";
import { DEFAULT_CONFIG } from "../../src/config/defaults.js";

describe("parseFrontmatter", () => {
  it("extracts frontmatter and body", () => {
    const content = `---
description: Test rule
globs: ["**/*.ts"]
---
Some body content.
`;
    const result = parseFrontmatter(content);
    expect(result.frontmatter.description).toBe("Test rule");
    expect(result.frontmatter.globs).toEqual(["**/*.ts"]);
    expect(result.body).toContain("Some body content.");
  });

  it("handles content without frontmatter", () => {
    const content = "Just body content, no frontmatter.";
    const result = parseFrontmatter(content);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toContain("Just body content");
  });

  it("handles empty frontmatter", () => {
    const content = `---
---
Body only.
`;
    const result = parseFrontmatter(content);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toContain("Body only.");
  });
});

describe("renderEjs", () => {
  it("renders target-conditional content", () => {
    const template = `<% if (target === 'claude') { %>Claude specific<% } else { %>Other<% } %>`;
    const result = renderEjs(template, {
      target: "claude",
      type: "instructions",
      config: DEFAULT_CONFIG,
    });
    expect(result).toContain("Claude specific");
    expect(result).not.toContain("Other");
  });

  it("provides custom variables from config", () => {
    const template = `Project: <%= projectName %>`;
    const config = { ...DEFAULT_CONFIG, variables: { projectName: "my-app" } };
    const result = renderEjs(template, {
      target: "claude",
      type: "instructions",
      config,
    });
    expect(result).toContain("Project: my-app");
  });

  it("provides type variable", () => {
    const template = `Type: <%= type %>`;
    const result = renderEjs(template, {
      target: "claude",
      type: "skills",
      config: DEFAULT_CONFIG,
    });
    expect(result).toContain("Type: skills");
  });

  it("provides instructionPath helper for claude", () => {
    const template = `Read <%= instructionPath('coding-style') %>`;
    const result = renderEjs(template, {
      target: "claude",
      type: "skills",
      config: DEFAULT_CONFIG,
    });
    expect(result).toBe("Read .claude/rules/coding-style.md");
  });

  it("provides instructionPath helper for copilot", () => {
    const template = `Read <%= instructionPath('coding-style') %>`;
    const result = renderEjs(template, {
      target: "copilot",
      type: "skills",
      config: DEFAULT_CONFIG,
    });
    expect(result).toBe("Read .github/instructions/coding-style.instructions.md");
  });

  it("provides instructionPath helper for cursor", () => {
    const template = `Read <%= instructionPath('coding-style') %>`;
    const result = renderEjs(template, {
      target: "cursor",
      type: "skills",
      config: DEFAULT_CONFIG,
    });
    expect(result).toBe("Read .cursor/rules/coding-style.mdc");
  });

  it("provides skillPath helper", () => {
    const template = `Use <%= skillPath('deploy') %>`;
    const claude = renderEjs(template, {
      target: "claude",
      type: "instructions",
      config: DEFAULT_CONFIG,
    });
    expect(claude).toBe("Use .claude/skills/deploy/SKILL.md");

    const copilot = renderEjs(template, {
      target: "copilot",
      type: "instructions",
      config: DEFAULT_CONFIG,
    });
    expect(copilot).toBe("Use .github/skills/deploy/SKILL.md");
  });

  it("provides agentPath helper", () => {
    const template = `See <%= agentPath('reviewer') %>`;
    const claude = renderEjs(template, {
      target: "claude",
      type: "instructions",
      config: DEFAULT_CONFIG,
    });
    expect(claude).toBe("See .claude/agents/reviewer.md");

    const copilot = renderEjs(template, {
      target: "copilot",
      type: "instructions",
      config: DEFAULT_CONFIG,
    });
    expect(copilot).toBe("See .github/agents/reviewer.agent.md");
  });

  it("path helpers use canonical outputDir regardless of config overrides", () => {
    const config = {
      ...DEFAULT_CONFIG,
      outputDirs: { ...DEFAULT_CONFIG.outputDirs, claude: "../custom-claude" },
    };
    const template = `<%= skillPath('deploy') %>`;
    const result = renderEjs(template, {
      target: "claude",
      type: "instructions",
      config,
    });
    expect(result).toBe(".claude/skills/deploy/SKILL.md");
  });
});

describe("parseTemplate", () => {
  it("parses frontmatter and renders EJS body", () => {
    const content = `---
description: Test
---
<% if (target === 'copilot') { %>Copilot content<% } else { %>Default content<% } %>
`;
    const result = parseTemplate(content, {
      target: "copilot",
      type: "instructions",
      config: DEFAULT_CONFIG,
    });
    expect(result.frontmatter.description).toBe("Test");
    expect(result.body).toContain("Copilot content");
    expect(result.body).not.toContain("Default content");
  });
});
