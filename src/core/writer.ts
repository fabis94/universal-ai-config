import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { consola } from "consola";
import { targets } from "../targets/index.js";
import type { GeneratedFile, Target } from "../types.js";

const CLEAN_PATHS: Record<string, string[]> = {
  claude: ["rules", "skills", "agents"],
  copilot: ["copilot-instructions.md", "instructions", "agents", "skills"],
  cursor: ["rules", "skills"],
};

export async function writeGeneratedFiles(files: GeneratedFile[], root: string): Promise<void> {
  for (const file of files) {
    const fullPath = join(root, file.path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, file.content, "utf-8");
    consola.success(`Generated ${file.path}`);
  }
}

export async function cleanTargetFiles(root: string, targetNames?: Target[]): Promise<void> {
  const targetList = targetNames ?? (Object.keys(targets) as Target[]);

  for (const targetName of targetList) {
    const targetDef = targets[targetName];
    if (!targetDef) continue;

    const outputDir = targetDef.outputDir;
    const paths = CLEAN_PATHS[targetName];
    if (!paths) continue;

    for (const p of paths) {
      const fullPath = join(root, outputDir, p);
      try {
        await rm(fullPath, { recursive: true, force: true });
        consola.info(`Cleaned ${join(outputDir, p)}`);
      } catch {
        // Path doesn't exist, that's fine
      }
    }
  }
}
