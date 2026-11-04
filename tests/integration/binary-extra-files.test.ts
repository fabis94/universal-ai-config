import { afterEach, describe, expect, it } from "vitest";
import { chmod, cp, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generate } from "../../src/core/generate/index.js";
import { writeGeneratedFiles } from "../../src/core/writer.js";
import { text } from "../test-helpers.js";

const FIXTURE = join(import.meta.dirname, "../fixtures/binary-extra-files-project");
const SKILL_SRC = join(FIXTURE, ".universal-ai-config/skills/asset-skill");

describe("skill extra files are copied byte for byte", () => {
  const tempDirs: string[] = [];
  async function tempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "uac-binary-"));
    tempDirs.push(dir);
    return dir;
  }
  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true, force: true });
  });

  it("emits a binary asset unchanged for claude and codex", async () => {
    const source = await readFile(join(SKILL_SRC, "assets/logo.png"));
    const files = await generate({
      root: FIXTURE,
      targets: ["claude", "codex"],
      types: ["skills"],
    });

    for (const path of [
      ".claude/skills/asset-skill/assets/logo.png",
      ".agents/skills/asset-skill/assets/logo.png",
    ]) {
      const file = files.find((f) => f.path === path);
      expect(file, path).toBeDefined();
      expect(file!.content).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(file!.content as Uint8Array).equals(source)).toBe(true);
    }
  });

  it("copies non-markdown text raw, without EJS rendering", async () => {
    const files = await generate({ root: FIXTURE, targets: ["claude"], types: ["skills"] });
    const script = files.find((f) => f.path === ".claude/skills/asset-skill/scripts/run.sh");
    expect(text(script)).toBe('#!/bin/sh\necho "hello from <%= target %>"\n');
    // SKILL.md itself is still rendered
    const skill = files.find((f) => f.path === ".claude/skills/asset-skill/SKILL.md");
    expect(text(skill)).toContain("(target: claude)");
  });

  it("leaves mode unset for files without an exec bit", async () => {
    const files = await generate({ root: FIXTURE, targets: ["claude"], types: ["skills"] });
    const png = files.find((f) => f.path.endsWith("assets/logo.png"));
    expect(png!.mode).toBeUndefined();
  });

  it("keeps the exec bit of a script through generate and write", async () => {
    const project = await tempDir();
    await cp(FIXTURE, project, { recursive: true });
    await chmod(join(project, ".universal-ai-config/skills/asset-skill/scripts/run.sh"), 0o755);

    const files = await generate({
      root: project,
      targets: ["claude", "codex"],
      types: ["skills"],
    });
    const scripts = files.filter((f) => f.path.endsWith("scripts/run.sh"));
    expect(scripts.map((f) => f.path).sort()).toEqual([
      ".agents/skills/asset-skill/scripts/run.sh",
      ".claude/skills/asset-skill/scripts/run.sh",
    ]);
    for (const file of scripts) expect(file.mode).toBe(0o755);

    const out = await tempDir();
    await writeGeneratedFiles(files, out);
    for (const file of scripts) {
      const { mode } = await stat(join(out, file.path));
      expect(mode & 0o777).toBe(0o755);
    }
    const png = await readFile(join(out, ".claude/skills/asset-skill/assets/logo.png"));
    expect(png.equals(await readFile(join(SKILL_SRC, "assets/logo.png")))).toBe(true);
  });

  it("accepts Uint8Array content and a mode on in-memory extra files", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
    const files = await generate({
      root: await tempDir(),
      targets: ["claude"],
      types: ["skills"],
      templates: [
        {
          name: "mem",
          type: "skills",
          content: "---\nname: mem\ndescription: in memory\n---\nBody",
          extraFiles: [
            { relativePath: "bin/blob.dat", content: bytes },
            { relativePath: "bin/tool.sh", content: "#!/bin/sh\n", mode: 0o750 },
          ],
        },
      ],
    });
    const blob = files.find((f) => f.path === ".claude/skills/mem/bin/blob.dat");
    expect(Buffer.from(blob!.content as Uint8Array).equals(Buffer.from(bytes))).toBe(true);
    const tool = files.find((f) => f.path === ".claude/skills/mem/bin/tool.sh");
    expect(tool!.mode).toBe(0o750);
    expect(text(tool)).toBe("#!/bin/sh\n");
  });
});
