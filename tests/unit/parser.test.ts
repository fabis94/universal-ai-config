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

  describe("line ending normalization", () => {
    const makeContent = (sep: string) =>
      [
        "---",
        "description: Storybook rules",
        "globs:",
        '  - "src/**/*.stories.ts"',
        '  - "packages/app/.storybook/**/*"',
        "---",
        "Use Storybook best practices.",
      ].join(sep);

    const expectedGlobs = ["src/**/*.stories.ts", "packages/app/.storybook/**/*"];

    it("handles LF line endings (Unix/macOS)", () => {
      const result = parseFrontmatter(makeContent("\n"));
      expect(result.frontmatter.description).toBe("Storybook rules");
      expect(result.frontmatter.globs).toEqual(expectedGlobs);
      expect(result.body).toContain("Use Storybook best practices.");
      expect(result.body).not.toContain("\r");
    });

    it("handles CRLF line endings (Windows)", () => {
      const result = parseFrontmatter(makeContent("\r\n"));
      expect(result.frontmatter.description).toBe("Storybook rules");
      expect(result.frontmatter.globs).toEqual(expectedGlobs);
      expect(result.body).toContain("Use Storybook best practices.");
      expect(result.body).not.toContain("\r");
    });

    it("handles CR line endings (legacy Mac)", () => {
      const result = parseFrontmatter(makeContent("\r"));
      expect(result.frontmatter.description).toBe("Storybook rules");
      expect(result.frontmatter.globs).toEqual(expectedGlobs);
      expect(result.body).toContain("Use Storybook best practices.");
      expect(result.body).not.toContain("\r");
    });

    it("handles mixed line endings", () => {
      const content =
        '---\r\ndescription: Mixed endings\nglobs:\r  - "**/*.ts"\r\n---\nBody content.\r\n';
      const result = parseFrontmatter(content);
      expect(result.frontmatter.description).toBe("Mixed endings");
      expect(result.frontmatter.globs).toEqual(["**/*.ts"]);
      expect(result.body).toContain("Body content.");
      expect(result.body).not.toContain("\r");
    });

    it("handles CRLF content without frontmatter", () => {
      const content = "Just body content,\r\nno frontmatter.\r\n";
      const result = parseFrontmatter(content);
      expect(result.frontmatter).toEqual({});
      expect(result.body).toContain("Just body content,\nno frontmatter.");
      expect(result.body).not.toContain("\r");
    });

    it("handles CRLF with empty frontmatter", () => {
      const content = "---\r\n---\r\nBody only.\r\n";
      const result = parseFrontmatter(content);
      expect(result.frontmatter).toEqual({});
      expect(result.body).toContain("Body only.");
      expect(result.body).not.toContain("\r");
    });
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

  it("output path helpers return directory when called without name", () => {
    const ctx = {
      target: "claude" as const,
      type: "instructions" as const,
      config: DEFAULT_CONFIG,
    };
    expect(renderEjs("<%= instructionPath() %>", ctx)).toBe(".claude/rules");
    expect(renderEjs("<%= skillPath() %>", ctx)).toBe(".claude/skills");
    expect(renderEjs("<%= agentPath() %>", ctx)).toBe(".claude/agents");

    const copilotCtx = { ...ctx, target: "copilot" as const };
    expect(renderEjs("<%= instructionPath() %>", copilotCtx)).toBe(".github/instructions");
    expect(renderEjs("<%= skillPath() %>", copilotCtx)).toBe(".github/skills");

    const cursorCtx = { ...ctx, target: "cursor" as const };
    expect(renderEjs("<%= instructionPath() %>", cursorCtx)).toBe(".cursor/rules");
  });

  it("provides template path helpers with name", () => {
    const ctx = {
      target: "claude" as const,
      type: "instructions" as const,
      config: DEFAULT_CONFIG,
    };
    expect(renderEjs("<%= instructionTemplatePath('coding-style') %>", ctx)).toBe(
      ".universal-ai-config/instructions/coding-style.md",
    );
    expect(renderEjs("<%= skillTemplatePath('deploy') %>", ctx)).toBe(
      ".universal-ai-config/skills/deploy/SKILL.md",
    );
    expect(renderEjs("<%= agentTemplatePath('reviewer') %>", ctx)).toBe(
      ".universal-ai-config/agents/reviewer.md",
    );
    expect(renderEjs("<%= hookTemplatePath('linting') %>", ctx)).toBe(
      ".universal-ai-config/hooks/linting.json",
    );
  });

  it("template path helpers return directory when called without name", () => {
    const ctx = {
      target: "claude" as const,
      type: "instructions" as const,
      config: DEFAULT_CONFIG,
    };
    expect(renderEjs("<%= instructionTemplatePath() %>", ctx)).toBe(
      ".universal-ai-config/instructions",
    );
    expect(renderEjs("<%= skillTemplatePath() %>", ctx)).toBe(".universal-ai-config/skills");
    expect(renderEjs("<%= agentTemplatePath() %>", ctx)).toBe(".universal-ai-config/agents");
    expect(renderEjs("<%= hookTemplatePath() %>", ctx)).toBe(".universal-ai-config/hooks");
  });

  describe("Codex path helpers — regression tests", () => {
    // Before the fix, all three helpers returned `.codex/<name>` (junk paths
    // that don't match where consolidate actually emits files). These tests
    // pin the helpers to the real emission paths.

    it("skillPath('deploy') for codex returns the .agents/skills path (not .codex/deploy)", () => {
      const result = renderEjs("<%= skillPath('deploy') %>", {
        target: "codex",
        type: "instructions",
        config: DEFAULT_CONFIG,
      });
      expect(result).toBe(".agents/skills/deploy/SKILL.md");
    });

    it("skillPath() for codex returns the .agents/skills directory (not .codex/_)", () => {
      const result = renderEjs("<%= skillPath() %>", {
        target: "codex",
        type: "instructions",
        config: DEFAULT_CONFIG,
      });
      expect(result).toBe(".agents/skills");
    });

    it("agentPath('reviewer') for codex returns .codex/agents/reviewer.toml (not .codex/reviewer)", () => {
      const result = renderEjs("<%= agentPath('reviewer') %>", {
        target: "codex",
        type: "instructions",
        config: DEFAULT_CONFIG,
      });
      expect(result).toBe(".codex/agents/reviewer.toml");
    });

    it("agentPath() for codex returns .codex/agents directory (not .codex/_)", () => {
      const result = renderEjs("<%= agentPath() %>", {
        target: "codex",
        type: "instructions",
        config: DEFAULT_CONFIG,
      });
      expect(result).toBe(".codex/agents");
    });

    it("instructionPath('foo') falls back to AGENTS.md when no templates index is provided", () => {
      const result = renderEjs("<%= instructionPath('foo') %>", {
        target: "codex",
        type: "instructions",
        config: DEFAULT_CONFIG,
      });
      expect(result).toBe("AGENTS.md");
    });

    it("instructionPath('foo') falls back to AGENTS.md when name is not in the index", () => {
      const result = renderEjs("<%= instructionPath('unknown') %>", {
        target: "codex",
        type: "instructions",
        config: DEFAULT_CONFIG,
        templatesIndex: { instructions: new Map() },
      });
      expect(result).toBe("AGENTS.md");
    });

    it("instructionPath() with no name returns '.' for codex (no canonical dir)", () => {
      const result = renderEjs("<%= instructionPath() %>", {
        target: "codex",
        type: "instructions",
        config: DEFAULT_CONFIG,
      });
      expect(result).toBe(".");
    });

    it("instructionPath routes alwaysApply templates to AGENTS.md", () => {
      const index = {
        instructions: new Map([["root-rule", { alwaysApply: true }]]),
      };
      const result = renderEjs("<%= instructionPath('root-rule') %>", {
        target: "codex",
        type: "instructions",
        config: DEFAULT_CONFIG,
        templatesIndex: index,
      });
      expect(result).toBe("AGENTS.md");
    });

    it("instructionPath routes no-globs templates to AGENTS.md", () => {
      const index = {
        instructions: new Map([["bare", {}]]),
      };
      const result = renderEjs("<%= instructionPath('bare') %>", {
        target: "codex",
        type: "instructions",
        config: DEFAULT_CONFIG,
        templatesIndex: index,
      });
      expect(result).toBe("AGENTS.md");
    });

    it("instructionPath routes leading-wildcard globs to AGENTS.md", () => {
      const index = {
        instructions: new Map([["ts-rule", { globs: ["**/*.ts"] }]]),
      };
      const result = renderEjs("<%= instructionPath('ts-rule') %>", {
        target: "codex",
        type: "instructions",
        config: DEFAULT_CONFIG,
        templatesIndex: index,
      });
      expect(result).toBe("AGENTS.md");
    });

    it("instructionPath routes resolvable-prefix globs to <dir>/AGENTS.override.md", () => {
      const index = {
        instructions: new Map([["fe-rule", { globs: ["packages/frontend/**"] }]]),
      };
      const result = renderEjs("<%= instructionPath('fe-rule') %>", {
        target: "codex",
        type: "instructions",
        config: DEFAULT_CONFIG,
        templatesIndex: index,
      });
      expect(result).toBe("packages/frontend/AGENTS.override.md");
    });

    it("instructionPath ignores leading-wildcard globs when a resolvable glob exists", () => {
      const index = {
        instructions: new Map([["mixed", { globs: ["**/*.ts", "src/api/**"] }]]),
      };
      const result = renderEjs("<%= instructionPath('mixed') %>", {
        target: "codex",
        type: "instructions",
        config: DEFAULT_CONFIG,
        templatesIndex: index,
      });
      expect(result).toBe("src/api/AGENTS.override.md");
    });

    it("instructionPath returns the first (alpha-sorted) override path for multi-dir globs", () => {
      const index = {
        instructions: new Map([["multi", { globs: ["src/web/**", "src/api/**"] }]]),
      };
      const result = renderEjs("<%= instructionPath('multi') %>", {
        target: "codex",
        type: "instructions",
        config: DEFAULT_CONFIG,
        templatesIndex: index,
      });
      expect(result).toBe("src/api/AGENTS.override.md");
    });
  });

  describe("skillDirPath helper", () => {
    it("returns the skill directory across all targets when called with name only", () => {
      const cases: Array<["claude" | "copilot" | "cursor" | "codex", string]> = [
        ["claude", ".claude/skills/deploy"],
        ["copilot", ".github/skills/deploy"],
        ["cursor", ".cursor/skills/deploy"],
        ["codex", ".agents/skills/deploy"],
      ];
      for (const [target, expected] of cases) {
        expect(
          renderEjs("<%= skillDirPath('deploy') %>", {
            target,
            type: "skills",
            config: DEFAULT_CONFIG,
          }),
        ).toBe(expected);
      }
    });

    it("appends a relative path inside the skill directory", () => {
      const cases: Array<["claude" | "copilot" | "cursor" | "codex", string]> = [
        ["claude", ".claude/skills/deploy/reference.md"],
        ["copilot", ".github/skills/deploy/reference.md"],
        ["cursor", ".cursor/skills/deploy/reference.md"],
        ["codex", ".agents/skills/deploy/reference.md"],
      ];
      for (const [target, expected] of cases) {
        expect(
          renderEjs("<%= skillDirPath('deploy', 'reference.md') %>", {
            target,
            type: "skills",
            config: DEFAULT_CONFIG,
          }),
        ).toBe(expected);
      }
    });

    it("supports nested relative paths", () => {
      expect(
        renderEjs("<%= skillDirPath('deploy', 'examples/foo.md') %>", {
          target: "claude",
          type: "skills",
          config: DEFAULT_CONFIG,
        }),
      ).toBe(".claude/skills/deploy/examples/foo.md");
      expect(
        renderEjs("<%= skillDirPath('deploy', 'examples/foo.md') %>", {
          target: "codex",
          type: "skills",
          config: DEFAULT_CONFIG,
        }),
      ).toBe(".agents/skills/deploy/examples/foo.md");
    });

    it("ignores config.outputDirs overrides (uses canonical outputDir)", () => {
      const config = {
        ...DEFAULT_CONFIG,
        outputDirs: { ...DEFAULT_CONFIG.outputDirs, claude: "../custom-claude" },
      };
      expect(
        renderEjs("<%= skillDirPath('deploy') %>", {
          target: "claude",
          type: "skills",
          config,
        }),
      ).toBe(".claude/skills/deploy");
      expect(
        renderEjs("<%= skillDirPath('deploy', 'ref.md') %>", {
          target: "claude",
          type: "skills",
          config,
        }),
      ).toBe(".claude/skills/deploy/ref.md");
    });
  });

  it("template path helpers respect custom templatesDir", () => {
    const config = { ...DEFAULT_CONFIG, templatesDir: "custom-ai" };
    const ctx = { target: "claude" as const, type: "instructions" as const, config };
    expect(renderEjs("<%= instructionTemplatePath('foo') %>", ctx)).toBe(
      "custom-ai/instructions/foo.md",
    );
    expect(renderEjs("<%= hookTemplatePath() %>", ctx)).toBe("custom-ai/hooks");
  });

  describe("mcpToolRef helper", () => {
    const render = (target: "claude" | "copilot" | "cursor" | "codex", expr: string) =>
      renderEjs(`<%= ${expr} %>`, { target, type: "instructions", config: DEFAULT_CONFIG });

    it("returns double-underscore syntax for claude (specific tool)", () => {
      expect(render("claude", "mcpToolRef('github', 'list_issues')")).toBe(
        "mcp__github__list_issues",
      );
    });

    it("returns double-underscore wildcard for claude (no tool)", () => {
      expect(render("claude", "mcpToolRef('github')")).toBe("mcp__github__*");
    });

    it("returns double-underscore syntax for codex (specific tool)", () => {
      expect(render("codex", "mcpToolRef('github', 'list_issues')")).toBe(
        "mcp__github__list_issues",
      );
    });

    it("returns regex wildcard for codex (no tool)", () => {
      expect(render("codex", "mcpToolRef('github')")).toBe("mcp__github__.*");
    });

    it("returns slash syntax for copilot (specific tool)", () => {
      expect(render("copilot", "mcpToolRef('github', 'list_issues')")).toBe("github/list_issues");
    });

    it("returns slash wildcard for copilot (no tool)", () => {
      expect(render("copilot", "mcpToolRef('github')")).toBe("github/*");
    });

    it("returns MCP-colon syntax for cursor (specific tool)", () => {
      expect(render("cursor", "mcpToolRef('github', 'list_issues')")).toBe("MCP:list_issues");
    });

    it("returns MCP regex wildcard for cursor (no tool)", () => {
      expect(render("cursor", "mcpToolRef('github')")).toBe("MCP:.*");
    });
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
