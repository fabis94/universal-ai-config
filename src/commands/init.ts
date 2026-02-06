import { defineCommand } from "citty";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { consola } from "consola";

const EXAMPLE_INSTRUCTION = `---
description: Example coding guidelines
globs: ["**/*.ts"]
---
Follow the project's coding conventions and best practices.
`;

const EXAMPLE_SKILL = `---
name: test-generation
description: Generate tests for code
---
Generate comprehensive tests for the given code. Include edge cases and error scenarios.
`;

const EXAMPLE_AGENT = `---
name: code-reviewer
description: Reviews code for quality and best practices
tools: ["read", "grep", "glob"]
---
You are a code reviewer. Analyze the code for:
- Potential bugs
- Performance issues
- Best practice violations
`;

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
    description: "Scaffold .universal-ai-config/ directory with example templates",
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
    const baseDir = join(root, ".universal-ai-config");

    const dirs = [
      join(baseDir, "instructions"),
      join(baseDir, "skills", "test-generation"),
      join(baseDir, "agents"),
    ];

    for (const dir of dirs) {
      await mkdir(dir, { recursive: true });
    }

    const files: [string, string][] = [
      [join(baseDir, "instructions", "example.md"), EXAMPLE_INSTRUCTION],
      [join(baseDir, "skills", "test-generation", "SKILL.md"), EXAMPLE_SKILL],
      [join(baseDir, "agents", "code-reviewer.md"), EXAMPLE_AGENT],
    ];

    // Create config file if it doesn't exist
    const configPath = join(root, "universal-ai-config.ts");
    try {
      await stat(configPath);
    } catch {
      files.push([configPath, EXAMPLE_CONFIG]);
    }

    for (const [path, content] of files) {
      await writeFile(path, content, "utf-8");
      consola.success(`Created ${path.replace(root + "/", "")}`);
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

    consola.success("Initialized .universal-ai-config/");
  },
});
