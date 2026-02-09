import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { consola } from "consola";

const BLOCK_START = "# >>> universal-ai-config >>>";
const BLOCK_END = "# <<< universal-ai-config <<<";

// Specific output subdirs/files per target — not entire dirs like .github/
// which contain non-AI content (workflows, issue templates, etc.)
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
  ".github/hooks/",
  // Cursor
  ".cursor/rules/",
  ".cursor/skills/",
  ".cursor/hooks.json",
];

function buildBlock(): string {
  return [BLOCK_START, ...PATTERNS, BLOCK_END].join("\n");
}

export async function run(root: string): Promise<void> {
  const gitignorePath = join(root, ".gitignore");
  const block = buildBlock();

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
