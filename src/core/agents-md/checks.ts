import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Reporter } from "../diagnostics.js";
import { AGENTS_MD } from "./layout.js";

/** Codex reads at most this many bytes of AGENTS.md per folder chain and drops the rest silently. */
const CODEX_AGENTS_MD_LIMIT = 32 * 1024;

/** Files that make Claude ignore every AGENTS.md when non-empty. */
const CLAUDE_MD_FILES = ["CLAUDE.md", ".claude/CLAUDE.md", "CLAUDE.local.md"];

/** An AGENTS.md file to check, at a root-relative POSIX path. */
interface AgentsMdText {
  path: string;
  content: string;
}

/**
 * Who wrote the AGENTS.md files being checked, which decides the advice:
 * uac generated them from templates, or the project keeps its own
 * (`standards`).
 */
type AgentsMdSource = "generated" | "hand-written";

/** `@AGENTS.md` on a line of its own: Claude's import of the root file. */
const IMPORTS_AGENTS_MD = /^\s*@AGENTS\.md\s*$/m;

/** The folder an AGENTS.md path applies to ("" for the root). */
function folderOf(path: string): string {
  return path === AGENTS_MD ? "" : path.slice(0, -`/${AGENTS_MD}`.length);
}

/**
 * Check every folder chain Codex would load (root AGENTS.md, then each
 * ancestor's, then the folder's own) against its byte budget. Reports the
 * first file in each chain where the budget runs out.
 */
export function checkCodexBudget(
  files: AgentsMdText[],
  report: Reporter,
  source: AgentsMdSource = "generated",
): void {
  const agentsFiles = files.filter(
    (file) => file.path === AGENTS_MD || file.path.endsWith(`/${AGENTS_MD}`),
  );
  const sizeOf = new Map(
    agentsFiles.map((file) => [folderOf(file.path), Buffer.byteLength(file.content, "utf-8")]),
  );

  const chainBytes = (folder: string): { files: string[]; bytes: number } => {
    const segments = folder === "" ? [] : folder.split("/");
    const chain: string[] = [];
    let bytes = 0;
    for (let depth = 0; depth <= segments.length; depth++) {
      const ancestor = segments.slice(0, depth).join("/");
      const size = sizeOf.get(ancestor);
      if (size === undefined) continue;
      chain.push(ancestor === "" ? AGENTS_MD : `${ancestor}/${AGENTS_MD}`);
      bytes += size;
    }
    return { files: chain, bytes };
  };

  for (const file of agentsFiles) {
    const folder = folderOf(file.path);
    const { files: chain, bytes } = chainBytes(folder);
    if (bytes <= CODEX_AGENTS_MD_LIMIT) continue;
    const parentFile = chain.at(-2);
    const parent = parentFile ? chainBytes(folderOf(parentFile)).bytes : 0;
    // Report only where the overflow starts, not every deeper folder below it
    if (parent > CODEX_AGENTS_MD_LIMIT) continue;
    const kib = (bytes / 1024).toFixed(1);
    const advice =
      source === "generated"
        ? `Set agentsMd.variation to "index" so scoped instructions load on demand, or raise project_doc_max_bytes in your Codex config.`
        : `Move some of it into skills (loaded on demand), or raise project_doc_max_bytes in your Codex config.`;
    report({
      code: "agents-md-size",
      path: file.path,
      message: `${chain.join(" + ")} is ${kib} KiB; Codex reads at most 32 KiB of AGENTS.md per folder chain and silently drops the rest. ${advice}`,
      detail: { files: chain, bytes, limit: CODEX_AGENTS_MD_LIMIT },
    });
  }
}

/**
 * Claude reads AGENTS.md only while none of its own memory files has content.
 * Warns whenever one does, even one that only imports `@AGENTS.md`: CLAUDE.md
 * and AGENTS.md side by side is worth knowing about either way.
 *
 * @param options.nested the nested AGENTS.md files, which never reach Claude
 *   while a CLAUDE.md has content, import or not
 */
export async function checkClaudeMd(
  root: string,
  report: Reporter,
  options: { source?: AgentsMdSource; nested?: string[] } = {},
): Promise<void> {
  const present: string[] = [];
  let importsAgentsMd = false;
  for (const file of CLAUDE_MD_FILES) {
    const content = await readFile(join(root, file), "utf-8").catch(() => "");
    if (content.trim() === "") continue;
    present.push(file);
    if (IMPORTS_AGENTS_MD.test(content)) importsAgentsMd = true;
  }
  if (present.length === 0) return;
  const files = present.join(", ");

  if ((options.source ?? "generated") === "generated") {
    report({
      code: "claude-md-present",
      message:
        `Claude reads AGENTS.md only when no CLAUDE.md has content, but ${files} does — so Claude gets none of uac's instructions. ` +
        `Add "@AGENTS.md" to ${present[0]} (that imports the root file only), or remove the file.`,
      detail: { files: present },
    });
    return;
  }

  const nested = options.nested ?? [];
  const lost = importsAgentsMd
    ? nested.length > 0
      ? `Its "@AGENTS.md" import brings in the root AGENTS.md, but Claude never loads the nested ones (${nested.join(", ")}).`
      : `Its "@AGENTS.md" import brings in the root AGENTS.md, but any nested AGENTS.md you add won't load in Claude.`
    : `So Claude ignores every AGENTS.md in the project.`;
  report({
    code: "claude-md-present",
    message:
      `Claude reads AGENTS.md only when no CLAUDE.md has content, but ${files} does. ${lost} ` +
      `Move its content into AGENTS.md and remove it, so every tool reads the same instructions.`,
    detail: { files: present, importsAgentsMd },
  });
}
