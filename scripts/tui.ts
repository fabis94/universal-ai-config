/**
 * Drive the uac CLI in a real pseudo-terminal and print what a user would see.
 *
 *   pnpm tui [--cols 80] [--rows 30] [--cwd <dir>] [--keys "down*2,space,enter,type:abc"] -- <uac args>
 *
 * Builds dist/ first and runs the built CLI, as users do. Prints the screen
 * after startup and after each key, then stops the CLI.
 */
import { buildCli } from "../tests/e2e/build.js";
import { isKey, TerminalSession } from "../tests/e2e/terminal.js";

interface Options {
  cols: number;
  rows: number;
  cwd: string;
  keys: string[];
  args: string[];
}

function parseArgs(argv: string[]): Options {
  const separator = argv.indexOf("--");
  const own = separator === -1 ? argv : argv.slice(0, separator);
  const options: Options = {
    cols: 80,
    rows: 30,
    cwd: process.cwd(),
    keys: [],
    args: separator === -1 ? [] : argv.slice(separator + 1),
  };
  for (let i = 0; i < own.length; i += 2) {
    const value = own[i + 1];
    if (value === undefined) throw new Error(`Missing value for ${own[i]}`);
    switch (own[i]) {
      case "--cols":
        options.cols = Number(value);
        break;
      case "--rows":
        options.rows = Number(value);
        break;
      case "--cwd":
        options.cwd = value;
        break;
      case "--keys":
        options.keys = value.split(",").flatMap(expandKey);
        break;
      default:
        throw new Error(`Unknown option ${own[i]}`);
    }
  }
  return options;
}

/** `down*3` → three downs; `type:abc` stays one step. */
function expandKey(spec: string): string[] {
  const trimmed = spec.trim();
  if (trimmed.startsWith("type:")) return [trimmed];
  const [name = "", count] = trimmed.split("*");
  if (!isKey(name)) throw new Error(`Unknown key "${name}"`);
  return Array.from({ length: count ? Number(count) : 1 }, () => name);
}

function printFrame(title: string, session: TerminalSession, cols: number): void {
  const rule = "─".repeat(Math.max(0, cols - title.length - 4));
  process.stdout.write(`── ${title} ${rule}\n${session.screen()}\n`);
}

const options = parseArgs(process.argv.slice(2));
await buildCli();
const session = await TerminalSession.spawn(options.args, options);
try {
  printFrame(
    `uac ${options.args.join(" ")} (${options.cols}x${options.rows})`,
    session,
    options.cols,
  );
  for (const key of options.keys) {
    if (key.startsWith("type:")) await session.type(key.slice("type:".length));
    else if (isKey(key)) await session.press(key);
    printFrame(`after ${key}`, session, options.cols);
  }
  // Let work started by the last key finish: until exit, or 2s without output
  const exitCode = await session.settle(2000);
  if (exitCode !== undefined) printFrame(`exited with code ${exitCode}`, session, options.cols);
} finally {
  await session.dispose();
}
