import { readdir, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative, sep } from "node:path";
import { normalizeDocName } from "../parser.js";
import {
  displayPathFor,
  excludePathsFor,
  resolveTemplateSources,
  type TemplateSource,
} from "../template-sources.js";
import type { InMemoryTemplate, ResolvedConfig, Target, TemplateType } from "../../types.js";

/** Normalize path separators to forward slashes for glob matching */
function toPosix(p: string): string {
  return sep === "/" ? p : p.split(sep).join("/");
}

interface ExtraFile {
  /** Path relative to the skill directory, e.g. "references/example.md" */
  relativePath: string;
  /** Absolute path to the file on disk ("" for in-memory files) */
  filePath: string;
  /** In-memory content — when present, the file is not read from disk */
  content?: string | Uint8Array;
  /** Permission bits, recorded only when the source is executable */
  mode?: number;
}

export interface DiscoveredTemplate {
  name: string;
  type: TemplateType;
  /** Absolute path on disk ("" for in-memory templates) */
  filePath: string;
  /** Path relative to project root (used as sourcePath in GeneratedFile) */
  relativePath: string;
  /** Path relative to the containing templates dir, e.g. "instructions/foo.md" (used for exclude matching) */
  templateRelativePath: string;
  /** Every spelling `exclude` may address this candidate by — see `excludePathsFor` */
  excludePaths: string[];
  /** Source-qualified path, e.g. "shared-templates/instructions/foo.md" — for shadow reports */
  displayPath: string;
  /** The source dir as written in config, e.g. "shared-templates" ("" for in-memory) */
  sourceId: string;
  /** Extra files in skill directories (beyond SKILL.md) */
  extraFiles?: ExtraFile[];
  /** In-memory content — when present, the file is not read from disk */
  content?: string;
}

/**
 * All candidates competing for one identity (`type` + `name`), in precedence
 * order: `templatesDir`, then each `additionalTemplateDirs` entry, then
 * in-memory templates. The winner is picked per target, after `exclude`.
 */
export interface TemplateSlot {
  type: TemplateType;
  name: string;
  candidates: DiscoveredTemplate[];
  winnerByTarget: Map<Target, DiscoveredTemplate | undefined>;
}

export interface DiscoveredJsonFile {
  filePath: string;
  /** Path relative to templates dir, e.g. "hooks/basic.json" */
  templateRelativePath: string;
  /** Every spelling `exclude` may address this candidate by — see `excludePathsFor` */
  excludePaths: string[];
  /** Source-qualified path, e.g. "shared-templates/hooks/basic.json" — for shadow reports */
  displayPath: string;
  /** The source dir as written in config, e.g. "shared-templates" */
  sourceId: string;
}

/** All JSON files competing for one basename, in precedence order. */
export interface JsonSlot {
  name: string;
  candidates: DiscoveredJsonFile[];
}

/**
 * The permission bits to carry over to the output, or `undefined` when the
 * file has no exec bit — plain files are written with the default mode.
 */
function executableMode(mode: number): number | undefined {
  return (mode & 0o111) !== 0 ? mode & 0o777 : undefined;
}

/** Recursively collect all files in a directory, returning paths relative to the base dir */
async function collectFiles(dir: string, base: string = dir): Promise<ExtraFile[]> {
  const results: ExtraFile[] = [];
  const entries = await readdir(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = await stat(fullPath);
    if (stats.isDirectory()) {
      results.push(...(await collectFiles(fullPath, base)));
    } else if (stats.isFile()) {
      results.push({
        relativePath: toPosix(relative(base, fullPath)),
        filePath: fullPath,
        mode: executableMode(stats.mode),
      });
    }
  }
  return results;
}

async function isDirectory(path: string): Promise<boolean> {
  const stats = await stat(path).catch(() => undefined);
  return stats?.isDirectory() ?? false;
}

/**
 * Index the reference docs under each template source's `docs/` folder for
 * `docPath()`. Docs are never generated or loaded automatically — agents read
 * them on demand through the links `docPath()` renders. The first source to
 * declare a name wins, the same precedence as every template type.
 */
export async function buildDocsIndex(
  root: string,
  config: ResolvedConfig,
): Promise<Map<string, string>> {
  const docs = new Map<string, string>();
  for (const source of resolveTemplateSources(root, config)) {
    const docsDir = join(source.dir, "docs");
    if (!(await isDirectory(docsDir))) continue;

    const files = await collectFiles(docsDir);
    files.sort((a, b) => (a.relativePath < b.relativePath ? -1 : 1));
    for (const file of files) {
      const key = normalizeDocName(file.relativePath);
      if (docs.has(key)) continue;
      const fromRoot = relative(root, file.filePath);
      const insideRoot =
        fromRoot !== "" &&
        fromRoot !== ".." &&
        !fromRoot.startsWith(`..${sep}`) &&
        !isAbsolute(fromRoot);
      docs.set(key, insideRoot ? toPosix(fromRoot) : file.filePath);
    }
  }
  return docs;
}

/**
 * Collect every candidate for every identity, grouped into slots in precedence
 * order. Nothing is dropped here — a name collision is resolved per target,
 * once `exclude` is known (see `resolveWinners`).
 *
 * Slot order follows first-discovery order, so for a project with no collisions
 * the emitted file order is identical to scanning a flat list. In-memory
 * templates come last: a file always outranks them, but one can still win a
 * name every file candidate was excluded from.
 */
