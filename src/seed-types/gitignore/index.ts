import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { consola } from "consola";
import { DEFAULT_CONFIG } from "../../config/defaults.js";
import { toPosixPath } from "../../core/plan/locate.js";
import type { ResolvedConfig } from "../../types.js";

const BLOCK_START = "# >>> universal-ai-config >>>";
const BLOCK_END = "# <<< universal-ai-config <<<";

// Specific output subdirs/files per target — not entire dirs like .github/
// which contain non-AI content (workflows, issue templates, hook scripts, etc.)
const PATTERNS = [
  "/universal-ai-config.overrides.*",
  // Claude
  ".claude/rules/",
  ".claude/skills/",
  ".claude/agents/",
  ".claude/settings.json",
  ".claude/*.local.*",
  // Copilot (.github/ has non-AI content, so list specific subdirs)
  ".github/copilot-instructions.md",
  ".github/instructions/",
  ".github/skills/",
  ".github/agents/",
  // Only uac's own file: .github/hooks also holds hook scripts that must be committed
  ".github/hooks/hooks.json",
  // Cursor
  ".cursor/rules/",
  ".cursor/skills/",
  ".cursor/agents/",
  ".cursor/hooks.json",
  // Codex (mix of root-relative + .codex/ + .agents/ outputs)
  ".codex/",
  ".agents/skills/",
  // Every AGENTS.md, root and nested: uac generates them all (AGENTS.md output)
  "AGENTS.md",
  // MCP (root-relative output paths)
  ".mcp.json",
  ".cursor/mcp.json",
];

function buildBlock(indexDir: string): string {
  const scoped = [
    "# Scoped instructions of the AGENTS.md `index` variation",
    `/${toPosixPath(indexDir)}/`,
  ];
  return [BLOCK_START, ...PATTERNS, ...scoped, BLOCK_END].join("\n");
}

/**
 * Write the uac block into `.gitignore`, replacing an existing block.
 *
 * @param config the project's resolved config: the block includes its
 *   `agentsMd.indexDir`, which can be anywhere in the project
 */
export async function run(
  root: string,
  config: Pick<ResolvedConfig, "agentsMd"> = DEFAULT_CONFIG,
): Promise<void> {
  const gitignorePath = join(root, ".gitignore");
  const block = buildBlock(config.agentsMd.indexDir);

  let existing = "";
  try {
    existing = await readFile(gitignorePath, "utf-8");
  } catch {
    // File doesn't exist yet
  }

  const startIdx = existing.indexOf(BLOCK_START);
  const endIdx = existing.indexOf(BLOCK_END);

  let newContent: string;

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace existing block
    const before = existing.substring(0, startIdx);
    const after = existing.substring(endIdx + BLOCK_END.length);
    newContent = `${before}${block}${after}`;
  } else if (!existing) {
    // New file
    newContent = block + "\n";
  } else {
    // Append to existing file
    const sep = existing.endsWith("\n") ? "\n" : "\n\n";
    newContent = `${existing}${sep}${block}\n`;
  }

  await writeFile(gitignorePath, newContent, "utf-8");

  if (!existing) {
    consola.success("Created .gitignore with universal-ai-config patterns");
  } else if (startIdx !== -1) {
    consola.success("Updated universal-ai-config patterns in .gitignore");
  } else {
    consola.success("Added universal-ai-config patterns to .gitignore");
  }
}
