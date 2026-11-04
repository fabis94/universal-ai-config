import type { IndexLink, Section, SectionRole } from "./layout.js";

/** The block that opens a root AGENTS.md in the `index` variation. */
export const INDEX_PREAMBLE = [
  "## Scoped instructions",
  "",
  "Before creating or editing files in a listed path, read the linked file in full.",
  "Read each file once per session, and again if its contents are no longer in your context.",
  "Where these files conflict with this one, they win.",
].join("\n");

/** Separates sections within one file. */
const SECTION_SEPARATOR = "\n---\n\n";

function renderSection(section: Section): string {
  const parts = [`## ${section.heading}`];
  if (section.note) parts.push(section.note);
  parts.push(section.body.trim());
  return `${parts.join("\n\n")}\n`;
}

function renderIndex(links: IndexLink[]): string {
  const lines = [...links]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((link) => `- ${link.dirs.map((dir) => `\`${dir}/\``).join(", ")} → \`${link.file}\``);
  return `${INDEX_PREAMBLE}\n\n${lines.join("\n")}\n`;
}

const ROLE_ORDER: Record<SectionRole, number> = { scoped: 0, pattern: 1, always: 2 };

/** The order sections appear in a file: by role after an index, else alphabetical. */
export function orderSections(sections: Section[], hasIndex: boolean): Section[] {
  return [...sections].sort((a, b) => {
    if (hasIndex && a.role !== b.role) return ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
    return a.name.localeCompare(b.name);
  });
}

/**
 * One AGENTS.md (or index) file: the scoped-instructions index first when
 * there is one, then the sections. With an index, inlined pattern sections
 * come before the always-on ones; otherwise sections are alphabetical.
 */
export function renderFile(sections: Section[], links: IndexLink[] = []): string {
  const sorted = orderSections(sections, links.length > 0);
  const blocks = [...(links.length > 0 ? [renderIndex(links)] : []), ...sorted.map(renderSection)];
  return blocks.join(SECTION_SEPARATOR);
}
