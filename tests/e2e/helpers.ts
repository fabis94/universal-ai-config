import { mkdir, mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach } from "vitest";
import { UAC_VERSION } from "../../src/version.js";
import { TerminalSession, type SpawnOptions } from "./terminal.js";

/** A temp project plus the sessions started in it, cleaned up after each test. */
export interface E2eProject {
  root: string;
  write(rel: string, content?: string): Promise<void>;
  read(rel: string): Promise<string>;
  exists(rel: string): Promise<boolean>;
  /** Start `uac <args>` in this project (or `cwd` inside it). */
  start(args: string[], options?: Partial<SpawnOptions>): Promise<TerminalSession>;
  /** Run `uac <args>` to completion, for setting a project up. */
  runToExit(args: string[]): Promise<number>;
}

export function useProjects(): () => Promise<E2eProject> {
  const roots: string[] = [];
  const sessions: TerminalSession[] = [];
  afterEach(async () => {
    for (const session of sessions.splice(0)) await session.dispose();
    for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  });

  return async () => {
    const root = await mkdtemp(join(tmpdir(), "uac-e2e-"));
    roots.push(root);
    const project: E2eProject = {
      root,
      async write(rel, content = "generated") {
        await mkdir(dirname(join(root, rel)), { recursive: true });
        await writeFile(join(root, rel), content, "utf-8");
      },
      read: (rel) => readFile(join(root, rel), "utf-8"),
      exists: (rel) =>
        access(join(root, rel)).then(
          () => true,
          () => false,
        ),
      async start(args, options = {}) {
        const session = await TerminalSession.spawn(args, { cwd: root, ...options });
        sessions.push(session);
        return session;
      },
      async runToExit(args) {
        return (await project.start(args)).waitForExit();
      },
    };
    return project;
  };
}

/** The screen with the running uac version replaced, so snapshots survive releases. */
export function screenOf(session: TerminalSession): string {
  return session.screen().replaceAll(UAC_VERSION, "<uac>");
}

/** True when no row reaches the last column: nothing wrapped onto a second row. */
export function fitsWidth(screen: string, cols: number): boolean {
  return screen.split("\n").every((line) => line.length < cols);
}
