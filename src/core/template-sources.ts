import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { safePath } from "./safe-path.js";
import type { ResolvedConfig } from "../types.js";

/** One directory templates are discovered from, in precedence order. */
export interface TemplateSource {
  /** Absolute path on disk */
  dir: string;
  /**
   * The directory as written in config, normalized — `".universal-ai-config"`,
   * `"shared-templates"`, `"~/.universal-ai-config"`. Used to prefix template
   * paths in `exclude` patterns and in shadow reports. Empty when the source
   * has no meaningful prefix (an in-memory template, or `templatesDir: "."`).
   */
  id: string;
  /** 0 = `templatesDir`, 1..n = `additionalTemplateDirs` in order */
  rank: number;
}

/** Normalize path separators to forward slashes */
function toPosix(p: string): string {
  return sep === "/" ? p : p.split(sep).join("/");
}

/**
 * Normalize a directory string into a source id: forward slashes, no `./`
 * prefix, no trailing slash. `"."` normalizes to `""` — it prefixes nothing.
 */
export function normalizeSourceId(dir: string): string {
  let id = dir.split("\\").join("/");
  while (id.startsWith("./")) id = id.slice(2);
  while (id.length > 1 && id.endsWith("/")) id = id.slice(0, -1);
  return id === "." ? "" : id;
}

/** Resolve a template dir path: expands `~` and resolves relative paths against root */
export function resolveSourceDir(root: string, dir: string): string {
  const expanded = dir.startsWith("~") ? join(homedir(), dir.slice(1)) : dir;
  return isAbsolute(expanded) ? expanded : resolve(root, expanded);
}

/** Build the precedence-ordered source list: main `templatesDir` first, then additional dirs. */
export function resolveTemplateSources(root: string, config: ResolvedConfig): TemplateSource[] {
  const sources: TemplateSource[] = [
    {
      dir: safePath(root, config.templatesDir),
      id: normalizeSourceId(config.templatesDir),
      rank: 0,
    },
  ];
  for (const [index, dir] of config.additionalTemplateDirs.entries()) {
    sources.push({
      dir: resolveSourceDir(root, dir),
      id: normalizeSourceId(dir),
      rank: index + 1,
    });
  }
  return sources;
}

/**
 * Every spelling an `exclude` pattern may use to address one template.
 *
 * The unqualified path (`"instructions/foo.md"`) matches the template in *every*
 * source dir — the original behavior. The source-qualified forms address one
 * specific copy, which is what makes unshadowing possible. All equivalent
 * spellings of the same directory are accepted so the format a pattern is
 * written in never matters: as written in config, absolute, `~`-relative, and
 * project-root-relative all resolve to the same candidate.
 */
export function excludePathsFor(
  source: TemplateSource,
  root: string,
  templateRelativePath: string,
): string[] {
  const paths = new Set<string>([templateRelativePath]);

  const addPrefix = (prefix: string): void => {
    const normalized = normalizeSourceId(prefix);
    if (normalized) paths.add(`${normalized}/${templateRelativePath}`);
  };

  addPrefix(source.id);
  addPrefix(toPosix(source.dir));

  const fromHome = relative(homedir(), source.dir);
  if (fromHome && !fromHome.startsWith("..") && !isAbsolute(fromHome)) {
    addPrefix(`~/${toPosix(fromHome)}`);
  }

  const fromRoot = relative(root, source.dir);
  if (fromRoot && !fromRoot.startsWith("..") && !isAbsolute(fromRoot)) {
    addPrefix(toPosix(fromRoot));
  }

  return [...paths];
}

/** The path shown in shadow reports — source-qualified when the source has an id. */
export function displayPathFor(source: TemplateSource, templateRelativePath: string): string {
  return source.id ? `${source.id}/${templateRelativePath}` : templateRelativePath;
}
