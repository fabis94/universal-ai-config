import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { findFilesByName, listFilesRecursive } from "../../src/core/scan-files.js";

describe("scan-files", () => {
  const tempDirs: string[] = [];

  async function createTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "uac-scan-test-"));
    tempDirs.push(dir);
    return dir;
  }

  async function write(root: string, rel: string, content = "x"): Promise<void> {
    const full = join(root, rel);
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, content, "utf-8");
  }

  afterEach(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  describe("findFilesByName", () => {
    it("finds matches at every depth and returns sorted root-relative POSIX paths", async () => {
      const root = await createTempDir();
      await write(root, "AGENTS.override.md");
      await write(root, "packages/shared/AGENTS.override.md");
      await write(root, "packages/app/lib/tests/AGENTS.override.md");
      await write(root, "packages/app/README.md");

      expect(await findFilesByName(root, "AGENTS.override.md")).toEqual([
        "AGENTS.override.md",
        "packages/app/lib/tests/AGENTS.override.md",
        "packages/shared/AGENTS.override.md",
      ]);
    });

    it("matches the basename exactly, not as a suffix", async () => {
      const root = await createTempDir();
      await write(root, "pkg/AGENTS.override.md");
      await write(root, "pkg/OTHER-AGENTS.override.md");
      await write(root, "pkg/AGENTS.override.md.bak");

      expect(await findFilesByName(root, "AGENTS.override.md")).toEqual(["pkg/AGENTS.override.md"]);
    });

    it("prunes node_modules, .git and build output", async () => {
      const root = await createTempDir();
      await write(root, "packages/app/AGENTS.override.md");
      await write(root, "node_modules/some-pkg/AGENTS.override.md");
      await write(root, "packages/app/node_modules/nested/AGENTS.override.md");
      await write(root, ".git/AGENTS.override.md");
      await write(root, "dist/AGENTS.override.md");

      expect(await findFilesByName(root, "AGENTS.override.md")).toEqual([
        "packages/app/AGENTS.override.md",
      ]);
    });

    it("honors extraSkipDirs on top of the defaults", async () => {
      const root = await createTempDir();
      await write(root, "packages/app/AGENTS.override.md");
      await write(root, ".universal-ai-config/skills/x/AGENTS.override.md");
      await write(root, "node_modules/p/AGENTS.override.md");

      expect(
        await findFilesByName(root, "AGENTS.override.md", {
          extraSkipDirs: [".universal-ai-config"],
        }),
      ).toEqual(["packages/app/AGENTS.override.md"]);
    });

    it("honors maxDepth", async () => {
      const root = await createTempDir();
      await write(root, "AGENTS.override.md");
      await write(root, "a/AGENTS.override.md");
      await write(root, "a/b/AGENTS.override.md");

      expect(await findFilesByName(root, "AGENTS.override.md", { maxDepth: 1 })).toEqual([
        "AGENTS.override.md",
        "a/AGENTS.override.md",
      ]);
    });

    it("returns an empty array for a nonexistent root instead of throwing", async () => {
      const root = await createTempDir();
      await expect(findFilesByName(join(root, "nope"), "AGENTS.override.md")).resolves.toEqual([]);
    });

    it("does not follow symlinked directories, so a cycle terminates", async () => {
      const root = await createTempDir();
      await write(root, "real/AGENTS.override.md");
      try {
        await symlink(root, join(root, "real", "loop"), "dir");
      } catch {
        return; // symlink creation unavailable (e.g. Windows CI without privileges)
      }

      expect(await findFilesByName(root, "AGENTS.override.md")).toEqual([
        "real/AGENTS.override.md",
      ]);
    });
  });

  describe("listFilesRecursive", () => {
    it("lists every file under a directory as sorted root-relative paths", async () => {
      const root = await createTempDir();
      await write(root, ".claude/skills/a/SKILL.md");
      await write(root, ".claude/skills/b/SKILL.md");
      await write(root, ".claude/skills/b/refs/data.txt");
      await write(root, ".claude/rules/other.md");

      expect(await listFilesRecursive(root, join(root, ".claude/skills"))).toEqual([
        ".claude/skills/a/SKILL.md",
        ".claude/skills/b/SKILL.md",
        ".claude/skills/b/refs/data.txt",
      ]);
    });

    it("does not prune build-output names, since it walks uac's own output", async () => {
      const root = await createTempDir();
      await write(root, ".claude/skills/a/dist/bundled.md");

      expect(await listFilesRecursive(root, join(root, ".claude/skills"))).toEqual([
        ".claude/skills/a/dist/bundled.md",
      ]);
    });
  });
});
