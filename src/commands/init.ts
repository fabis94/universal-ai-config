import { defineCommand } from "citty";
import { mkdir, writeFile, stat } from "node:fs/promises";
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

    // Seed gitignore patterns + meta-instructions
    await runSeed("gitignore", root);
    await runSeed("meta-instructions", root, { templatesDir });

    consola.success("Initialized .universal-ai-config/");
  },
});
