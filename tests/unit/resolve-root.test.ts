import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "node:path";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { consola } from "consola";
import { resolveCliRoot } from "../../src/commands/resolve-root.js";

describe("resolveCliRoot", () => {
  let tempDir: string;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "uac-resolve-root-"));
    infoSpy = vi.spyOn(consola, "info").mockImplementation(() => undefined as never);
  });

  afterEach(async () => {
    infoSpy.mockRestore();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns an explicit root verbatim without walking up or messaging", () => {
    const sub = join(tempDir, "packages", "app");

    const root = resolveCliRoot("/explicit/root", sub);

    expect(root).toBe("/explicit/root");
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("walks up from a subdir to the uac root and informs the user", async () => {
    await mkdir(join(tempDir, ".universal-ai-config"), { recursive: true });
    const sub = join(tempDir, "packages", "app");
    await mkdir(sub, { recursive: true });

    const root = resolveCliRoot(undefined, sub);

    expect(root).toBe(tempDir);
    expect(infoSpy).toHaveBeenCalledTimes(1);
  });

  it("does not message when the start dir is already the root", async () => {
    await mkdir(join(tempDir, ".universal-ai-config"), { recursive: true });

    const root = resolveCliRoot(undefined, tempDir);

    expect(root).toBe(tempDir);
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("falls back to the start dir with no message when no root is found", async () => {
    const sub = join(tempDir, "no", "markers");
    await mkdir(sub, { recursive: true });

    const root = resolveCliRoot(undefined, sub);

    expect(root).toBe(sub);
    expect(infoSpy).not.toHaveBeenCalled();
  });
});
