import type { Reporter } from "../diagnostics.js";
import {
  AGENTS_MD,
  place,
  type AgentsMdEntry,
  type IndexLink,
  type LayoutOptions,
  type Section,
} from "./layout.js";
import { orderSections, renderFile } from "./render.js";

export { AGENTS_MD, primaryFile, type AgentsMdEntry } from "./layout.js";

/**
 * Basename of the per-folder files uac 2.x wrote for Codex. Codex never loads
 * them in a root launch and they hide a same-folder AGENTS.md, so clean
 * always removes them.
 */
export const LEGACY_CODEX_OVERRIDE = "AGENTS.override.md";

/** Codex reads at most this many bytes of AGENTS.md per folder chain and drops the rest silently. */
const CODEX_AGENTS_MD_LIMIT = 32 * 1024;

/** One generated AGENTS.md or index file. */
interface AgentsMdFile {
  path: string;
  content: string;
  /** Templates that contributed, root-relative, in section order */
  sourcePaths: string[];
}

interface FileBuild {
  sections: Section[];
  links: IndexLink[];
}

/** Lay out every instruction template for a variation and render the resulting files. */
export function buildAgentsMdFiles(
  entries: AgentsMdEntry[],
  options: LayoutOptions,
  report?: Reporter,
): AgentsMdFile[] {
  const files = new Map<string, FileBuild>();
  const fileFor = (path: string): FileBuild => {
    let build = files.get(path);
    if (!build) {
      build = { sections: [], links: [] };
      files.set(path, build);
    }
    return build;
  };

  for (const entry of entries) {
    for (const placement of place(entry, options, report)) {
      if (placement.kind === "link") fileFor(AGENTS_MD).links.push(placement.link);
      else fileFor(placement.file).sections.push(placement.section);
    }
  }

  return [...files]
    .sort(([a], [b]) => (a === AGENTS_MD ? -1 : b === AGENTS_MD ? 1 : a < b ? -1 : 1))
    .map(([path, build]) => ({
      path,
      content: renderFile(build.sections, build.links),
      sourcePaths: [
        ...new Set([
          ...[...build.links]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((link) => entries.find((e) => e.name === link.name)?.sourcePath ?? ""),
          ...orderSections(build.sections, build.links.length > 0).map((s) => s.sourcePath),
        ]),
      ].filter((path) => path !== ""),
    }));
}

/** The folder an AGENTS.md path applies to ("" for the root). */
function folderOf(path: string): string {
  return path === AGENTS_MD ? "" : path.slice(0, -`/${AGENTS_MD}`.length);
}

/**
 * Check every folder chain Codex would load (root AGENTS.md, then each
 * ancestor's, then the folder's own) against its byte budget. Reports the
 * first file in each chain where the budget runs out.
 */
export function checkCodexBudget(files: AgentsMdFile[], report: Reporter): void {
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
    report({
      code: "agents-md-size",
      path: file.path,
      message:
        `${chain.join(" + ")} is ${kib} KiB; Codex reads at most 32 KiB of AGENTS.md per folder chain and silently drops the rest. ` +
        `Set agentsMd.variation to "index" so scoped instructions load on demand, or raise project_doc_max_bytes in your Codex config.`,
      detail: { files: chain, bytes, limit: CODEX_AGENTS_MD_LIMIT },
    });
  }
}
