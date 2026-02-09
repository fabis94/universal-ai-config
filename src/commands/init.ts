import { defineCommand } from "citty";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { consola } from "consola";
import { runSeed } from "./seed.js";

// Specific output subdirs/files per target — not entire dirs like .github/
// which contain non-AI content (workflows, issue templates, etc.)
const GITIGNORE_PATTERNS = [
  "universal-ai-config.overrides.*",
  // Claude
  ".claude/rules/",
  ".claude/skills/",
  ".claude/agents/",
  // Copilot (.github/ has non-AI content, so list specific subdirs)
  ".github/copilot-instructions.md",
  ".github/instructions/",
  ".github/skills/",
  ".github/agents/",
  ".github/hooks/",
  // Cursor
  ".cursor/rules/",
  ".cursor/skills/",
  ".cursor/hooks.json",
];

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

    // Add overrides + output patterns to .gitignore
    const gitignorePath = join(root, ".gitignore");
    const allPatterns = GITIGNORE_PATTERNS;

    let existing = "";
    try {
      existing = await readFile(gitignorePath, "utf-8");
    } catch {
      // File doesn't exist yet
    }

    const missing = allPatterns.filter((p) => !existing.includes(p));

    if (missing.length > 0) {
      const header = "# universal-ai-config";
      const hasHeader = existing.includes(header);
      const block = missing.join("\n") + "\n";

      let newContent: string;
      if (!existing) {
        newContent = `${header}\n${block}`;
      } else if (!hasHeader) {
        const sep = existing.endsWith("\n") ? "\n" : "\n\n";
        newContent = `${existing}${sep}${header}\n${block}`;
      } else {
        const sep = existing.endsWith("\n") ? "" : "\n";
        newContent = `${existing}${sep}${block}`;
      }

      await writeFile(gitignorePath, newContent, "utf-8");

      if (!existing) {
        consola.success("Created .gitignore with universal-ai-config patterns");
      } else {
        consola.success(`Added ${missing.length} pattern(s) to .gitignore`);
      }
    }

    // Seed meta-instructions
    await runSeed("meta-instructions", root, { templatesDir });

    consola.success("Initialized .universal-ai-config/");
  },
});
