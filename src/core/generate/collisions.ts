import { writesIntoStandard, type StandardType } from "../plan/standards.js";
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

/**
 * No generated file may land on the source files of a standard the project
 * keeps its instructions or skills in (`standards`). The plan never produces
 * one; this guards against a bug in it overwriting the project's own files.
 */
export function assertNoStandardWrites(
  files: GeneratedFile[],
  sourced: ReadonlySet<StandardType>,
): void {
  for (const file of files) {
    if (writesIntoStandard(file, sourced)) {
      throw new Error(
        `${file.target} would generate ${file.path}, one of the project's own ${file.type} files (\`standards\`)`,
      );
    }
  }
}
