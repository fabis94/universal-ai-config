import type { Reporter } from "../diagnostics.js";
import type { AgentsMdVariation, UniversalFrontmatter } from "../../types.js";
import { classify, type DirScope, type Route } from "./routing.js";

export const AGENTS_MD = "AGENTS.md";

/** One instruction template, rendered for the AGENTS.md view target. */
export interface AgentsMdEntry {
  name: string;
  sourcePath: string;
  frontmatter: UniversalFrontmatter;
  /** EJS-rendered body */
  body: string;
}

/** Which part of a file a section belongs to. Root files list `index`, then `pattern`, then `always`. */
export type SectionRole = "always" | "pattern" | "scoped";

export interface Section {
  name: string;
  sourcePath: string;
  heading: string;
  /** One-line scope note, when the file's location doesn't say the scope by itself */
  note?: string;
  body: string;
  role: SectionRole;
}

/** A line in the root file's "Scoped instructions" index. */
export interface IndexLink {
  name: string;
  dirs: string[];
  file: string;
}

type Placement =
  | { kind: "section"; file: string; section: Section }
  | { kind: "link"; link: IndexLink };

export interface LayoutOptions {
  variation: AgentsMdVariation;
  /** Root-relative POSIX folder for the `index` variation's scoped files */
  indexDir: string;
}

/**
 * Template names whose index file would be one a tool loads on its own
 * (`<indexDir>/AGENTS.md` is a nested AGENTS.md to Claude, Cursor and Copilot).
 */
const TOOL_LOADED_NAMES = new Set(["agents", "agents.override", "claude", "claude.local"]);

function quoteList(items: string[]): string {
  const quoted = items.map((item) => `\`${item}\``);
  if (quoted.length <= 1) return quoted.join("");
  return `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)}`;
}

/** "Applies to files in `a/` and files matching `**\/*.ts`." — or undefined when there's nothing to say. */
export function scopeNote(dirs: string[], globs: string[]): string | undefined {
  const parts: string[] = [];
  if (dirs.length > 0) parts.push(`files in ${quoteList(dirs.map((dir) => `${dir}/`))}`);
  if (globs.length > 0) parts.push(`files matching ${quoteList(globs)}`);
  return parts.length > 0 ? `Applies to ${parts.join(" and ")}.` : undefined;
}

/** The note for one folder file: none when its globs cover the whole folder. */
function dirNote(scope: DirScope): string | undefined {
  return scope.whole ? undefined : scopeNote([], scope.globs);
}

/** The note for one root section covering every scope of a route. */
function routeNote(route: Route): string | undefined {
  switch (route.kind) {
    case "always":
      return undefined;
    case "pattern":
      return scopeNote([], route.globs);
    case "dirs":
      return scopeNote(
        route.dirs.filter((scope) => scope.whole).map((scope) => scope.dir),
        [
          ...route.dirs.filter((scope) => !scope.whole).flatMap((scope) => scope.globs),
          ...route.residual,
        ],
      );
  }
}

function makeSection(entry: AgentsMdEntry, role: SectionRole, note: string | undefined): Section {
  return {
    name: entry.name,
    sourcePath: entry.sourcePath,
    heading: entry.frontmatter.description?.trim() || entry.name,
    note,
    body: entry.body,
    role,
  };
}

/** Everything goes into the root file, with a note for scoped templates. */
function placeInRoot(entry: AgentsMdEntry, route: Route): Placement[] {
  const role: SectionRole = route.kind === "always" ? "always" : "pattern";
  return [
    { kind: "section", file: AGENTS_MD, section: makeSection(entry, role, routeNote(route)) },
  ];
}

/** The file the `index` variation writes a scoped template to. */
function indexFilePath(indexDir: string, name: string): string {
  return `${indexDir}/${name}.md`;
}

function isToolLoadedName(name: string): boolean {
  return TOOL_LOADED_NAMES.has(name.toLowerCase());
}

/**
 * Where one template's content goes for a variation. A template can land in
 * several files (one per folder, plus the root for globs with no folder).
 */
export function place(
  entry: AgentsMdEntry,
  options: LayoutOptions,
  report?: Reporter,
): Placement[] {
  const route = classify(entry.name, entry.frontmatter, report);
  if (route.kind !== "dirs" || options.variation === "concatenate") {
    return placeInRoot(entry, route);
  }

  const residual: Placement[] =
    route.residual.length > 0
      ? [
          {
            kind: "section",
            file: AGENTS_MD,
            section: makeSection(entry, "pattern", scopeNote([], route.residual)),
          },
        ]
      : [];

  if (options.variation === "nested") {
    return [
      ...route.dirs.map(
        (scope): Placement => ({
          kind: "section",
          file: `${scope.dir}/${AGENTS_MD}`,
          section: makeSection(entry, "scoped", dirNote(scope)),
        }),
      ),
      ...residual,
    ];
  }

  // index
  if (isToolLoadedName(entry.name)) {
    report?.({
      code: "suspicious-value",
      message: `instruction "${entry.name}": an index file named ${entry.name}.md would be loaded by tools on their own; inlining it in the root AGENTS.md instead`,
      source: entry.sourcePath,
      detail: { field: "name", value: entry.name },
    });
    return placeInRoot(entry, route);
  }
  const file = indexFilePath(options.indexDir, entry.name);
  const partial = route.dirs.filter((scope) => !scope.whole).flatMap((scope) => scope.globs);
  return [
    {
      kind: "link",
      link: { name: entry.name, dirs: route.dirs.map((scope) => scope.dir), file },
    },
    { kind: "section", file, section: makeSection(entry, "scoped", scopeNote([], partial)) },
    ...residual,
  ];
}

/**
 * The file an instruction's content lands in first, for `instructionPath()`:
 * its first folder file, its index file, or the root AGENTS.md.
 */
export function primaryFile(entry: AgentsMdEntry, options: LayoutOptions): string {
  for (const placement of place(entry, options)) {
    if (placement.kind === "section") return placement.file;
  }
  return AGENTS_MD;
}
