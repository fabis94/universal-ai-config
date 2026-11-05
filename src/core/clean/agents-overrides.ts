import { rm } from "node:fs/promises";
import { DEFAULT_CONFIG } from "../../config/defaults.js";
import { targets } from "../../targets/index.js";
import type { DiagnosticInput } from "../diagnostics.js";
import { sourcedTypes } from "../plan/standards.js";
import { createPreserveMatcher } from "../preserve-on-clean.js";
import { safePath } from "../safe-path.js";
import type { PerTargetValue, StandardsSetting, Target, TemplateType } from "../../types.js";
import { findFilesOutsideInputs, templateDirsWithin } from "./agents-files.js";

/**
 * Basename of the per-folder files uac 2.x wrote for Codex. uac 3 writes
 * AGENTS.md instead, and Codex reads an AGENTS.override.md in place of the
 * AGENTS.md in the same folder, so a leftover one hides uac's instructions.
 * A file by this name can also be hand-written, so uac never deletes one
 * without asking.
 */
const AGENTS_OVERRIDE = "AGENTS.override.md";

const ALL_TYPES = DEFAULT_CONFIG.types;

export interface AgentsOverrideOptions {
  /** Templates dir: its input folders are never scanned. */
  templatesDir?: string;
  /** Extra template dirs, skipped like `templatesDir`. */
  additionalTemplateDirs?: string[];
  /** A path this keeps for any target is left out. */
  preserveOnClean?: PerTargetValue<string[]>;
  /** With `keepOverrideFiles: true` the files are the user's, and none are returned. */
  agentsMd?: { keepOverrideFiles?: boolean };
  /**
   * With instructions from AGENTS.md (`standards`), AGENTS.override.md files
   * are hand-written instructions like the rest, and none are returned.
   */
  standards?: StandardsSetting;
  /** The project's `types`, which `standards` applies within. Default: every type. */
  types?: TemplateType[];
}

/**
 * The AGENTS.override.md files uac warns about and offers to delete: every
 * one in the project except template inputs and paths `preserveOnClean`
 * keeps. None when they're the project's own: `agentsMd.keepOverrideFiles`
 * is set, or instructions come from AGENTS.md (`standards`). Root-relative,
 * sorted.
 */
export async function findAgentsOverrideFiles(
  root: string,
  options: AgentsOverrideOptions = {},
): Promise<string[]> {
  if (options.agentsMd?.keepOverrideFiles === true) return [];
  const facts = { standards: options.standards ?? false, types: options.types ?? ALL_TYPES };
  if (sourcedTypes(facts).has("instructions")) return [];
  const templateDirs = templateDirsWithin(root, [
    options.templatesDir ?? DEFAULT_CONFIG.templatesDir,
    ...(options.additionalTemplateDirs ?? []),
  ]);
  const found = await findFilesOutsideInputs(root, AGENTS_OVERRIDE, templateDirs);
  // No current target owns these files, so a pattern for any target keeps one.
  const preserved = (Object.keys(targets) as Target[]).map((target) =>
    createPreserveMatcher(options.preserveOnClean, target),
  );
  return found.filter((rel) => !preserved.some((matches) => matches(rel)));
}

/**
 * Delete root-relative AGENTS.override.md paths, as returned by
 * `findAgentsOverrideFiles()`. Returns the paths that existed and were removed.
 */
export async function removeAgentsOverrideFiles(root: string, paths: string[]): Promise<string[]> {
  const removed: string[] = [];
  for (const rel of paths) {
    if (rel.split("/").at(-1) !== AGENTS_OVERRIDE) {
      throw new Error(
        `removeAgentsOverrideFiles only removes ${AGENTS_OVERRIDE} files, got "${rel}"`,
      );
    }
    const existed = await rm(safePath(root, rel)).then(
      () => true,
      () => false,
    );
    if (existed) removed.push(rel);
  }
  return removed;
}

/** The warning for leftover AGENTS.override.md files, shared by generate and clean. */
export function agentsOverrideDiagnostic(paths: string[]): DiagnosticInput {
  const one = paths.length === 1;
  const found = one ? "an AGENTS.override.md file" : `${paths.length} AGENTS.override.md files`;
  return {
    code: "agents-override-present",
    type: "instructions",
    message:
      `Found ${found}, probably left by uac 2.x. Codex reads ${one ? "it" : "them"} instead of the AGENTS.md in the same folder, so ${one ? "it hides" : "they hide"} uac's instructions there. ` +
      `Delete ${one ? "it" : "them"}, or set agentsMd.keepOverrideFiles: true if ${one ? "it's" : "they're"} yours.`,
    detail: { paths },
  };
}
