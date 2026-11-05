import {
  cancel,
  confirm,
  intro,
  isCancel,
  multiselect,
  note,
  outro,
  select,
  type Option,
} from "@clack/prompts";

/**
 * The only module that talks to @clack/prompts, so tests can mock every
 * prompt in one place. Output goes through consola, never prompts.
 */

/** One option of a select prompt. clack shows `hint` only on selected or focused options. */
export interface Choice<T extends string> {
  value: T;
  label: string;
  hint?: string;
  disabled?: boolean;
}

/** Prompts need a real terminal on both ends: never in CI, pipes, or an agent's shell. */
export function canPrompt(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/** Ask a yes/no question. `undefined` when cancelled (Esc, Ctrl+C). */
export async function askYesNo(
  message: string,
  initialValue?: boolean,
): Promise<boolean | undefined> {
  const answer = await confirm({ message, initialValue });
  return isCancel(answer) ? undefined : answer;
}

/** Ask a yes/no question. Cancelling counts as no. */
export async function confirmAction(message: string, initialValue?: boolean): Promise<boolean> {
  return (await askYesNo(message, initialValue)) === true;
}

/** Pick any number of choices. `undefined` when cancelled. */
export async function selectMany<T extends string>(
  message: string,
  choices: Choice<T>[],
  options: { initial?: T[]; required?: boolean } = {},
): Promise<T[] | undefined> {
  const answer = await multiselect<T>({
    message,
    // clack's Option<T> is conditional on T, which a generic T can't satisfy
    options: choices as Option<T>[],
    initialValues: options.initial,
    required: options.required ?? false,
  });
  return isCancel(answer) ? undefined : answer;
}

/** Pick one choice. `undefined` when cancelled. */
export async function selectOne<T extends string>(
  message: string,
  choices: Choice<T>[],
  initial?: T,
): Promise<T | undefined> {
  const answer = await select<T>({
    message,
    options: choices as Option<T>[],
    initialValue: initial,
  });
  return isCancel(answer) ? undefined : answer;
}

/** A boxed explanation shown before a prompt. */
export function showNote(message: string, title?: string): void {
  note(message, title);
}

/** Open a multi-step flow. */
export function startFlow(title: string): void {
  intro(title);
}

/** Close a multi-step flow, successfully or not. */
export function endFlow(message: string, options: { cancelled?: boolean } = {}): void {
  if (options.cancelled) cancel(message);
  else outro(message);
}
