import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { asText } from "./generate/read-cache.js";
import { safePath } from "./safe-path.js";
import { parseToml, stringifyToml } from "./toml.js";
import type { GeneratedFile } from "../types.js";

/** What `writeGeneratedFiles` did, per root-relative path. */
export interface WriteReport {
  /** Files created or whose content changed */
  written: string[];
  /** Files that already had exactly this content — left untouched */
  unchanged: string[];
}

async function readExisting(fullPath: string): Promise<Buffer | undefined> {
  return readFile(fullPath).catch(() => undefined);
}

/**
 * Replace one top-level key of an existing JSON or TOML file, keeping every
 * other key. Used for outputs that share a file with user settings (Claude
 * hooks in settings.json, Codex MCP servers in config.toml).
 */
function mergeKeyInto(
  existing: Buffer | undefined,
  content: string,
  mergeKey: string,
  format: "json" | "toml",
): string {
  const parse =
    format === "toml" ? parseToml : (text: string) => JSON.parse(text) as Record<string, unknown>;
  const data = existing ? parse(existing.toString("utf-8")) : {};
  data[mergeKey] = parse(content)[mergeKey];
  return format === "toml"
    ? `${stringifyToml(data).trimEnd()}\n`
    : `${JSON.stringify(data, null, 2)}\n`;
}

/**
 * Write generated files under `root`: raw bytes for binary content, the
 * file's `mode` when set, and only `mergeKey` for files shared with user
 * settings. Files whose content is already identical are not rewritten.
 */
export async function writeGeneratedFiles(
  files: GeneratedFile[],
  root: string,
): Promise<WriteReport> {
  const report: WriteReport = { written: [], unchanged: [] };
  for (const file of files) {
    const fullPath = safePath(root, file.path);
    const existing = await readExisting(fullPath);
    const content: string | Uint8Array = file.mergeKey
      ? mergeKeyInto(existing, asText(file.content), file.mergeKey, file.mergeFormat ?? "json")
      : file.content;
    const bytes =
      typeof content === "string" ? Buffer.from(content, "utf-8") : Buffer.from(content);

    if (existing?.equals(bytes)) {
      report.unchanged.push(file.path);
    } else {
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, bytes);
      report.written.push(file.path);
    }
    if (file.mode !== undefined) await chmod(fullPath, file.mode);
  }
  return report;
}
