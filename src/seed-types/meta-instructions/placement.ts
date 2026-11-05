import { posix } from "node:path";
import { buildAgentsMdFiles, type AgentsMdEntry } from "../../core/agents-md/index.js";
import { mapFrontmatter, renderMarkdown } from "../../core/generate/frontmatter.js";
import {
  parseFrontmatter,
  parseTemplate,
  renderEjs,
  type TemplatesIndex,
} from "../../core/parser.js";
import { createLocator, toPosixPath } from "../../core/plan/locate.js";
import {
  AGENT_SKILLS_DIR,
  readsStandard,
  sourcedTypes,
  standardView,
} from "../../core/plan/standards.js";
import { resolveOverrides } from "../../core/resolve-overrides.js";
import { targets } from "../../targets/index.js";
import type { ResolvedConfig, Target, UniversalFrontmatter } from "../../types.js";
import type { BlockMarkers, SeedTemplate } from "../shared.js";
import { getTemplates } from "./index.js";

/**
 * Where each meta-instruction file goes. In template mode everything is a
 * template in the templates dir. For a type the project keeps in an open
 * standard (`standards`), uac's own files go there instead, fully rendered —
 * tools read those files as they are, so no EJS may be left in them:
 *
 * - instructions: a marked block in the AGENTS.md file each one routes to
 *   (`uac-usage` → root AGENTS.md, the template guide → `<templatesDir>/AGENTS.md`);
 * - skills: `.agents/skills/<name>/`, marked as uac's in their frontmatter.
 */

/** Where one seeded file goes. */
export type SeedDestination =
  /** uac owns the whole file (root-relative POSIX path) */
  | { kind: "file"; path: string }
  /** uac owns a marked block inside a file the project also edits */
  | { kind: "block"; path: string };

export interface SeedEntry {
  destination: SeedDestination;
  content: string;
  /**
   * The `.agents/skills` folder this file belongs to. It's written only while
   * that folder is absent or uac's own (`isUacSkill`): a same-named skill the
   * project wrote is never overwritten.
   */
  skill?: string;
}

/** uac's own seeded files in the place the other mode puts them. */
export type ObsoleteItem =
  /** A template-mode copy (file or skill folder), removed whole */
  | { kind: "path"; path: string }
  /** uac's skill in `.agents/skills/<name>/`, removed only while it carries the marker */
  | { kind: "skill"; name: string }
  /** uac's block in an AGENTS.md, removed — with the file when nothing else is left */
  | { kind: "block"; path: string };

export interface MetaSeedPlan {
  entries: SeedEntry[];
  /**
   * Where uac's own files would be under the other setting of `standards`:
   * reseeding moves them, so switching modes either way leaves nothing behind.
   */
  obsolete: ObsoleteItem[];
}

/** The block uac owns in an AGENTS.md. */
export const AGENTS_MD_MARKERS: BlockMarkers = {
  start: "<!-- >>> universal-ai-config >>> -->",
  end: "<!-- <<< universal-ai-config <<< -->",
};

/** First line inside the block, for whoever edits the file by hand. */
const BLOCK_NOTE =
  "<!-- Written by `uac seed meta-instructions`; edits between these markers are overwritten. -->";

/** Frontmatter `metadata` entry that marks a `.agents/skills` folder as uac's. */
const SKILL_MARKER = { key: "managed-by", value: "universal-ai-config" } as const;

/** Whether a SKILL.md carries uac's ownership marker. */
export function isUacSkill(skillMd: string): boolean {
  const { frontmatter } = parseFrontmatter(skillMd);
  const metadata = (frontmatter as { metadata?: unknown }).metadata;
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    (metadata as Record<string, unknown>)[SKILL_MARKER.key] === SKILL_MARKER.value
  );
}

