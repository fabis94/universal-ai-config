import { defineCommand } from "citty";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { consola } from "consola";
import { loadProjectConfig } from "../config/loader.js";
import type { SeedTemplate } from "../seed-types/shared.js";

const SEED_TYPES = ["meta-instructions", "examples"] as const;
type SeedType = (typeof SEED_TYPES)[number];

async function loadSeedTemplates(
  seedType: SeedType,
  templatesDir: string,
): Promise<SeedTemplate[]> {
  switch (seedType) {
    case "meta-instructions": {
      const { getTemplates } = await import("../seed-types/meta-instructions/index.js");
      return getTemplates(templatesDir);
    }
    case "examples": {
      const { getTemplates } = await import("../seed-types/examples/index.js");
      return getTemplates(templatesDir);
    }
  }
}

interface RunSeedOptions {
  templatesDir?: string;
}

export async function runSeed(
  seedType: string,
  root: string,
  options?: RunSeedOptions,
): Promise<void> {
  if (!SEED_TYPES.includes(seedType as SeedType)) {
    throw new Error(`Unknown seed type: "${seedType}". Available: ${SEED_TYPES.join(", ")}`);
  }

  const templatesDir = options?.templatesDir ?? (await loadProjectConfig({ root })).templatesDir;

  const templates = await loadSeedTemplates(seedType as SeedType, templatesDir);

  for (const template of templates) {
    const fullPath = join(root, templatesDir, template.relativePath);
    const parentDir = join(fullPath, "..");

    await mkdir(parentDir, { recursive: true });
    await writeFile(fullPath, template.content, "utf-8");
    consola.success(`Created ${join(templatesDir, template.relativePath)}`);
  }

  consola.info(`Seed complete: ${templates.length} files written`);
}

export default defineCommand({
  meta: {
    name: "seed",
    description: "Seed templates into the templates directory",
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
      description: "Project root (default: cwd)",
    },
  },
  async run({ args }) {
    const root = args.root ?? process.cwd();
    const seedType = args.type as string;

    if (!SEED_TYPES.includes(seedType as SeedType)) {
      consola.error(`Unknown seed type: "${seedType}". Available: ${SEED_TYPES.join(", ")}`);
      process.exit(1);
    }

    await runSeed(seedType, root);
  },
});
