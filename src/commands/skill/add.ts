import { confirm, isCancel, multiselect } from "@clack/prompts";
import { defineCommand } from "citty";
import { consola } from "consola";
import { join } from "node:path";
import { loadProjectConfig } from "../../config/loader.js";
import { fetchSkills, installSkill } from "../../core/add-skill.js";
import { filterSkillsByName, type DiscoveredSkill } from "../../core/skill-discovery.js";
import { resolveCliRoot } from "../resolve-root.js";
import { formatSkillList } from "./list.js";
import { buildSkillOptions } from "./options.js";

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

  const chosen = await multiselect<string>({
    message: "Select skills to install",
    options: buildSkillOptions(skills),
    required: false,
  });

  // Ctrl+C / Esc resolves to a cancel symbol — treat it as "nothing selected".
  if (isCancel(chosen)) return [];

  const chosenNames = new Set(chosen);
  return skills.filter((skill) => chosenNames.has(skill.name));
}

export default defineCommand({
  meta: {
    name: "add",
    description:
      "Download skill(s) from a GitHub repo or local path into .universal-ai-config/skills",
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
      description: "Project root (default: nearest uac root, searching up from cwd)",
    },
  },
  async run({ args }) {
    const root = resolveCliRoot(args.root);
    const source = args.source as string;

    const config = await loadProjectConfig({ root });
    const skillsDir = join(root, config.templatesDir, "skills");

    consola.info(`Fetching skills from ${source}…`);
    const { skills, cleanup } = await fetchSkills(source, { ref: args.ref });

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

      // Prompts require a real terminal on both ends; `--yes` opts out of them.
      const canPrompt = Boolean(process.stdin.isTTY && process.stdout.isTTY) && !args.yes;

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
        const summary = selected.map((skill) => `  • ${skill.name}`).join("\n");
        const confirmed = await confirm({
          message: `Install ${selected.length} skill(s) into ${config.templatesDir}/skills?\n${summary}`,
        });
        if (isCancel(confirmed) || confirmed !== true) {
          consola.info("Aborted.");
          return;
        }
      }

      let added = 0;
      let updated = 0;
      for (const skill of selected) {
        const result = await installSkill(skill, skillsDir);
        if (result.updated) {
          updated += 1;
          consola.success(`Updated skill ${result.name}`);
        } else {
          added += 1;
          consola.success(`Added skill ${result.name}`);
        }
      }

      consola.success(
        `Done — ${added} added, ${updated} updated. Run \`uac generate\` to produce target configs.`,
      );
    } finally {
      await cleanup();
    }
  },
});
