import matter from "gray-matter";
import ejs from "ejs";
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

export function renderEjs(template: string, context: RenderContext): string {
  return ejs.render(
    template,
    {
      target: context.target,
      type: context.type,
      config: context.config,
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
