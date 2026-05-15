import { parse, stringify } from "smol-toml";

/**
 * Parse a TOML string into a plain object.
 * Throws if the input is not valid TOML.
 */
export function parseToml(input: string): Record<string, unknown> {
  return parse(input) as Record<string, unknown>;
}

/**
 * Serialize a plain object as a TOML string.
 * Throws if values contain non-TOML-serializable types.
 */
export function stringifyToml(value: Record<string, unknown>): string {
  return stringify(value);
}
