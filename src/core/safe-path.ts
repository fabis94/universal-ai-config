import { resolve, relative } from "node:path";

/**
 * Validates that a path does not escape the base directory via traversal sequences.
 * Throws if the resolved path is outside the base directory.
 */
export function safePath(base: string, untrusted: string): string {
  const resolved = resolve(base, untrusted);
  const rel = relative(base, resolved);
  if (rel.startsWith("..") || rel.startsWith("/")) {
    throw new Error(`Path "${untrusted}" escapes the base directory "${base}"`);
  }
  return resolved;
}
