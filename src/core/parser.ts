import { parse as parseYAML } from "yaml";
import ejs from "ejs";
import { extname, join } from "node:path";
import { targets } from "../targets/index.js";
import { getCodexInstructionEmissionPaths } from "../targets/codex/instruction-routing.js";
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

function buildPathHelpers(target: Target, templatesDir: string, templatesIndex?: TemplatesIndex) {
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
      // Codex consolidates instructions into AGENTS.md or <dir>/AGENTS.override.md
      // outside outputDir; the per-name routing depends on the template's frontmatter.
      if (target === "codex") {
        if (!name) return ".";
        const fm = templatesIndex?.instructions.get(name);
        if (!fm) return "AGENTS.md";
        const paths = getCodexInstructionEmissionPaths(fm);
        return paths[0] ?? "AGENTS.md";
      }
      const tc = targetDef?.instructions;
      if (!name) return outputTypeDir(tc, "instructions");
      if (!tc) return join(outputDir, `instructions/${name}.md`);
      return join(outputDir, tc.getOutputPath(name, {} as UniversalFrontmatter));
    },
    skillPath: (name?: string) => {
      // Codex emits skills at root-relative .agents/skills/<name>/SKILL.md
      // (outside outputDir, per the open Agent Skills standard).
      if (target === "codex") {
        return name ? `.agents/skills/${name}/SKILL.md` : ".agents/skills";
      }
      const tc = targetDef?.skills;
      if (!name) return outputTypeDir(tc, "skills");
      if (!tc) return join(outputDir, `skills/${name}/SKILL.md`);
      return join(outputDir, tc.getOutputPath(name, {} as UniversalFrontmatter));
    },
    skillDirPath: (name: string, relativePath?: string) => {
      let dir: string;
      if (target === "codex") {
        dir = `.agents/skills/${name}`;
      } else {
        const tc = targetDef?.skills;
        const skillFile = !tc
          ? join(outputDir, `skills/${name}/SKILL.md`)
          : join(outputDir, tc.getOutputPath(name, {} as UniversalFrontmatter));
        // invariant: every non-codex skills.getOutputPath ends in /SKILL.md
        dir = skillFile.replace(/\/SKILL\.md$/, "");
      }
      return relativePath ? join(dir, relativePath) : dir;
    },
    agentPath: (name?: string) => {
      // Codex emits each agent as .codex/agents/<name>.toml (the codex
      // getOutputPath returns only the bare name as a consolidate sentinel).
      if (target === "codex") {
        return name ? `.codex/agents/${name}.toml` : ".codex/agents";
      }
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
    context.config.templatesDir,
    context.templatesIndex,
  );
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
