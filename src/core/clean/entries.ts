import { targets } from "../../targets/index.js";
import type { MarkdownTemplateType } from "../../targets/define-target.js";
import type { Locator } from "../plan/locate.js";
import { toPosixPath } from "../plan/locate.js";
import type { Target, TemplateType } from "../../types.js";

/** Something `clean` removes for one target and type. */
export type CleanEntry =
  /** A file or directory uac owns entirely */
  | { kind: "path"; type: TemplateType; path: string }
  /** One top-level key of a file shared with user settings */
  | { kind: "key"; type: TemplateType; path: string; key: string; format: "json" | "toml" };

const MARKDOWN_TYPES: MarkdownTemplateType[] = ["instructions", "skills", "agents"];

/**
 * Everything a target writes, derived from its definition: each template
 * type's `ownedPaths`, and the hooks and MCP files (only the merge key, for
 * files shared with user settings). AGENTS.md files are handled separately,
 * by a scan — see `agents-files.ts`.
 */
export function ownedEntries(target: Target, locator: Locator): CleanEntry[] {
  const definition = targets[target];
  if (!definition) return [];
  const ctx = locator.pathContext(target);
  const entries: CleanEntry[] = [];

  for (const type of MARKDOWN_TYPES) {
    const typeConfig = locator.typeConfig(target, type);
    for (const path of typeConfig?.ownedPaths(ctx) ?? []) {
      entries.push({ kind: "path", type, path: toPosixPath(path) });
    }
  }

  for (const type of ["hooks", "mcp"] as const) {
    const config = definition[type];
    if (!config) continue;
    const path = toPosixPath(config.outputPath(ctx));
    entries.push(
      config.mergeKey
        ? { kind: "key", type, path, key: config.mergeKey, format: config.format ?? "json" }
        : { kind: "path", type, path },
    );
  }
  return entries;
}
