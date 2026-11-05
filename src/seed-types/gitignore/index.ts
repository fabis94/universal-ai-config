import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { consola } from "consola";
import { DEFAULT_CONFIG } from "../../config/defaults.js";
import { toPosixPath } from "../../core/plan/locate.js";
import { ownedByUac, sourcedTypes } from "../../core/plan/standards.js";
import { findBlock, upsertBlock, wrapBlock, type BlockMarkers } from "../shared.js";
import type { ResolvedConfig, Target, TemplateType } from "../../types.js";

const MARKERS: BlockMarkers = {
  start: "# >>> universal-ai-config >>>",
  end: "# <<< universal-ai-config <<<",
};

type BlockConfig = Pick<ResolvedConfig, "agentsMd" | "types" | "standards">;

/**
 * Who writes the files a pattern matches:
 *
 * - `uac`: uac's own files, always ignored.
 * - `output`: a target's output for a template type (`.mcp.json` is shared by
 *   claude and copilot).
 * - `agentsMd`: the AGENTS.md output, written for every target that reads it.
 *
 * A pattern is in the block only while uac writes those files, so files a
 * project writes by hand are never ignored: a type left out of `types`, or
 * one it keeps in an open standard (`standards`) — the standard's files and
 * the folders of tools that read it.
 */
type PatternOwner =
  | { kind: "uac" }
  | { kind: "output"; type: TemplateType; targets: Target[] }
  | { kind: "agentsMd" };

const uac: PatternOwner = { kind: "uac" };
const output = (type: TemplateType, ...targets: Target[]): PatternOwner => ({
  kind: "output",
  type,
  targets,
});
const agentsMd: PatternOwner = { kind: "agentsMd" };

/**
 * Specific output subdirs/files per target — not entire dirs like .github/
 * which contain non-AI content (workflows, issue templates, hook scripts, etc.).
 */
const PATTERNS: Array<{ pattern: string; owner: PatternOwner }> = [
  { pattern: "/universal-ai-config.overrides.*", owner: uac },
  // Claude
  { pattern: ".claude/rules/", owner: output("instructions", "claude") },
  { pattern: ".claude/skills/", owner: output("skills", "claude") },
  { pattern: ".claude/agents/", owner: output("agents", "claude") },
  { pattern: ".claude/settings.json", owner: output("hooks", "claude") },
  { pattern: ".claude/*.local.*", owner: uac },
  // Copilot (.github/ has non-AI content, so list specific subdirs)
  { pattern: ".github/copilot-instructions.md", owner: output("instructions", "copilot") },
  { pattern: ".github/instructions/", owner: output("instructions", "copilot") },
  { pattern: ".github/skills/", owner: output("skills", "copilot") },
  { pattern: ".github/agents/", owner: output("agents", "copilot") },
  // Only uac's own file: .github/hooks also holds hook scripts that must be committed
  { pattern: ".github/hooks/hooks.json", owner: output("hooks", "copilot") },
  // Cursor
  { pattern: ".cursor/rules/", owner: output("instructions", "cursor") },
  { pattern: ".cursor/skills/", owner: output("skills", "cursor") },
  { pattern: ".cursor/agents/", owner: output("agents", "cursor") },
  { pattern: ".cursor/hooks.json", owner: output("hooks", "cursor") },
  // Codex (mix of root-relative + .codex/ + .agents/ outputs)
  { pattern: ".codex/agents/", owner: output("agents", "codex") },
  { pattern: ".codex/hooks.json", owner: output("hooks", "codex") },
  { pattern: ".codex/config.toml", owner: output("mcp", "codex") },
  { pattern: ".agents/skills/", owner: output("skills", "codex") },
  // Every AGENTS.md, root and nested: uac generates them all (AGENTS.md output)
  { pattern: "AGENTS.md", owner: agentsMd },
  // MCP (root-relative output paths)
  { pattern: ".mcp.json", owner: output("mcp", "claude", "copilot") },
  { pattern: ".cursor/mcp.json", owner: output("mcp", "cursor") },
];

/** Whether uac writes the files of a pattern's owner under this config. */
function uacWrites(owner: PatternOwner, config: BlockConfig): boolean {
  switch (owner.kind) {
    case "uac":
      return true;
    case "output":
      return (
        config.types.includes(owner.type) &&
        owner.targets.some((target) => ownedByUac(target, owner.type, config))
      );
    case "agentsMd":
      return config.types.includes("instructions") && !sourcedTypes(config).has("instructions");
  }
}

/** The uac `.gitignore` block this config produces, markers included. */
export function buildGitignoreBlock(config: BlockConfig = DEFAULT_CONFIG): string {
  const lines = PATTERNS.filter((entry) => uacWrites(entry.owner, config)).map(
    (entry) => entry.pattern,
  );
  if (uacWrites(agentsMd, config)) {
    lines.push(
      "# Scoped instructions of the AGENTS.md `index` variation",
      `/${toPosixPath(config.agentsMd.indexDir)}/`,
    );
  }
  return wrapBlock(lines.join("\n"), MARKERS);
}

async function readGitignore(root: string): Promise<string> {
  try {
    return await readFile(join(root, ".gitignore"), "utf-8");
  } catch {
    return "";
  }
}

export type GitignoreBlockState =
  | { status: "missing" }
  | { status: "current" }
  | { status: "stale"; added: string[]; removed: string[] };

function patternLines(block: string): string[] {
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

/** Whether `.gitignore` has the uac block this config produces, and how it differs. */
export async function gitignoreBlockState(
  root: string,
  config: BlockConfig,
): Promise<GitignoreBlockState> {
  const text = await readGitignore(root);
  const range = findBlock(text, MARKERS);
  if (!range) return { status: "missing" };

  const existing = text.slice(range.start, range.end);
  const expected = buildGitignoreBlock(config);
  if (existing === expected) return { status: "current" };

  const before = patternLines(existing);
  const after = patternLines(expected);
  return {
    status: "stale",
    added: after.filter((line) => !before.includes(line)),
    removed: before.filter((line) => !after.includes(line)),
  };
}

/**
 * Write the uac block into `.gitignore`, replacing an existing block.
 *
 * @param config the project's resolved config: the block follows its
 *   `types`, and includes its `agentsMd.indexDir`, which can be anywhere
 */
export async function run(root: string, config: BlockConfig = DEFAULT_CONFIG): Promise<void> {
  const gitignorePath = join(root, ".gitignore");
  const block = buildGitignoreBlock(config);
  const existing = await readGitignore(root);
  const range = findBlock(existing, MARKERS);
  const newContent = upsertBlock(existing, block, MARKERS);

  if (newContent === existing) {
    consola.info("universal-ai-config patterns in .gitignore are up to date");
    return;
  }
  await writeFile(gitignorePath, newContent, "utf-8");

  if (!existing) {
    consola.success("Created .gitignore with universal-ai-config patterns");
  } else if (range) {
    consola.success("Updated universal-ai-config patterns in .gitignore");
  } else {
    consola.success("Added universal-ai-config patterns to .gitignore");
  }
}
