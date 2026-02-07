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

function buildPathHelpers(target: Target) {
  const targetDef = targets[target];
  const outputDir = targetDef?.outputDir ?? "";

  return {
    instructionPath: (name: string) => {
      const tc = targetDef?.instructions;
      if (!tc) return join(outputDir, `instructions/${name}.md`);
      return join(outputDir, tc.getOutputPath(name, {} as UniversalFrontmatter));
    },
    skillPath: (name: string) => {
      const tc = targetDef?.skills;
      if (!tc) return join(outputDir, `skills/${name}/SKILL.md`);
      return join(outputDir, tc.getOutputPath(name, {} as UniversalFrontmatter));
    },
    agentPath: (name: string) => {
      const tc = targetDef?.agents;
      if (!tc) return join(outputDir, `agents/${name}.md`);
      return join(outputDir, tc.getOutputPath(name, {} as UniversalFrontmatter));
    },
  };
}

export function renderEjs(template: string, context: RenderContext): string {
  const pathHelpers = buildPathHelpers(context.target);
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
