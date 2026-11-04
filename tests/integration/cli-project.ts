import { cp, mkdir, mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runCommand } from "citty";
import { consola } from "consola";
import { vi } from "vitest";
import cleanCommand from "../../src/commands/clean.js";
import generateCommand from "../../src/commands/generate.js";

/** A temp project for CLI-level tests, optionally seeded from a fixture. */
export class CliProject {
  private constructor(readonly root: string) {}

  static async create(fixture?: string): Promise<CliProject> {
    const root = await mkdtemp(join(tmpdir(), "uac-cli-"));
    if (fixture) await cp(fixture, root, { recursive: true });
    return new CliProject(root);
  }

  async write(rel: string, content = "generated"): Promise<void> {
    await mkdir(dirname(join(this.root, rel)), { recursive: true });
    await writeFile(join(this.root, rel), content, "utf-8");
  }

  async read(rel: string): Promise<string> {
    return readFile(join(this.root, rel), "utf-8");
  }

  async exists(rel: string): Promise<boolean> {
    return access(join(this.root, rel)).then(
      () => true,
      () => false,
    );
  }

  async config(config: Record<string, unknown>): Promise<void> {
    await this.write("universal-ai-config.config.json", JSON.stringify(config, null, 2));
  }

  /** Run a uac command; returns everything it logged. */
  async run(command: "generate" | "clean", args: string[] = []): Promise<string[]> {
    const lines: string[] = [];
    const spies = (["info", "success", "warn", "log", "start"] as const).map((level) =>
      vi.spyOn(consola, level).mockImplementation((msg: unknown) => {
        lines.push(String(msg));
      }),
    );
    try {
      await runCommand(command === "generate" ? generateCommand : cleanCommand, {
        rawArgs: ["--root", this.root, ...args],
      });
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    return lines;
  }

  async dispose(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
  }
}
