import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { consola } from "consola";
import { DEFAULT_CONFIG } from "../../config/defaults.js";
import { toPosixPath } from "../../core/plan/locate.js";
import type { ResolvedConfig, TemplateType } from "../../types.js";

const BLOCK_START = "# >>> universal-ai-config >>>";
const BLOCK_END = "# <<< universal-ai-config <<<";

type BlockConfig = Pick<ResolvedConfig, "agentsMd" | "types">;

/**
 * Specific output subdirs/files per target — not entire dirs like .github/
 * which contain non-AI content (workflows, issue templates, hook scripts, etc.).
 * Each pattern belongs to the template type that writes it, so a type left out
 * of `types` (whose files may be hand-written and committed) isn't ignored.
 */
const PATTERNS: Array<{ pattern: string; type?: TemplateType }> = [
  { pattern: "/universal-ai-config.overrides.*" },
  // Claude
  { pattern: ".claude/rules/", type: "instructions" },
  { pattern: ".claude/skills/", type: "skills" },
  { pattern: ".claude/agents/", type: "agents" },
  { pattern: ".claude/settings.json", type: "hooks" },
  { pattern: ".claude/*.local.*" },
  // Copilot (.github/ has non-AI content, so list specific subdirs)
  { pattern: ".github/copilot-instructions.md", type: "instructions" },
  { pattern: ".github/instructions/", type: "instructions" },
  { pattern: ".github/skills/", type: "skills" },
  { pattern: ".github/agents/", type: "agents" },
  // Only uac's own file: .github/hooks also holds hook scripts that must be committed
  { pattern: ".github/hooks/hooks.json", type: "hooks" },
  // Cursor
  { pattern: ".cursor/rules/", type: "instructions" },
  { pattern: ".cursor/skills/", type: "skills" },
  { pattern: ".cursor/agents/", type: "agents" },
  { pattern: ".cursor/hooks.json", type: "hooks" },
  // Codex (mix of root-relative + .codex/ + .agents/ outputs)
  { pattern: ".codex/agents/", type: "agents" },
  { pattern: ".codex/hooks.json", type: "hooks" },
  { pattern: ".codex/config.toml", type: "mcp" },
  { pattern: ".agents/skills/", type: "skills" },
  // Every AGENTS.md, root and nested: uac generates them all (AGENTS.md output)
  { pattern: "AGENTS.md", type: "instructions" },
  // MCP (root-relative output paths)
  { pattern: ".mcp.json", type: "mcp" },
  { pattern: ".cursor/mcp.json", type: "mcp" },
];

/** The uac `.gitignore` block this config produces, markers included. */
export function buildGitignoreBlock(config: BlockConfig = DEFAULT_CONFIG): string {
  const enabled = (type?: TemplateType): boolean => !type || config.types.includes(type);
  const lines = PATTERNS.filter((entry) => enabled(entry.type)).map((entry) => entry.pattern);
  if (enabled("instructions")) {
    lines.push(
      "# Scoped instructions of the AGENTS.md `index` variation",
      `/${toPosixPath(config.agentsMd.indexDir)}/`,
    );
  }
  return [BLOCK_START, ...lines, BLOCK_END].join("\n");
}

async function readGitignore(root: string): Promise<string> {
  try {
    return await readFile(join(root, ".gitignore"), "utf-8");
  } catch {
    return "";
  }
}

/** Where the uac block sits in `.gitignore` text, markers included. */
function findBlock(text: string): { start: number; end: number } | undefined {
  const start = text.indexOf(BLOCK_START);
  const endMarker = text.indexOf(BLOCK_END);
  if (start === -1 || endMarker === -1) return undefined;
  return { start, end: endMarker + BLOCK_END.length };
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
  const range = findBlock(text);
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
  const range = findBlock(existing);

  let newContent: string;
  if (range) {
    newContent = `${existing.slice(0, range.start)}${block}${existing.slice(range.end)}`;
  } else if (!existing) {
    newContent = block + "\n";
  } else {
    const sep = existing.endsWith("\n") ? "\n" : "\n\n";
    newContent = `${existing}${sep}${block}\n`;
  }

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
