import { confirm, isCancel } from "@clack/prompts";

/** Prompts need a real terminal on both ends: never in CI, pipes, or an agent's shell. */
export function canPrompt(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/** Ask a yes/no question. Cancelling (Esc, Ctrl+C) counts as no. */
export async function confirmAction(message: string): Promise<boolean> {
  const answer = await confirm({ message });
  return !isCancel(answer) && answer === true;
}
