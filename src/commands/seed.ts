import { defineCommand } from "citty";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { consola } from "consola";
import { loadProjectConfig } from "../config/loader.js";
import type { SeedTemplate } from "../seed-types/meta-instructions/index.js";

const SEED_TYPES = ["meta-instructions"] as const;
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
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
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
    const config = await loadProjectConfig({ root });
    const templatesDir = config.templatesDir;

    const seedType = args.type as string;

    if (!SEED_TYPES.includes(seedType as SeedType)) {
      consola.error(`Unknown seed type: "${seedType}". Available: ${SEED_TYPES.join(", ")}`);
      process.exit(1);
    }

    const templates = await loadSeedTemplates(seedType as SeedType, templatesDir);
    let created = 0;
    let skipped = 0;

    for (const template of templates) {
      const fullPath = join(root, templatesDir, template.relativePath);
      const parentDir = join(fullPath, "..");

      if (await fileExists(fullPath)) {
        consola.warn(`Skipped (already exists): ${template.relativePath}`);
        skipped++;
        continue;
      }

      await mkdir(parentDir, { recursive: true });
      await writeFile(fullPath, template.content, "utf-8");
      consola.success(`Created ${join(templatesDir, template.relativePath)}`);
      created++;
    }

    consola.info(`Seed complete: ${created} created, ${skipped} skipped`);
  },
});
