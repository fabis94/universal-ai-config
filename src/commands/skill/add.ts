import { defineCommand } from "citty";
import { consola } from "consola";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { loadProjectConfig } from "../../config/loader.js";
import { fetchSkills, installSkill } from "../../core/add-skill.js";
import { AGENT_SKILLS_DIR, skillSourceDir } from "../../core/plan/standards.js";
import { filterSkillsByName, type DiscoveredSkill } from "../../core/skill-discovery.js";
import { canPrompt as terminalCanPrompt, confirmAction, selectMany } from "../interactive.js";
import { resolveCliRoot } from "../resolve-root.js";
import { formatSkillList } from "./list.js";
import { buildSkillOptions } from "./options.js";

async function exists(path: string): Promise<boolean> {
  return (await stat(path).catch(() => undefined)) !== undefined;
}

/** A SKILL.md with EJS in it is a uac template, which other tools can't read as it is. */
async function isTemplateSource(skill: DiscoveredSkill): Promise<boolean> {
  const content = await readFile(join(skill.dir, "SKILL.md"), "utf-8").catch(() => "");
  return content.includes("<%");
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

interface SelectOptions {
  skillNames: string[];
  all: boolean;
  /** Whether interactive prompts are possible and allowed (TTY and no --yes) */
  canPrompt: boolean;
}

/** Resolve which discovered skills to install from flags or an interactive prompt. */
async function selectSkills(
  skills: DiscoveredSkill[],
  opts: SelectOptions,
): Promise<DiscoveredSkill[]> {
  if (opts.skillNames.length > 0) {
    const matched = filterSkillsByName(skills, opts.skillNames);
    if (matched.length === 0) {
      consola.warn(`No skills matched: ${opts.skillNames.join(", ")}`);
    }
    return matched;
  }

  if (opts.all) return skills;
  if (skills.length === 1) return skills;

  // Multiple skills, no explicit selection — install all when we can't prompt.
  if (!opts.canPrompt) {
    consola.info(`Installing all ${skills.length} skills. Pass --skill to narrow.`);
    return skills;
  }

  const chosen = await selectMany("Select skills to install", buildSkillOptions(skills));

  // Ctrl+C / Esc — treat it as "nothing selected".
  if (!chosen) return [];

  const chosenNames = new Set(chosen);
  return skills.filter((skill) => chosenNames.has(skill.name));
}

export default defineCommand({
  meta: {
    name: "add",
    description: "Copy skills from a GitHub repo or local path into your templates",
  },
  args: {
    source: {
      type: "positional",
      description: "owner/repo[/subpath][@skill], a github.com URL, or a local path",
      required: true,
    },
    skill: {
      type: "string",
      alias: "s",
      description: "Comma-separated skill names to install",
    },
    all: {
      type: "boolean",
      description: "Install all discovered skills",
      default: false,
    },
    list: {
      type: "boolean",
      alias: "l",
      description: "List discovered skills without installing",
      default: false,
    },
    yes: {
      type: "boolean",
      alias: "y",
      description: "Skip confirmation prompts",
      default: false,
    },
    ref: {
      type: "string",
      description: "Branch, tag, or commit to fetch",
    },
    root: {
      type: "string",
      alias: "r",
      description: "Project root (default: nearest uac root above cwd)",
    },
  },
  async run({ args }) {
    const root = resolveCliRoot(args.root);
    const source = args.source as string;

    const config = await loadProjectConfig({ root });
    if (!config.types.includes("skills")) {
      consola.warn(
        "Skills are turned off: `types` in your config leaves out skills. Nothing installed.",
      );
      return;
    }
    // .agents/skills when the project keeps its skills there (`standards`)
    const installDir = skillSourceDir(config);
    const toStandard = installDir === AGENT_SKILLS_DIR;
    const skillsDir = join(root, installDir);

    consola.info(`Fetching skills from ${source}…`);
    const { skills, cleanup } = await fetchSkills(source, {
      ref: args.ref,
      prefer: toStandard ? "standards" : "templates",
    });

    try {
      if (skills.length === 0) {
        consola.warn("No skills found at the given source.");
        return;
      }

      if (args.list) {
        // Plain stdout, not consola — the logger prefixes timestamps on each line.
        process.stdout.write(`${formatSkillList(skills)}\n`);
        return;
      }

      // `--yes` opts out of prompts
      const canPrompt = terminalCanPrompt() && !args.yes;

      const selected = await selectSkills(skills, {
        skillNames: parseList(args.skill),
        all: args.all,
        canPrompt,
      });

      if (selected.length === 0) {
        consola.warn("No skills selected. Nothing to do.");
        return;
      }

      if (canPrompt && !args.all) {
        const lines: string[] = [];
        for (const skill of selected) {
          const replaces = (await exists(join(skillsDir, skill.name)))
            ? ", replaces the existing one"
            : "";
          lines.push(`  • ${skill.name} (${skill.relPath}${replaces})`);
        }
        const confirmed = await confirmAction(
          `Install ${selected.length} skill(s) into ${installDir}?\n${lines.join("\n")}`,
        );
        if (!confirmed) {
          consola.info("Aborted.");
          return;
        }
      }

      let added = 0;
      let updated = 0;
      for (const skill of selected) {
        if (toStandard && (await isTemplateSource(skill))) {
          consola.warn(
            `${skill.name} (${skill.relPath}) is a uac template with EJS in it; tools read ${AGENT_SKILLS_DIR} as it is, so check its SKILL.md`,
          );
        }
        const result = await installSkill(skill, skillsDir);
        if (result.updated) {
          updated += 1;
          consola.success(`Updated skill ${result.name} (from ${skill.relPath})`);
        } else {
          added += 1;
          consola.success(`Added skill ${result.name} (from ${skill.relPath})`);
        }
      }

      const next = toStandard
        ? `Tools that read ${AGENT_SKILLS_DIR} see them now; run \`uac generate\` for the copies the others need.`
        : "Run `uac generate` to produce target configs.";
      consola.success(`Done — ${added} added, ${updated} updated. ${next}`);
    } finally {
      await cleanup();
    }
  },
});
