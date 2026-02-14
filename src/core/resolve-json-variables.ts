/**
 * Walk parsed JSON tree, resolving {{varName}} placeholders with typed values.
 * - Exact match ("{{varName}}" is the entire string) → raw typed value (array, object, etc.)
 * - Embedded match ("prefix-{{varName}}-suffix") → string interpolation
 * - No match / undefined variable → unchanged
 */
export function resolveJsonVariables(obj: unknown, variables: Record<string, unknown>): unknown {
  if (typeof obj === "string") {
    const exactMatch = obj.match(/^\{\{(\w+)\}\}$/);
    if (exactMatch?.[1]) {
      const value = variables[exactMatch[1]];
      return value !== undefined ? value : obj;
    }
    return obj.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
      const value = variables[key];
      return value !== undefined ? String(value) : match;
    });
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => resolveJsonVariables(item, variables));
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveJsonVariables(value, variables);
    }
    return result;
  }
  return obj;
}
