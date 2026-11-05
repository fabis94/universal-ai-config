import { defineCommand } from "citty";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { consola } from "consola";
import { loadProjectConfig } from "../config/loader.js";
import { writeSeedStamp } from "../seed-types/meta-instructions/state.js";
import { UAC_VERSION } from "../version.js";
import { resolveCliRoot } from "./resolve-root.js";
import type { SeedTemplate } from "../seed-types/shared.js";
import type { ResolvedConfig } from "../types.js";

const SEED_TYPES = ["meta-instructions", "examples", "gitignore"] as const;
type SeedType = (typeof SEED_TYPES)[number];

/** What a seed needs from the project config. */
type SeedConfig = Pick<ResolvedConfig, "templatesDir" | "agentsMd" | "types">;

async function loadSeedTemplates(seedType: SeedType, config: SeedConfig): Promise<SeedTemplate[]> {
  switch (seedType) {
    case "meta-instructions": {
      const { getTemplates } = await import("../seed-types/meta-instructions/index.js");
      return getTemplates(config.templatesDir, config.types);
    }
    case "examples": {
      const { getTemplates } = await import("../seed-types/examples/index.js");
      return getTemplates(config.templatesDir, config.types);
    }
    case "gitignore":
      return [];
  }
}

async function readIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return undefined;
  }
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
  config?: SeedConfig,
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

  const templates = await loadSeedTemplates(seedType as SeedType, resolved);
  const counts = { created: 0, updated: 0, unchanged: 0 };

  for (const template of templates) {
    const relativePath = join(resolved.templatesDir, template.relativePath);
    const fullPath = join(root, relativePath);
    const existing = await readIfExists(fullPath);
    if (existing === template.content) {
      counts.unchanged += 1;
      continue;
    }
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, template.content, "utf-8");
    const verb = existing === undefined ? "Created" : "Updated";
    counts[existing === undefined ? "created" : "updated"] += 1;
    if (!options.quiet) consola.success(`${verb} ${relativePath}`);
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
