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
