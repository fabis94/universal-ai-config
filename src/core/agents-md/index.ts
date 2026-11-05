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