export async function discoverTemplates(
  root: string,
  config: ResolvedConfig,
  inMemory: InMemoryTemplate[] = [],
): Promise<Map<string, TemplateSlot>> {
  const slots = new Map<string, TemplateSlot>();

  function addCandidate(type: TemplateType, name: string, candidate: DiscoveredTemplate): void {
    const key = `${type}:${name}`;
    let slot = slots.get(key);
    if (!slot) {
      slot = { type, name, candidates: [], winnerByTarget: new Map() };
      slots.set(key, slot);
    }
    slot.candidates.push(candidate);
  }

  async function scanDir(source: TemplateSource) {
    for (const type of config.types) {
      // Hooks and MCP are handled separately — they use JSON, not markdown templates
      if (type === "hooks" || type === "mcp") continue;

      const typeDir = join(source.dir, type);
      if (!(await isDirectory(typeDir))) continue;

      // Sorted because readdir order is filesystem-dependent, and precedence
      // must not change between machines.
      const entries = (await readdir(typeDir)).sort();

      if (type === "skills") {
        // Skills are folders, each containing SKILL.md + optional extra files.
        for (const entry of entries) {
          const skillDir = join(typeDir, entry);
          if (!(await isDirectory(skillDir))) continue;
          const skillFile = join(skillDir, "SKILL.md");
          const skillStats = await stat(skillFile).catch(() => undefined);
          // No SKILL.md in this folder — the name stays unclaimed, so a
          // lower-precedence dir with a real skill can still win it
          if (!skillStats?.isFile()) continue;

          const extraFiles = (await collectFiles(skillDir)).filter(
            (f) => f.relativePath !== "SKILL.md",
          );
          const templateRelativePath = toPosix(relative(source.dir, skillFile));

          addCandidate(type, entry, {
            name: entry,
            type,
            filePath: skillFile,
            relativePath: relative(root, skillFile),
            templateRelativePath,
            excludePaths: excludePathsFor(source, root, templateRelativePath),
            displayPath: displayPathFor(source, templateRelativePath),
            sourceId: source.id,
            extraFiles: extraFiles.length > 0 ? extraFiles : undefined,
          });
        }
        continue;
      }

      // Instructions and agents are flat .md files
      for (const entry of entries) {
        if (!entry.endsWith(".md")) continue;
        const name = basename(entry, ".md");

        const filePath = join(typeDir, entry);
        const fileStats = await stat(filePath);
        if (!fileStats.isFile()) continue;

        const templateRelativePath = toPosix(relative(source.dir, filePath));
        addCandidate(type, name, {
          name,
          type,
          filePath,
          relativePath: relative(root, filePath),
          templateRelativePath,
          excludePaths: excludePathsFor(source, root, templateRelativePath),
          displayPath: displayPathFor(source, templateRelativePath),
          sourceId: source.id,
        });
      }
    }
  }

  // Main dir first, then additional dirs in order — this is the precedence chain
  for (const source of resolveTemplateSources(root, config)) {
    await scanDir(source);
  }

  for (const inMem of inMemory) {
    const relativePath =
      inMem.type === "skills" ? `skills/${inMem.name}/SKILL.md` : `${inMem.type}/${inMem.name}.md`;
    addCandidate(inMem.type, inMem.name, {
      name: inMem.name,
      type: inMem.type,
      filePath: "",
      relativePath,
      templateRelativePath: relativePath,
      // No source dir to qualify with, so only the unqualified path addresses it
      excludePaths: [relativePath],
      displayPath: relativePath,
      sourceId: "",
      content: inMem.content,
      extraFiles: inMem.extraFiles?.map((ef) => ({
        relativePath: ef.relativePath,
        filePath: "",
        content: ef.content,
        mode: ef.mode,
      })),
    });
  }

  return slots;
}

/**
 * Discover `hooks/*.json` or `mcp/*.json` across every source dir, grouped by
 * basename. Files with *different* basenames all merge downstream — the slot
 * only resolves same-named files, where the highest-precedence one wins whole.
 */
export async function discoverJsonFiles(
  root: string,
  config: ResolvedConfig,
  type: "hooks" | "mcp",
): Promise<Map<string, JsonSlot>> {
  const slots = new Map<string, JsonSlot>();

  async function scanDir(source: TemplateSource) {
    const typeDir = join(source.dir, type);
    if (!(await isDirectory(typeDir))) return;

    // Sorted: within one dir, this order decides which file's declaration of a
    // shared server name (or an identical handler) wins.
    const entries = (await readdir(typeDir)).sort();
    for (const file of entries) {
      if (!file.endsWith(".json")) continue;
      const templateRelativePath = toPosix(join(type, file));
      let slot = slots.get(file);
      if (!slot) {
        slot = { name: file, candidates: [] };
        slots.set(file, slot);
      }
      slot.candidates.push({
        filePath: join(typeDir, file),
        templateRelativePath,
        excludePaths: excludePathsFor(source, root, templateRelativePath),
        displayPath: displayPathFor(source, templateRelativePath),
        sourceId: source.id,
      });
    }
  }

  // Main dir first, then additional dirs in order — this is the precedence chain
  for (const source of resolveTemplateSources(root, config)) {
    await scanDir(source);
  }

  return slots;
}
