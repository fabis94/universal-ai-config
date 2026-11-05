import { spawn, type IPty } from "@lydell/node-pty";
import xterm from "@xterm/headless";
import { fileURLToPath } from "node:url";

/** The built CLI (see build.ts), as users run it. */
const CLI = fileURLToPath(new URL("../../dist/cli.mjs", import.meta.url));

const KEYS = {
  up: "\x1b[A",
  down: "\x1b[B",
  right: "\x1b[C",
  left: "\x1b[D",
  space: " ",
  enter: "\r",
  tab: "\t",
  esc: "\x1b",
  backspace: "\x7f",
  "ctrl-c": "\x03",
} as const;

type Key = keyof typeof KEYS;

export function isKey(name: string): name is Key {
  return name in KEYS;
}

export interface SpawnOptions {
  cwd: string;
  cols?: number;
  rows?: number;
}

/**
 * A clean environment: no CI or test variables, which would make consola
 * hide info lines and switch to its plain reporter, and clack change symbols.
 */
function terminalEnv(): Record<string, string> {
  const env: Record<string, string> = { TERM: "xterm-256color", LANG: "C.UTF-8" };
  for (const name of ["PATH", "HOME", "USER", "TMPDIR"]) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  return env;
}

/** The real uac CLI in a pseudo-terminal, read back through a terminal emulator. */
export class TerminalSession {
  private readonly term: xterm.Terminal;
  private readonly pty: IPty;
  private pendingWrites = 0;
  private lastOutputAt = Date.now();
  private receivedOutput = false;
  private outputCount = 0;
  private disposed = false;
  private exitCode: number | undefined;
  private readonly exited: Promise<number>;

  private constructor(args: string[], options: SpawnOptions) {
    const cols = options.cols ?? 80;
    const rows = options.rows ?? 30;
    this.term = new xterm.Terminal({ cols, rows, allowProposedApi: true, scrollback: 1000 });
    this.pty = spawn(process.execPath, [CLI, ...args], {
      name: "xterm-256color",
      cols,
      rows,
      cwd: options.cwd,
      env: terminalEnv(),
    });
    this.pty.onData((data) => {
      // A killed process can still flush output
      if (this.disposed) return;
      this.receivedOutput = true;
      this.outputCount += 1;
      this.lastOutputAt = Date.now();
      this.pendingWrites += 1;
      this.term.write(data, () => {
        this.pendingWrites -= 1;
      });
    });
    this.exited = new Promise((resolve) => {
      this.pty.onExit(({ exitCode }) => {
        this.exitCode = exitCode;
        resolve(exitCode);
      });
    });
  }

  /** Start `uac <args>` and wait until its first screen has rendered. */
  static async spawn(args: string[], options: SpawnOptions): Promise<TerminalSession> {
    const session = new TerminalSession(args, options);
    // Startup has pauses (loading config) between bursts of output
    await session.idle(400);
    return session;
  }

  /** Wait until there has been output, none for `quietMs`, and the emulator has applied all of it. */
  async idle(quietMs = 150, timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const quiet = Date.now() - this.lastOutputAt >= quietMs;
      if (
        (this.receivedOutput || this.exitCode !== undefined) &&
        quiet &&
        this.pendingWrites === 0
      ) {
        return;
      }
      if (Date.now() > deadline) throw new Error(`Terminal never went idle:\n${this.screen()}`);
      await sleep(10);
    }
  }

  /** Press keys one at a time, letting the screen settle after each. */
  async press(...keys: Key[]): Promise<void> {
    for (const key of keys) await this.send(KEYS[key]);
  }

  async type(text: string): Promise<void> {
    await this.send(text);
  }

  /** Send input, wait for the CLI's response to start (if any), then for it to settle. */
  private async send(data: string): Promise<void> {
    const before = this.outputCount;
    this.pty.write(data);
    const deadline = Date.now() + 1000;
    while (this.outputCount === before && this.exitCode === undefined && Date.now() < deadline) {
      await sleep(10);
    }
    await this.idle();
  }

  /** Wait until the screen shows `expected`. */
  async waitFor(expected: string | RegExp, timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (this.pendingWrites === 0) {
        const screen = this.screen();
        if (typeof expected === "string" ? screen.includes(expected) : expected.test(screen)) {
          return;
        }
      }
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for ${String(expected)}. Screen:\n${this.screen()}`);
      }
      await sleep(10);
    }
  }

  /**
   * Wait until the CLI exits (resolving with its code) or prints nothing for
   * `quietMs` while still running (resolving undefined: it awaits input).
   */
  async settle(quietMs: number): Promise<number | undefined> {
    await this.idle(quietMs, 60_000);
    if (this.exitCode !== undefined) await this.idle(50);
    return this.exitCode;
  }

  /** Resolve with the exit code once the CLI has exited and its output is applied. */
  async waitForExit(timeoutMs = 15_000): Promise<number> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`CLI did not exit. Screen:\n${this.screen()}`)),
        timeoutMs,
      );
    });
    let code: number;
    try {
      code = await Promise.race([this.exited, timeout]);
    } finally {
      clearTimeout(timer);
    }
    await this.idle(50);
    return code;
  }

  /** The visible rows, exactly as a user would see them, with trailing blanks trimmed. */
  screen(): string {
    const buffer = this.term.buffer.active;
    const lines: string[] = [];
    for (let row = 0; row < this.term.rows; row++) {
      lines.push(buffer.getLine(buffer.viewportY + row)?.translateToString(true) ?? "");
    }
    return trimTrailingBlankLines(lines);
  }

  /** Every row printed so far, including what scrolled off the top. */
  transcript(): string {
    const buffer = this.term.buffer.active;
    const lines: string[] = [];
    for (let row = 0; row < buffer.length; row++) {
      lines.push(buffer.getLine(row)?.translateToString(true) ?? "");
    }
    return trimTrailingBlankLines(lines);
  }

  /** Stop the CLI. The emulator is freed once it has applied what was already written. */
  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.exitCode === undefined) this.pty.kill();
    const deadline = Date.now() + 1000;
    while (this.pendingWrites > 0 && Date.now() < deadline) await sleep(10);
    this.term.dispose();
  }
}

function trimTrailingBlankLines(lines: string[]): string {
  const trimmed = lines.map((line) => line.trimEnd());
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") trimmed.pop();
  return trimmed.join("\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
