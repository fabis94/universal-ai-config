import { readFileSync } from "node:fs";

/** The running uac version. package.json sits one level above both `src/` and `dist/`. */
export const UAC_VERSION: string = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")) as {
    version: string;
  }
).version;

/** Compare dotted versions numerically (`2.10.0` > `2.9.1`); prerelease suffixes are ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (version: string): number[] =>
    (version.trim().split("-")[0] ?? "").split(".").map((n) => Number.parseInt(n, 10) || 0);
  const left = parts(a);
  const right = parts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}
