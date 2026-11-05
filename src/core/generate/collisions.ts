import type { GeneratedFile, Target } from "../../types.js";

function sameContent(a: string | Uint8Array, b: string | Uint8Array): boolean {
  if (typeof a === "string" && typeof b === "string") return a === b;
  return Buffer.from(a).equals(Buffer.from(b));
}

/**
 * Two outputs at one path (and merge key) must be identical; identical ones
 * collapse into one file read by both targets' consumers. Different content
 * at one path means two targets would overwrite each other — a bug in the
 * plan or a target definition, so it throws instead of picking a winner.
 */
export function assertNoPathCollisions(files: GeneratedFile[]): GeneratedFile[] {
  const byKey = new Map<string, GeneratedFile>();
  const result: GeneratedFile[] = [];
  for (const file of files) {
    const key = `${file.path}\u0000${file.mergeKey ?? ""}`;
    const existing = byKey.get(key);
    if (!existing) {
      const copy = { ...file, consumers: [...(file.consumers ?? [file.target])] };
      byKey.set(key, copy);
      result.push(copy);
      continue;
    }
    if (!sameContent(existing.content, file.content)) {
      throw new Error(
        `${existing.target} and ${file.target} both generate ${file.path} with different content`,
      );
    }
    const consumers = new Set<Target>([
      ...(existing.consumers ?? []),
      ...(file.consumers ?? [file.target]),
    ]);
    existing.consumers = [...consumers];
  }
  return result;
}
