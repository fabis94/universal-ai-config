import { readFile } from "node:fs/promises";
import type { DiscoveredTemplate } from "./discover.js";

/**
 * Reads template content once per file path, so a template that wins for
 * several targets is still read from disk exactly once.
 */
export class TemplateReader {
  private readonly cache = new Map<string, string>();

  async read(template: Pick<DiscoveredTemplate, "filePath" | "content">): Promise<string> {
    if (template.content !== undefined) return template.content;
    const cached = this.cache.get(template.filePath);
    if (cached !== undefined) return cached;
    const content = await readFile(template.filePath, "utf-8");
    this.cache.set(template.filePath, content);
    return content;
  }
}
