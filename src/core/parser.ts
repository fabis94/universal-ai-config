import matter from "gray-matter";
import ejs from "ejs";
import { join } from "node:path";
import { targets } from "../targets/index.js";
import type { ResolvedConfig, Target, TemplateType, UniversalFrontmatter } from "../types.js";

interface ParsedTemplate {
  frontmatter: UniversalFrontmatter;
  body: string;
}

interface RenderContext {
  target: Target;
  type: TemplateType;
  config: ResolvedConfig;
}

export function parseFrontmatter(content: string): ParsedTemplate {
  const { data, content: body } = matter(content);
  return {
    frontmatter: data as UniversalFrontmatter,
    body,
  };
}

function buildPathHelpers(target: Target, templatesDir: string) {
  const targetDef = targets[target];
  const outputDir = targetDef?.outputDir ?? "";

  function outputTypeDir(
    tc: { getOutputPath: (name: string, fm: UniversalFrontmatter) => string } | undefined,
    fallback: string,
  ): string {
    if (!tc) return join(outputDir, fallback);
    const firstSegment = tc.getOutputPath("_", {} as UniversalFrontmatter).split("/")[0] ?? "";
    return join(outputDir, firstSegment);
  }

  return {
    instructionPath: (name?: string) => {
      const tc = targetDef?.instructions;
      if (!name) return outputTypeDir(tc, "instructions");
      if (!tc) return join(outputDir, `instructions/${name}.md`);
      return join(outputDir, tc.getOutputPath(name, {} as UniversalFrontmatter));
    },
    skillPath: (name?: string) => {
      const tc = targetDef?.skills;
      if (!name) return outputTypeDir(tc, "skills");
      if (!tc) return join(outputDir, `skills/${name}/SKILL.md`);
      return join(outputDir, tc.getOutputPath(name, {} as UniversalFrontmatter));
    },
    agentPath: (name?: string) => {
      const tc = targetDef?.agents;
      if (!name) return outputTypeDir(tc, "agents");
      if (!tc) return join(outputDir, `agents/${name}.md`);
      return join(outputDir, tc.getOutputPath(name, {} as UniversalFrontmatter));
    },
    instructionTemplatePath: (name?: string) =>
      name ? join(templatesDir, `instructions/${name}.md`) : join(templatesDir, "instructions"),
    skillTemplatePath: (name?: string) =>
      name ? join(templatesDir, `skills/${name}/SKILL.md`) : join(templatesDir, "skills"),
    agentTemplatePath: (name?: string) =>
      name ? join(templatesDir, `agents/${name}.md`) : join(templatesDir, "agents"),
    hookTemplatePath: (name?: string) =>
      name ? join(templatesDir, `hooks/${name}.json`) : join(templatesDir, "hooks"),
  };
}

export function renderEjs(template: string, context: RenderContext): string {
  const pathHelpers = buildPathHelpers(context.target, context.config.templatesDir);
  return ejs.render(
    template,
    {
      target: context.target,
      type: context.type,
      config: context.config,
      ...pathHelpers,
      ...context.config.variables,
    },
    { async: false },
  );
}

export function parseTemplate(content: string, context: RenderContext): ParsedTemplate {
  const { frontmatter, body } = parseFrontmatter(content);
  const renderedBody = renderEjs(body, context);
  return { frontmatter, body: renderedBody };
}
