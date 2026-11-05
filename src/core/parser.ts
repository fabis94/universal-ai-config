import { parse as parseYAML } from "yaml";
import ejs from "ejs";
import { extname, join, posix } from "node:path";
import { createLocator, toPosixPath, type Locator } from "./plan/locate.js";
import type { ResolvedConfig, Target, TemplateType, UniversalFrontmatter } from "../types.js";

interface ParsedTemplate {
  frontmatter: UniversalFrontmatter;
  body: string;
}

export interface TemplatesIndex {
  instructions: Map<string, UniversalFrontmatter>;
  /**
   * Reference docs found under `<source>/docs/` across every template source,
   * first source wins. Key is the doc name (`uac/hooks` for `docs/uac/hooks.md`),
   * value is the path to print: root-relative when the doc is inside the
   * project, absolute when it lives in a template dir outside it.
   */
  docs?: Map<string, string>;
  /** Names passed to `docPath()` that matched no doc — collected for a warning */
  missingDocs?: Set<string>;
}

interface RenderContext {
  target: Target;
  type: TemplateType;
  config: ResolvedConfig;
  templatesIndex?: TemplatesIndex;
  /** Output path computation; built from `config` when omitted */
  locator?: Locator;
  /** Targets that will read the output (exposed to EJS as `consumers`); defaults to `[target]` */
  consumers?: Target[];
}

export function parseFrontmatter(content: string): ParsedTemplate {
  // Normalize CRLF (Windows) and CR (old Mac) to LF for cross-platform compatibility
  const normalized = content.replace(/\r\n?/g, "\n");

  // Match frontmatter delimited by --- at the start of the file
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = normalized.match(frontmatterRegex);

  if (!match) {
    // No frontmatter - return empty data and full content as body
    return { frontmatter: {} as UniversalFrontmatter, body: normalized };
  }

  const yamlContent = match[1] ?? "";
  const body = match[2] ?? "";
  const frontmatter = (yamlContent ? parseYAML(yamlContent) : {}) as UniversalFrontmatter;

  return { frontmatter, body };
}

/** Normalize a `docPath()` argument to its index key: forward slashes, no `./`, no `.md`. */
export function normalizeDocName(name: string): string {
  let key = name.split("\\").join("/");
  while (key.startsWith("./")) key = key.slice(2);
  return key.replace(/\.md$/, "");
}

function buildPathHelpers(
  target: Target,
  config: ResolvedConfig,
  locator: Locator,
  templatesIndex?: TemplatesIndex,
) {
  const { templatesDir } = config;
  const instructionFrontmatter = (name: string): UniversalFrontmatter =>
    templatesIndex?.instructions.get(name) ?? ({} as UniversalFrontmatter);
  const noFrontmatter = {} as UniversalFrontmatter;

  return {
    instructionPath: (name?: string) =>
      name
        ? locator.templatePath(target, "instructions", name, instructionFrontmatter(name))
        : locator.typeDir(target, "instructions"),
    skillPath: (name?: string) =>
      name
        ? locator.templatePath(target, "skills", name, noFrontmatter)
        : locator.typeDir(target, "skills"),
    skillDirPath: (name: string, relativePath?: string) => {
      const dir = locator.skillDir(target, name);
      return relativePath ? posix.join(dir, toPosixPath(relativePath)) : dir;
    },
    agentPath: (name?: string) =>
      name
        ? locator.templatePath(target, "agents", name, noFrontmatter)
        : locator.typeDir(target, "agents"),
    instructionTemplatePath: (name?: string) =>
      name ? join(templatesDir, `instructions/${name}.md`) : join(templatesDir, "instructions"),
    skillTemplatePath: (name?: string) =>
      name ? join(templatesDir, `skills/${name}/SKILL.md`) : join(templatesDir, "skills"),
    agentTemplatePath: (name?: string) =>
      name ? join(templatesDir, `agents/${name}.md`) : join(templatesDir, "agents"),
    hookTemplatePath: (name?: string) =>
      name ? join(templatesDir, `hooks/${name}.json`) : join(templatesDir, "hooks"),
    mcpTemplatePath: (name?: string) =>
      name ? join(templatesDir, `mcp/${name}.json`) : join(templatesDir, "mcp"),
    docPath: (name?: string) => {
      if (!name) return join(templatesDir, "docs");
      const key = normalizeDocName(name);
      const found = templatesIndex?.docs?.get(key);
      if (found) return found;
      templatesIndex?.missingDocs?.add(key);
      return join(templatesDir, "docs", extname(key) ? key : `${key}.md`);
    },
    mcpToolRef: (server: string, tool?: string): string => {
      switch (target) {
        case "claude":
          return tool ? `mcp__${server}__${tool}` : `mcp__${server}__*`;
        case "codex":
          return tool ? `mcp__${server}__${tool}` : `mcp__${server}__.*`;
        case "copilot":
          return tool ? `${server}/${tool}` : `${server}/*`;
        case "cursor":
          return tool ? `MCP:${tool}` : `MCP:.*`;
      }
    },
  };
}

export function renderEjs(template: string, context: RenderContext): string {
  const pathHelpers = buildPathHelpers(
    context.target,
    context.config,
    context.locator ?? createLocator(context.config),
    context.templatesIndex,
  );
  return ejs.render(
    template,
    {
      target: context.target,
      type: context.type,
      config: context.config,
      consumers: context.consumers ?? [context.target],
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
