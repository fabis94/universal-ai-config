import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { findProjectRoot } from "../../src/core/find-project-root.js";

describe("findProjectRoot", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "uac-find-root-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("detects a config file at the start dir (no walk-up)", async () => {
    await writeFile(join(tempDir, "universal-ai-config.config.ts"), "", "utf-8");

    const result = findProjectRoot(tempDir);

    expect(result).toEqual({
      root: tempDir,
      startDir: tempDir,
      walkedUp: false,
      found: true,
    });
  });

  it("detects a .universal-ai-config directory at the start dir (no walk-up)", async () => {
    await mkdir(join(tempDir, ".universal-ai-config"), { recursive: true });

    const result = findProjectRoot(tempDir);

    expect(result).toEqual({
      root: tempDir,
      startDir: tempDir,
      walkedUp: false,
      found: true,
    });
  });

  it("walks up to a parent that is a uac root", async () => {
    await mkdir(join(tempDir, ".universal-ai-config"), { recursive: true });
    const sub = join(tempDir, "packages", "app");
    await mkdir(sub, { recursive: true });

    const result = findProjectRoot(sub);

    expect(result).toEqual({
      root: tempDir,
      startDir: sub,
      walkedUp: true,
      found: true,
    });
  });

  it("resolves the nearest ancestor with a marker", async () => {
    // Marker only at tempDir; start several levels below.
    await writeFile(join(tempDir, "universal-ai-config.config.ts"), "", "utf-8");
    const deep = join(tempDir, "a", "b", "c", "d");
    await mkdir(deep, { recursive: true });

    const result = findProjectRoot(deep);

    expect(result.root).toBe(tempDir);
    expect(result.walkedUp).toBe(true);
    expect(result.found).toBe(true);
  });

  it("falls back to the start dir when no marker exists up the tree", async () => {
    const sub = join(tempDir, "no", "markers", "here");
    await mkdir(sub, { recursive: true });

    const result = findProjectRoot(sub);

    expect(result).toEqual({
      root: sub,
      startDir: sub,
      walkedUp: false,
      found: false,
    });
  });

  it("detects config files regardless of extension", async () => {
    const tsDir = join(tempDir, "ts-proj");
    const mjsDir = join(tempDir, "mjs-proj");
    await mkdir(tsDir, { recursive: true });
    await mkdir(mjsDir, { recursive: true });
    await writeFile(join(tsDir, "universal-ai-config.config.ts"), "", "utf-8");
    await writeFile(join(mjsDir, "universal-ai-config.config.mjs"), "", "utf-8");

    expect(findProjectRoot(tsDir).found).toBe(true);
    expect(findProjectRoot(mjsDir).found).toBe(true);
  });

  it("does not treat a .universal-ai-config file (not a directory) as a marker", async () => {
    const sub = join(tempDir, "with-file");
    await mkdir(sub, { recursive: true });
    await writeFile(join(sub, ".universal-ai-config"), "not a dir", "utf-8");

    const result = findProjectRoot(sub);

    expect(result.found).toBe(false);
    expect(result.root).toBe(sub);
  });
});
