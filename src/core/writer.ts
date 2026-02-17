import { access, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { consola } from "consola";
import { targets } from "../targets/index.js";
import { safePath } from "./safe-path.js";
import type { GeneratedFile, Target } from "../types.js";

const CLEAN_PATHS: Record<string, string[]> = {
  claude: ["rules", "skills", "agents"],
  copilot: ["copilot-instructions.md", "instructions", "agents", "skills", "hooks"],
  cursor: ["rules", "skills", "hooks.json"],
};

/** Root-relative MCP output paths per target (not inside outputDir) */
const CLEAN_MCP_PATHS: Record<string, string[]> = {
  claude: [".mcp.json"],
  copilot: [".vscode/mcp.json"],
  cursor: [".cursor/mcp.json"],
};

async function mergeJsonKey(fullPath: string, content: string, mergeKey: string): Promise<string> {
  const newData = JSON.parse(content) as Record<string, unknown>;
  const mergeValue = newData[mergeKey];

  let existing: Record<string, unknown> = {};
  try {
    const existingContent = await readFile(fullPath, "utf-8");
    existing = JSON.parse(existingContent) as Record<string, unknown>;
  } catch {
    // File doesn't exist yet, start fresh
  }

  existing[mergeKey] = mergeValue;
  return JSON.stringify(existing, null, 2) + "\n";
}

export async function writeGeneratedFiles(
  files: GeneratedFile[],
  root: string,
  options?: { verbose?: boolean },
): Promise<void> {
  for (const file of files) {
    const fullPath = safePath(root, file.path);
    await mkdir(dirname(fullPath), { recursive: true });

    if (file.mergeKey) {
      const merged = await mergeJsonKey(fullPath, file.content, file.mergeKey);
      await writeFile(fullPath, merged, "utf-8");
    } else {
      await writeFile(fullPath, file.content, "utf-8");
    }

    if (options?.verbose) {
      consola.success(`Generated ${file.path}`);
    }
  }
}

async function cleanClaudeHooks(root: string, outputDir: string): Promise<string | undefined> {
  const settingsPath = join(root, outputDir, "settings.json");
  try {
    const content = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(content) as Record<string, unknown>;
    if ("hooks" in settings) {
      delete settings.hooks;
      if (Object.keys(settings).length === 0) {
        await rm(settingsPath, { force: true });
      } else {
        await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
      }
      return join(outputDir, "settings.json");
    }
  } catch {
    // File doesn't exist, nothing to clean
  }
  return undefined;
}

export async function cleanTargetFiles(
  root: string,
  targetNames?: Target[],
  options?: { verbose?: boolean },
): Promise<string[]> {
  const targetList = targetNames ?? (Object.keys(targets) as Target[]);
  const cleaned: string[] = [];

  for (const targetName of targetList) {
    const targetDef = targets[targetName];
    if (!targetDef) continue;

    const outputDir = targetDef.outputDir;
    const paths = CLEAN_PATHS[targetName];
    if (!paths) continue;

    for (const p of paths) {
      const fullPath = join(root, outputDir, p);
      const exists = await access(fullPath).then(
        () => true,
        () => false,
      );
      if (!exists) continue;
      await rm(fullPath, { recursive: true, force: true });
      const label = join(outputDir, p);
      cleaned.push(label);
      if (options?.verbose) {
        consola.info(`Cleaned ${label}`);
      }
    }

    // Claude hooks are merged into settings.json — need special handling
    if (targetName === "claude") {
      const hookLabel = await cleanClaudeHooks(root, outputDir);
      if (hookLabel) {
        cleaned.push(hookLabel);
        if (options?.verbose) {
          consola.info(`Cleaned hooks from ${hookLabel}`);
        }
      }
    }

    // MCP files are root-relative, not inside outputDir
    const mcpPaths = CLEAN_MCP_PATHS[targetName];
    if (mcpPaths) {
      for (const mcpPath of mcpPaths) {
        const fullPath = join(root, mcpPath);
        const exists = await access(fullPath).then(
          () => true,
          () => false,
        );
        if (!exists) continue;
        await rm(fullPath, { force: true });
        cleaned.push(mcpPath);
        if (options?.verbose) {
          consola.info(`Cleaned ${mcpPath}`);
        }
      }
    }
  }

  return cleaned;
}
