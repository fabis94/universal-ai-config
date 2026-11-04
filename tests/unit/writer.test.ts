import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { writeGeneratedFiles } from "../../src/core/writer.js";
import type { GeneratedFile } from "../../src/types.js";

const file = (over: Partial<GeneratedFile>): GeneratedFile => ({
  path: "out/a.md",
  content: "hello\n",
  target: "claude",
  type: "instructions",
  sourcePath: "src",
  ...over,
});

describe("writeGeneratedFiles", () => {
  const dirs: string[] = [];
  async function root(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "uac-writer-"));
    dirs.push(dir);
    return dir;
  }
  afterEach(async () => {
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
  });

  it("writes text and bytes, creating folders, and reports what it wrote", async () => {
    const dir = await root();
    const bytes = new Uint8Array([0x89, 0x50, 0x00, 0xff]);
    const report = await writeGeneratedFiles(
      [file({}), file({ path: "out/bin/x.png", content: bytes })],
      dir,
    );
    expect(report).toEqual({ written: ["out/a.md", "out/bin/x.png"], unchanged: [] });
    expect(await readFile(join(dir, "out/a.md"), "utf-8")).toBe("hello\n");
    expect((await readFile(join(dir, "out/bin/x.png"))).equals(Buffer.from(bytes))).toBe(true);
  });

  it("leaves files that already have the content alone", async () => {
    const dir = await root();
    await writeGeneratedFiles([file({})], dir);
    const before = (await stat(join(dir, "out/a.md"))).mtimeMs;
    const report = await writeGeneratedFiles([file({}), file({ path: "out/b.md" })], dir);
    expect(report).toEqual({ written: ["out/b.md"], unchanged: ["out/a.md"] });
    expect((await stat(join(dir, "out/a.md"))).mtimeMs).toBe(before);
  });

  it("applies mode", async () => {
    const dir = await root();
    await writeGeneratedFiles([file({ path: "run.sh", content: "#!/bin/sh\n", mode: 0o755 })], dir);
    expect((await stat(join(dir, "run.sh"))).mode & 0o777).toBe(0o755);
  });

  it("merges one JSON key into an existing file, keeping the rest", async () => {
    const dir = await root();
    await mkdir(join(dir, ".claude"), { recursive: true });
    await writeFile(
      join(dir, ".claude/settings.json"),
      JSON.stringify({ permissions: { allow: [] } }),
    );
    const hooks = file({
      path: ".claude/settings.json",
      type: "hooks",
      content: JSON.stringify({ hooks: { Stop: [] } }),
      mergeKey: "hooks",
    });
    expect((await writeGeneratedFiles([hooks], dir)).written).toEqual([".claude/settings.json"]);
    expect(JSON.parse(await readFile(join(dir, ".claude/settings.json"), "utf-8"))).toEqual({
      permissions: { allow: [] },
      hooks: { Stop: [] },
    });
    // Second run: the merged result is identical, so nothing is rewritten
    expect((await writeGeneratedFiles([hooks], dir)).unchanged).toEqual([".claude/settings.json"]);
  });

  it("merges one TOML key into an existing file", async () => {
    const dir = await root();
    await mkdir(join(dir, ".codex"), { recursive: true });
    await writeFile(join(dir, ".codex/config.toml"), 'model = "x"\n');
    await writeGeneratedFiles(
      [
        file({
          path: ".codex/config.toml",
          type: "mcp",
          content: '[mcp_servers.a]\ncommand = "npx"\n',
          mergeKey: "mcp_servers",
          mergeFormat: "toml",
        }),
      ],
      dir,
    );
    expect(parseToml(await readFile(join(dir, ".codex/config.toml"), "utf-8"))).toEqual({
      model: "x",
      mcp_servers: { a: { command: "npx" } },
    });
  });

  it("refuses paths outside the root", async () => {
    await expect(writeGeneratedFiles([file({ path: "../x" })], await root())).rejects.toThrow(
      /escapes/,
    );
  });
});
