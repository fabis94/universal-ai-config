import { access, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { consola } from "consola";
import { targets } from "../targets/index.js";
import { safePath } from "./safe-path.js";
import { parseToml, stringifyToml } from "./toml.js";
import type { GeneratedFile, Target, TemplateType } from "../types.js";

/**
 * A single removable artifact, tagged with the `TemplateType` it belongs to so
 * `cleanTargetFiles` can honor a `--type` filter. `location` distinguishes paths
 * inside the target's `outputDir` (`"output"`) from project-root-relative ones
 * (`"root"`) — MCP config files and Codex's `AGENTS.md` / `.agents/skills` live
 * outside `outputDir`. The `hooks`/`mcp` special cases (Claude's `settings.json`
 * merge, Codex's `config.toml` table) are handled separately in `cleanTargetFiles`.
 */
interface CleanEntry {
  type: TemplateType;
  path: string;
  location: "output" | "root";
}

const CLEAN_ENTRIES: Record<string, CleanEntry[]> = {
  claude: [
    { type: "instructions", path: "rules", location: "output" },
    { type: "skills", path: "skills", location: "output" },
    { type: "agents", path: "agents", location: "output" },
    { type: "mcp", path: ".mcp.json", location: "root" },
  ],
  copilot: [
    { type: "instructions", path: "copilot-instructions.md", location: "output" },
    { type: "instructions", path: "instructions", location: "output" },
    { type: "agents", path: "agents", location: "output" },
    { type: "skills", path: "skills", location: "output" },
    { type: "hooks", path: "hooks", location: "output" },
    { type: "mcp", path: ".vscode/mcp.json", location: "root" },
  ],
  cursor: [
    { type: "instructions", path: "rules", location: "output" },
    { type: "skills", path: "skills", location: "output" },
    { type: "hooks", path: "hooks.json", location: "output" },
    { type: "mcp", path: ".cursor/mcp.json", location: "root" },
  ],
  codex: [
    { type: "agents", path: "agents", location: "output" },
    { type: "hooks", path: "hooks.json", location: "output" },
    { type: "instructions", path: "AGENTS.md", location: "root" },
    { type: "skills", path: ".agents/skills", location: "root" },
  ],
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

/**
 * TOML twin of `mergeJsonKey`. Replaces only `mergeKey` of the existing TOML
 * file at `fullPath`, leaving all other top-level keys untouched. Used by
 * Codex to write the `mcp_servers` table into `.codex/config.toml` while
 * preserving any user-authored `[profiles.*]`, `personality`, etc.
 */
async function mergeTomlKey(fullPath: string, content: string, mergeKey: string): Promise<string> {
  const newData = parseToml(content);
  const mergeValue = newData[mergeKey];

  let existing: Record<string, unknown> = {};
  try {
    const existingContent = await readFile(fullPath, "utf-8");
    existing = parseToml(existingContent);
  } catch {
    // File doesn't exist yet, start fresh
  }

  existing[mergeKey] = mergeValue;
  return stringifyToml(existing) + "\n";
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
      const merged =
        file.mergeFormat === "toml"
          ? await mergeTomlKey(fullPath, file.content, file.mergeKey)
          : await mergeJsonKey(fullPath, file.content, file.mergeKey);
      await writeFile(fullPath, merged, "utf-8");
    } else {
      await writeFile(fullPath, file.content, "utf-8");
    }

    if (options?.verbose) {
      const inputs =
        file.inputCount !== undefined
          ? ` (from ${file.inputCount} input${file.inputCount === 1 ? "" : "s"})`
          : "";
      consola.success(`Generated ${file.path}${inputs}`);
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

/**
 * Partial-key cleanup for Codex's shared `.codex/config.toml`. Deletes only
 * the `mcp_servers` table (uac-owned in v1), preserving any other top-level
 * sections (`[profiles.*]`, `personality`, etc.) the user has hand-authored.
 * Removes the file entirely if no other keys remain.
 */
async function cleanCodexConfig(root: string, outputDir: string): Promise<string | undefined> {
  const configPath = join(root, outputDir, "config.toml");
  try {
    const content = await readFile(configPath, "utf-8");
    const data = parseToml(content);
    if ("mcp_servers" in data) {
      delete data.mcp_servers;
      if (Object.keys(data).length === 0) {
        await rm(configPath, { force: true });
      } else {
        await writeFile(configPath, stringifyToml(data) + "\n", "utf-8");
      }
      return join(outputDir, "config.toml");
    }
  } catch {
    // File doesn't exist, nothing to clean
  }
  return undefined;
}

/**
 * Remove generated artifacts for the given targets. When `types` is provided,
 * only artifacts belonging to those template types are removed — so
 * `generate --type skills --clean` no longer wipes instructions/agents/hooks/mcp.
 * When `types` is omitted, every type is cleaned (the original behavior).
 *
 * Glob-derived `AGENTS.override.md` files are intentionally NOT cleaned — they're
 * gitignored, so orphans are harmless.
 */
export async function cleanTargetFiles(
  root: string,
  targetNames?: Target[],
  types?: TemplateType[],
  options?: { verbose?: boolean },
): Promise<string[]> {
  const targetList = targetNames ?? (Object.keys(targets) as Target[]);
  const includesType = (t: TemplateType): boolean => !types || types.includes(t);
  const cleaned: string[] = [];

  for (const targetName of targetList) {
    const targetDef = targets[targetName];
    if (!targetDef) continue;

    const outputDir = targetDef.outputDir;
    const entries = CLEAN_ENTRIES[targetName];
    if (!entries) continue;

    for (const entry of entries) {
      if (!includesType(entry.type)) continue;
      const rel = entry.location === "root" ? entry.path : join(outputDir, entry.path);
      const fullPath = join(root, rel);
      const exists = await access(fullPath).then(
        () => true,
        () => false,
      );
      if (!exists) continue;
      await rm(fullPath, { recursive: true, force: true });
      cleaned.push(rel);
      if (options?.verbose) {
        consola.info(`Cleaned ${rel}`);
      }
    }

    // Claude hooks are merged into settings.json — need special handling
    if (targetName === "claude" && includesType("hooks")) {
      const hookLabel = await cleanClaudeHooks(root, outputDir);
      if (hookLabel) {
        cleaned.push(hookLabel);
        if (options?.verbose) {
          consola.info(`Cleaned hooks from ${hookLabel}`);
        }
      }
    }

    // Codex shares `.codex/config.toml` with user content — partial cleanup
    // removes only the `mcp_servers` table, preserving any other top-level keys.
    if (targetName === "codex" && includesType("mcp")) {
      const configLabel = await cleanCodexConfig(root, outputDir);
      if (configLabel) {
        cleaned.push(configLabel);
        if (options?.verbose) {
          consola.info(`Cleaned mcp_servers from ${configLabel}`);
        }
      }
    }
  }

  return cleaned;
}
