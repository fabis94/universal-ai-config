import { defineCommand } from "citty";
import { posix } from "node:path";
import { consola } from "consola";
import { loadProjectConfig } from "../config/loader.js";
import { toPosixPath } from "../core/plan/locate.js";
import { AGENT_SKILLS_DIR, isStandardType, sourcedTypes } from "../core/plan/standards.js";
import {
  mayWriteSkill,
  obsoletePath,
  removeObsolete,
  writeEntry,
} from "../seed-types/meta-instructions/destinations.js";
import {
  planMetaInstructions,
  type MetaSeedPlan,
} from "../seed-types/meta-instructions/placement.js";
import { writeSeedStamp } from "../seed-types/meta-instructions/state.js";
import { UAC_VERSION } from "../version.js";
import { resolveCliRoot } from "./resolve-root.js";
import type { ResolvedConfig } from "../types.js";

const SEED_TYPES = ["meta-instructions", "examples", "gitignore"] as const;
type SeedType = (typeof SEED_TYPES)[number];

/** What a template set seeds, and where. */
async function planSeed(
  seedType: "meta-instructions" | "examples",
  config: ResolvedConfig,
): Promise<MetaSeedPlan> {
  if (seedType === "meta-instructions") return planMetaInstructions(config);
  const { getTemplates } = await import("../seed-types/examples/index.js");
  // Examples are templates: none for a type the project keeps in a standard
  const sourced = sourcedTypes(config);
  const types = config.types.filter((type) => !(isStandardType(type) && sourced.has(type)));
  const templatesDir = toPosixPath(config.templatesDir);
  return {
    entries: getTemplates(config.templatesDir, types).map((template) => ({
      destination: { kind: "file", path: posix.join(templatesDir, template.relativePath) },
      content: template.content,
    })),
    obsolete: [],
  };
}

/**
 * Seed one template set. Templates of types left out of `config.types` are
 * skipped. Seeding meta-instructions also records the uac version that did it.
 *
 * @param config the project's resolved config; loaded from `root` when omitted
 * @param options.quiet one summary line instead of a line per file
 */
export async function runSeed(
  seedType: string,
  root: string,
  config?: ResolvedConfig,
  options: { quiet?: boolean } = {},
): Promise<void> {
  if (!SEED_TYPES.includes(seedType as SeedType)) {
    throw new Error(`Unknown seed type: "${seedType}". Available: ${SEED_TYPES.join(", ")}`);
  }
  const resolved = config ?? (await loadProjectConfig({ root }));

  // Gitignore seed has its own flow — writes to .gitignore, not templates dir
  if (seedType === "gitignore") {
    const { run } = await import("../seed-types/gitignore/index.js");
    await run(root, resolved);
    return;
  }

  const plan = await planSeed(seedType as "meta-instructions" | "examples", resolved);
  const counts = { created: 0, updated: 0, unchanged: 0, removed: 0 };
  const verbs = { created: "Created", updated: "Updated" } as const;
  const notOurs = new Set<string>();

  for (const entry of plan.entries) {
    // A skill the project wrote under the same name is never overwritten
    if (entry.skill && !(await mayWriteSkill(root, entry.skill))) {
      notOurs.add(entry.skill);
      continue;
    }
    const result = await writeEntry(root, entry);
    counts[result] += 1;
    if (result === "unchanged" || options.quiet) continue;
    const { kind, path } = entry.destination;
    consola.success(`${verbs[result]} ${kind === "block" ? `uac's block in ${path}` : path}`);
  }
  for (const item of plan.obsolete) {
    if (!(await removeObsolete(root, item))) continue;
    counts.removed += 1;
    if (options.quiet) continue;
    const what = item.kind === "block" ? `uac's block from ${item.path}` : obsoletePath(item);
    consola.success(`Removed ${what} (moved where \`standards\` puts it)`);
  }
  for (const name of notOurs) {
    consola.warn(
      `${AGENT_SKILLS_DIR}/${name} is the project's own skill (its metadata has no \`managed-by: universal-ai-config\`), so uac's ${name} skill wasn't seeded`,
    );
  }

  if (seedType === "meta-instructions") await writeSeedStamp(root, resolved.templatesDir);

  const summary = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([what, n]) => `${n} ${what}`)
    .join(", ");
  if (options.quiet) {
    const version = seedType === "meta-instructions" ? ` (uac ${UAC_VERSION})` : "";
    consola.success(`Seeded ${seedType}${version}: ${summary || "nothing to seed"}`);
  } else {
    consola.info(`Seed complete: ${summary || "nothing to seed"}`);
  }
}

export default defineCommand({
  meta: {
    name: "seed",
    description: "Add a pre-built template set or the .gitignore block",
  },
  args: {
    type: {
      type: "positional",
      description: `What to seed (${SEED_TYPES.join(", ")})`,
      required: true,
    },
    root: {
      type: "string",
      alias: "r",
      description: "Project root (default: nearest uac root above cwd)",
    },
  },
  async run({ args }) {
    const root = resolveCliRoot(args.root);
    const seedType = args.type as string;

    if (!SEED_TYPES.includes(seedType as SeedType)) {
      consola.error(`Unknown seed type: "${seedType}". Available: ${SEED_TYPES.join(", ")}`);
      process.exit(1);
    }

    await runSeed(seedType, root);
  },
});
