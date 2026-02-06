const OVERRIDE_KEYS = new Set(["claude", "copilot", "cursor", "default"]);

function isPerTargetOverride(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  return keys.every((k) => OVERRIDE_KEYS.has(k));
}

/** Resolve a single value — if it's a per-target override object, extract the value for this target (falling back to default) */
export function resolveForTarget<T>(value: T, target: string): T | undefined {
  if (isPerTargetOverride(value)) {
    const obj = value as Record<string, T>;
    return target in obj ? obj[target] : obj["default"];
  }
  return value;
}

/** Resolve all fields in a plain object, returning a new object with per-target values resolved */
export function resolveOverrides(
  obj: Record<string, unknown>,
  target: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    const resolved = resolveForTarget(value, target);
    if (resolved !== undefined) {
      result[key] = resolved;
    }
  }
  return result;
}
