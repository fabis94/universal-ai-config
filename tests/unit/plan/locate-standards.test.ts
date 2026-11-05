import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../../src/config/defaults.js";
import { renderEjs } from "../../../src/core/parser.js";
import { buildPlan } from "../../../src/core/plan/build-plan.js";
import { createLocator, type Locator } from "../../../src/core/plan/locate.js";
import type {
  ResolvedConfig,
  StandardsSetting,
  Target,
  UniversalFrontmatter,
} from "../../../src/types.js";

const ALL_TARGETS: Target[] = ["claude", "copilot", "cursor", "codex"];
const config = (standards: StandardsSetting, extra: Partial<ResolvedConfig> = {}) => ({
  ...DEFAULT_CONFIG,
  standards,
  ...extra,
});
const fm = (value: Partial<UniversalFrontmatter>) => value as UniversalFrontmatter;

/** Both ways a locator is built: from facts alone, and for a run's plan. */
function locators(c: ResolvedConfig): Array<[string, Locator]> {
  return [
    ["without a plan", createLocator(c)],
    ["with a plan", createLocator(c, buildPlan({ ...c, targets: ALL_TARGETS }))],
  ];
}

describe("locator — template mode", () => {
  it("skills go to each tool's own folder; only codex reads AGENTS.md without a plan", () => {
    const locator = createLocator(config(false));
    expect(locator.sourced.size).toBe(0);
    expect(locator.templatePath("cursor", "skills", "x", fm({}))).toBe(".cursor/skills/x/SKILL.md");
    expect(locator.templatePath("codex", "skills", "x", fm({}))).toBe(".agents/skills/x/SKILL.md");
    expect(locator.usesAgentsMd("claude")).toBe(false);
    expect(locator.usesAgentsMd("codex")).toBe(true);
  });
});

describe("locator — standards mode", () => {
  for (const [how, locator] of locators(config(true))) {
    it(`skills point at .agents/skills for readers, at the copy for claude (${how})`, () => {
      for (const target of ["copilot", "cursor", "codex"] as const) {
        expect(locator.templatePath(target, "skills", "x", fm({}))).toBe(
          ".agents/skills/x/SKILL.md",
        );
        expect(locator.typeDir(target, "skills")).toBe(".agents/skills");
        expect(locator.skillDir(target, "x")).toBe(".agents/skills/x");
      }
      expect(locator.templatePath("claude", "skills", "x", fm({}))).toBe(
        ".claude/skills/x/SKILL.md",
      );
      expect(locator.typeDir("claude", "skills")).toBe(".claude/skills");
    });

    it(`every target's instructions are the AGENTS.md files (${how})`, () => {
      for (const target of ALL_TARGETS) {
        expect(locator.usesAgentsMd(target)).toBe(true);
        expect(locator.typeDir(target, "instructions")).toBe("AGENTS.md");
      }
    });
  }

  it("routes by folder (nested), whatever agentsMd.variation says", () => {
    const locator = createLocator(
      config("instructions", { agentsMd: { ...DEFAULT_CONFIG.agentsMd, variation: "index" } }),
    );
    expect(
      locator.templatePath("claude", "instructions", "web", fm({ globs: ["packages/web/**"] })),
    ).toBe("packages/web/AGENTS.md");
    expect(locator.templatePath("cursor", "instructions", "all", fm({ alwaysApply: true }))).toBe(
      "AGENTS.md",
    );
  });

  it('"skills" leaves instructions on template-mode routing', () => {
    const locator = createLocator(config("skills"));
    expect(locator.usesAgentsMd("claude")).toBe(false);
    expect(locator.templatePath("claude", "instructions", "x", fm({}))).toBe(".claude/rules/x.md");
  });
});

describe("path helpers in EJS", () => {
  const render = (template: string, target: Target, standards: StandardsSetting) =>
    renderEjs(template, { target, type: "agents", config: config(standards) });

  it("template mode: template paths are in the templates dir", () => {
    expect(render("<%= skillTemplatePath('x') %>", "claude", false)).toBe(
      ".universal-ai-config/skills/x/SKILL.md",
    );
    expect(render("<%= instructionTemplatePath() %>", "claude", false)).toBe(
      ".universal-ai-config/instructions",
    );
  });

  it("standards mode: a skill's source is in .agents/skills, the instructions' in AGENTS.md", () => {
    for (const target of ALL_TARGETS) {
      expect(render("<%= skillTemplatePath('x') %>", target, true)).toBe(
        ".agents/skills/x/SKILL.md",
      );
      expect(render("<%= skillTemplatePath() %>", target, true)).toBe(".agents/skills");
      expect(render("<%= instructionTemplatePath() %>", target, true)).toBe("AGENTS.md");
      expect(render("<%= instructionPath() %>", target, true)).toBe("AGENTS.md");
    }
    expect(render("<%= skillPath('x') %>", "claude", true)).toBe(".claude/skills/x/SKILL.md");
    expect(render("<%= skillPath('x') %>", "cursor", true)).toBe(".agents/skills/x/SKILL.md");
    // Other helpers are unaffected
    expect(render("<%= hookTemplatePath('h') %>", "claude", true)).toBe(
      ".universal-ai-config/hooks/h.json",
    );
  });
});
