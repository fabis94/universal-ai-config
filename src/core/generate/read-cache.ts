import { readFile } from "node:fs/promises";

/** Decode bytes as UTF-8 text (strings pass through). */
export function asText(content: string | Uint8Array): string {
  return typeof content === "string" ? content : Buffer.from(content).toString("utf-8");
}

/**
 * Reads each file from disk once per run. A template that wins for several
 * targets, or an extra file copied into several targets, is read exactly
 * once. Files are read as bytes; callers decode only what they render.
 */
export class FileReader {
  private readonly cache = new Map<string, Promise<Buffer>>();

  /** Raw bytes of a file, or of the in-memory content when one is given. */
  bytes(source: { filePath: string; content?: string | Uint8Array }): Promise<Uint8Array> {
    if (source.content !== undefined) {
      return Promise.resolve(
        typeof source.content === "string" ? Buffer.from(source.content, "utf-8") : source.content,
      );
    }
    let cached = this.cache.get(source.filePath);
    if (!cached) {
      cached = readFile(source.filePath);
      this.cache.set(source.filePath, cached);
    }
    return cached;
  }

  /** UTF-8 text of a file, or the in-memory content when one is given. */
  async text(source: { filePath: string; content?: string | Uint8Array }): Promise<string> {
    if (typeof source.content === "string") return source.content;
    return asText(await this.bytes(source));
  }
}