/** Seed paths are relative to the templates dir; `kind` is their top folder. */
function split(templates: SeedTemplate[]) {
  const of = (kind: string) => templates.filter((t) => t.relativePath.startsWith(`${kind}/`));
  return {
    instructions: of("instructions"),
    skills: of("skills"),
    rest: templates.filter((t) => !/^(instructions|skills)\//.test(t.relativePath)),
  };
}

/** What a seed-time render of a standard-bound file needs. */
function renderContext(config: ResolvedConfig, view: Target, templates: SeedTemplate[]) {
  const instructions = new Map<string, UniversalFrontmatter>();
  for (const t of templates) {
    if (!t.relativePath.startsWith("instructions/")) continue;
    const name = posix.basename(t.relativePath, ".md");
    const { frontmatter } = parseFrontmatter(t.content);
    instructions.set(
      name,
      resolveOverrides(frontmatter as Record<string, unknown>, view) as UniversalFrontmatter,
    );
  }
  const templatesIndex: TemplatesIndex = { instructions };
  const consumers = (Object.keys(targets) as Target[]).filter((t) =>
    readsStandard(targets[t], "instructions"),
  );
  return { config, templatesIndex, locator: createLocator(config), consumers };
}

/** The instruction templates as marked blocks in the AGENTS.md files they route to. */
function placeInstructions(
  config: ResolvedConfig,
  instructions: SeedTemplate[],
  all: SeedTemplate[],
): SeedEntry[] {
  const view = standardView("instructions");
  const context = renderContext(config, view, all);
  const entries: AgentsMdEntry[] = instructions.map((t) => {
    const parsed = parseTemplate(t.content, { ...context, target: view, type: "instructions" });
    return {
      name: posix.basename(t.relativePath, ".md"),
      sourcePath: posix.join(toPosixPath(config.templatesDir), t.relativePath),
      frontmatter: resolveOverrides(
        parsed.frontmatter as Record<string, unknown>,
        view,
      ) as UniversalFrontmatter,
      body: parsed.body,
    };
  });
  // The project's AGENTS.md files are laid out by folder
  const files = buildAgentsMdFiles(entries, {
    variation: "nested",
    indexDir: toPosixPath(config.agentsMd.indexDir),
  });
  return files.map((file) => ({
    destination: { kind: "block", path: file.path },
    content: `${BLOCK_NOTE}\n\n${file.content}`,
  }));
}

/**
 * The skill templates as plain `.agents/skills` folders: rendered for the
 * first tool that reads the folder, with that tool's frontmatter fields
 * (Agent Skills names like `user-invocable`) and uac's ownership marker.
 */
function placeSkills(
  config: ResolvedConfig,
  skills: SeedTemplate[],
  all: SeedTemplate[],
): SeedEntry[] {
  const view = standardView("skills");
  const skillConfig = targets[view]?.skills;
  if (!skillConfig) throw new Error(`${view} reads .agents/skills but has no skills config`);
  const context = { ...renderContext(config, view, all), target: view, type: "skills" as const };

  return skills.map((t) => {
    const [, name = "", ...rest] = t.relativePath.split("/");
    const file = rest.join("/");
    const path = posix.join(AGENT_SKILLS_DIR, name, file);
    let content = t.content;
    if (file === "SKILL.md") {
      const parsed = parseTemplate(t.content, context);
      const frontmatter = resolveOverrides(
        parsed.frontmatter as Record<string, unknown>,
        view,
      ) as UniversalFrontmatter;
      const mapped = mapFrontmatter(frontmatter, skillConfig);
      mapped.metadata = {
        ...(mapped.metadata as Record<string, unknown> | undefined),
        [SKILL_MARKER.key]: SKILL_MARKER.value,
      };
      content = renderMarkdown(mapped, parsed.body, skillConfig.frontmatterStyle);
    } else if (file.endsWith(".md")) {
      content = renderEjs(t.content, context);
    }
    return { destination: { kind: "file", path }, content, skill: name };
  });
}

interface Placed {
  /** Where this mode's files go */
  entries: SeedEntry[];
  /** Where the other mode would have put the same files */
  elsewhere: ObsoleteItem[];
}

/** Instructions: blocks in AGENTS.md while sourced, templates otherwise. */
function instructionsPlacement(
  config: ResolvedConfig,
  sourced: boolean,
  instructions: SeedTemplate[],
  all: SeedTemplate[],
): Placed {
  const templatesDir = toPosixPath(config.templatesDir);
  const asTemplates = instructions.map((t) => posix.join(templatesDir, t.relativePath));
  if (sourced) {
    return {
      entries: placeInstructions(config, instructions, all),
      elsewhere: asTemplates.map((path) => ({ kind: "path", path })),
    };
  }
  return {
    entries: instructions.map((t, i) => ({
      destination: { kind: "file", path: asTemplates[i] ?? "" },
      content: t.content,
    })),
    elsewhere: placeInstructions(config, instructions, all).map((entry) => ({
      kind: "block",
      path: entry.destination.path,
    })),
  };
}

/** Skills: `.agents/skills` folders while sourced, templates otherwise. */
function skillsPlacement(
  config: ResolvedConfig,
  sourced: boolean,
  skills: SeedTemplate[],
  all: SeedTemplate[],
): Placed {
  const templatesDir = toPosixPath(config.templatesDir);
  const names = [...new Set(skills.map((t) => t.relativePath.split("/")[1] ?? ""))];
  if (sourced) {
    return {
      entries: placeSkills(config, skills, all),
      elsewhere: names.map((name) => ({
        kind: "path",
        path: posix.join(templatesDir, "skills", name),
      })),
    };
  }
  return {
    entries: skills.map((t) => ({
      destination: { kind: "file", path: posix.join(templatesDir, t.relativePath) },
      content: t.content,
    })),
    elsewhere: names.map((name) => ({ kind: "skill", name })),
  };
}

/** Every meta-instruction file, where it goes under this config, and what to move. */
export function planMetaInstructions(config: ResolvedConfig): MetaSeedPlan {
  const sourced = sourcedTypes(config);
  const standards = { instructions: sourced.has("instructions"), skills: sourced.has("skills") };
  const templatesDir = toPosixPath(config.templatesDir);
  const templates = getTemplates(config.templatesDir, config.types, standards);
  const { instructions, skills, rest } = split(templates);

  // Block locations follow each instruction's routing, not its wording, so
  // this mode's templates tell where the other mode puts them too
  const forInstructions = instructionsPlacement(
    config,
    standards.instructions,
    instructions,
    templates,
  );
  const forSkills = skillsPlacement(config, standards.skills, skills, templates);

  return {
    entries: [
      ...rest.map(
        (t): SeedEntry => ({
          destination: { kind: "file", path: posix.join(templatesDir, t.relativePath) },
          content: t.content,
        }),
      ),
      ...forInstructions.entries,
      ...forSkills.entries,
    ],
    obsolete: [...forInstructions.elsewhere, ...forSkills.elsewhere],
  };
}
