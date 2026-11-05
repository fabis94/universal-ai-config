/**
 * POSIX shell-quote a single argument. Bare words made only of safe characters
 * pass through; anything else is wrapped in single quotes, with embedded single
 * quotes escaped as `'\''`.
 */
export function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_/@:%.,+=-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Join a universal `command` + `args` into one shell string, for targets whose
 * hook handlers take a single `command` string and no args array.
 */
export function flattenCommand(command: string, args?: string[]): string {
  if (!args || args.length === 0) return command;
  return [command, ...args.map(shellQuote)].join(" ");
}
