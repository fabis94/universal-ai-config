import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AGENT_SKILLS_DIR } from "../../core/plan/standards.js";
import { safePath } from "../../core/safe-path.js";
import { findBlock, upsertBlock, wrapBlock } from "../shared.js";
import { AGENTS_MD_MARKERS, isUacSkill, type ObsoleteItem, type SeedEntry } from "./placement.js";

/**
 * Reading and writing seed destinations — shared by the seed itself and its
 * drift check, so "what's on disk" means the same to both.
 */

async function readText(root: string, path: string): Promise<string | undefined> {
  return readFile(safePath(root, path), "utf-8").catch(() => undefined);
}

/** What uac owns at an entry's destination now: the whole file, or just its block. */
export async function currentContent(root: string, entry: SeedEntry): Promise<string | undefined> {
  const text = await readText(root, entry.destination.path);
  if (text === undefined || entry.destination.kind === "file") return text;
  const range = findBlock(text, AGENTS_MD_MARKERS);
  return range ? text.slice(range.start, range.end) : undefined;
}

/** What uac wants to own there. */
export function expectedContent(entry: SeedEntry): string {
  return entry.destination.kind === "file"
    ? entry.content
    : wrapBlock(entry.content, AGENTS_MD_MARKERS);
}

type WriteResult = "created" | "updated" | "unchanged";

/** Write one entry; a block replaces only uac's block and keeps the rest of the file. */
export async function writeEntry(root: string, entry: SeedEntry): Promise<WriteResult> {
  const { path } = entry.destination;
  const existing = await readText(root, path);
  const next =
    entry.destination.kind === "file"
      ? entry.content
      : upsertBlock(existing ?? "", expectedContent(entry), AGENTS_MD_MARKERS);
  if (existing === next) return "unchanged";
  const fullPath = safePath(root, path);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, next, "utf-8");
  return existing === undefined ? "created" : "updated";
}

/**
 * Whether uac may write into `.agents/skills/<name>/`: nothing is there yet,
 * or its SKILL.md carries uac's marker. A skill the project wrote under the
 * same name is never touched.
 */
export async function mayWriteSkill(root: string, name: string): Promise<boolean> {
  const skillMd = await readText(root, `${AGENT_SKILLS_DIR}/${name}/SKILL.md`);
  return skillMd === undefined || isUacSkill(skillMd);
}

async function exists(root: string, path: string): Promise<boolean> {
  return (await stat(join(root, path)).catch(() => undefined)) !== undefined;
}

/** Whether an obsolete item is on disk: a path, a marked skill, or uac's block. */
export async function isPresent(root: string, item: ObsoleteItem): Promise<boolean> {
  switch (item.kind) {
    case "path":
      return exists(root, item.path);
    case "skill": {
      const skillMd = await readText(root, `${AGENT_SKILLS_DIR}/${item.name}/SKILL.md`);
      return skillMd !== undefined && isUacSkill(skillMd);
    }
    case "block": {
      const text = await readText(root, item.path);
      return text !== undefined && findBlock(text, AGENTS_MD_MARKERS) !== undefined;
    }
  }
}

/** Where an obsolete item is, for messages. */
export function obsoletePath(item: ObsoleteItem): string {
  return item.kind === "skill" ? `${AGENT_SKILLS_DIR}/${item.name}` : item.path;
}

/**
 * Remove uac's copy from where the other mode put it; true when there was
 * one. A skill folder goes only while it carries uac's marker, and a block
 * takes its file along only when nothing else is left in it.
 */
export async function removeObsolete(root: string, item: ObsoleteItem): Promise<boolean> {
  if (!(await isPresent(root, item))) return false;
  if (item.kind !== "block") {
    await rm(safePath(root, obsoletePath(item)), { recursive: true, force: true });
    return true;
  }
  const text = (await readText(root, item.path)) ?? "";
  const range = findBlock(text, AGENTS_MD_MARKERS);
  if (!range) return false;
  const rest =
    `${text.slice(0, range.start).trimEnd()}\n\n${text.slice(range.end).trimStart()}`.trim();
  if (rest === "") await rm(safePath(root, item.path), { force: true });
  else await writeFile(safePath(root, item.path), `${rest}\n`, "utf-8");
  return true;
}
