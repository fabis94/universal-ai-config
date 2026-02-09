import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import ejs from "ejs";

export interface SeedTemplate {
  relativePath: string;
  content: string;
}

function findPackageRoot(): string {
  let dir = import.meta.dirname;
  while (true) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not find universal-ai-config package root");
}

export function renderTemplate(filePath: string, vars: Record<string, string>): string {
  const raw = readFileSync(filePath, "utf-8");
  return ejs.render(raw, vars);
}

export function getSeedTemplatesDir(seedTypeName: string): string {
  return join(findPackageRoot(), "src", "seed-types", seedTypeName, "templates");
}
