import { defineCommand } from "citty";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { consola } from "consola";
import { runSeed } from "./seed.js";

const EXAMPLE_CONFIG = `import { defineConfig } from "universal-ai-config";

export default defineConfig({
  targets: ["claude", "copilot", "cursor"],
  variables: {
    projectName: "my-project",
  },
});
`;

export default defineCommand({
  meta: {
    name: "init",
    description: "Scaffold .universal-ai-config/ directory with meta-instruction templates",
  },
  args: {
    root: {
      type: "string",
      alias: "r",
      description: "Project root (default: cwd)",
    },
  },
  async run({ args }) {
    const root = args.root ?? process.cwd();
    const templatesDir = ".universal-ai-config";
    const baseDir = join(root, templatesDir);

    // Create base directory
    await mkdir(baseDir, { recursive: true });

    // Create config file if it doesn't exist
    const configPath = join(root, "universal-ai-config.config.ts");
    try {
      await stat(configPath);
    } catch {
      await writeFile(configPath, EXAMPLE_CONFIG, "utf-8");
      consola.success(`Created ${configPath.replace(root + "/", "")}`);
    }

    // Add overrides to .gitignore
    const gitignorePath = join(root, ".gitignore");
    const overridesPattern = "universal-ai-config.overrides.*";
    try {
      const existing = await readFile(gitignorePath, "utf-8");
      if (!existing.includes(overridesPattern)) {
        const newContent = existing.endsWith("\n")
          ? `${existing}${overridesPattern}\n`
          : `${existing}\n${overridesPattern}\n`;
        await writeFile(gitignorePath, newContent, "utf-8");
        consola.success(`Added "${overridesPattern}" to .gitignore`);
      }
    } catch {
      await writeFile(gitignorePath, `${overridesPattern}\n`, "utf-8");
      consola.success(`Created .gitignore with "${overridesPattern}"`);
    }

    // Seed meta-instructions
    await runSeed("meta-instructions", root, { templatesDir });

    consola.success("Initialized .universal-ai-config/");
  },
});
