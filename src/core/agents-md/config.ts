import { isAbsolute, relative, resolve } from "node:path";
import { DEFAULT_CONFIG } from "../../config/defaults.js";
import { createLocator, toPosixPath } from "../plan/locate.js";
import { targets } from "../../targets/index.js";
import type { MarkdownTemplateType } from "../../targets/define-target.js";
import type { ResolvedConfig, Target } from "../../types.js";

/** The folders uac reads from inside a templates dir. */
const TEMPLATE_SUBDIRS = ["instructions", "skills", "agents", "hooks", "mcp", "docs"];

/** `a` is `b` or inside it (both POSIX, root-relative). */
function isWithin(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}/`);
}

/**
 * Folders tools load instructions, skills or agents from on their own. Scoped
 * index files must not land in any of them, or tools would load them
 * unconditionally and the index would be pointless (or duplicate them).
 */
function toolLoadedDirs(config: Pick<ResolvedConfig, "outputDirs">): string[] {
  const dirs = new Set<string>([
    // Tool-scanned locations no uac target writes to
    ".codex/skills",
    ".agents/skills",
  ]);
  const types: MarkdownTemplateType[] = ["instructions", "skills", "agents"];
  // Both the configured and the default output dirs: tools read the defaults
  // whatever uac's outputDirs say.
  for (const outputDirs of [config.outputDirs, DEFAULT_CONFIG.outputDirs]) {
    const locator = createLocator({ outputDirs });
    for (const target of Object.keys(targets) as Target[]) {
      for (const type of types) {
        if (!locator.typeConfig(target, type)) continue;
        const dir = locator.typeDir(target, type);
        // Codex's instruction "dir" is the project root itself
        if (dir !== "." && dir !== "") dirs.add(dir);
      }
    }
  }
  return [...dirs];
}

/** A template source dir as a root-relative POSIX path, or undefined when it's outside the root. */
function rootRelative(root: string, dir: string): string | undefined {
  const rel = relative(root, resolve(root, dir));
  if (rel === "") return ".";
  if (rel.startsWith("..") || isAbsolute(rel)) return undefined;
  return toPosixPath(rel);
}

/**
 * Reject an `agentsMd.indexDir` uac can't safely own: clean deletes it, and
 * tools must not load its files on their own.
 */
export function validateAgentsMdConfig(config: ResolvedConfig, root: string): void {
  const raw = config.agentsMd.indexDir;
  const fail = (why: string): never => {
    throw new Error(`Invalid agentsMd.indexDir "${raw}": ${why}`);
  };

  if (raw.trim() === "") fail("it is empty");
  if (isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw))
    fail("it must be relative to the project root");
  const indexDir = toPosixPath(raw);
  if (indexDir === "." || indexDir === "") fail("it can't be the project root");
  if (indexDir.split("/").includes("..")) fail('it can\'t contain ".."');

  const templateDirs = [config.templatesDir, ...config.additionalTemplateDirs]
    // `~` dirs are outside the project, like any other dir rootRelative rejects
    .filter((dir) => !dir.startsWith("~"))
    .map((dir) => rootRelative(root, dir))
    .filter((dir): dir is string => dir !== undefined);
  for (const dir of templateDirs) {
    // A templates dir at the project root only owns the folders uac scans in it
    const owned =
      dir === "." ? TEMPLATE_SUBDIRS : [dir, ...TEMPLATE_SUBDIRS.map((sub) => `${dir}/${sub}`)];
    for (const ownedDir of owned) {
      if (isWithin(indexDir, ownedDir) || isWithin(ownedDir, indexDir)) {
        fail(`it overlaps the templates dir "${dir}" (clean deletes the index dir)`);
      }
    }
  }

  for (const dir of toolLoadedDirs(config)) {
    if (isWithin(indexDir, dir)) {
      fail(`tools load files from "${dir}" on their own, so the index would be bypassed`);
    }
  }
}
