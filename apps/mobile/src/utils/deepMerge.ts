/**
 * Deep merge utility for combining settings objects.
 * Later values override earlier values. Undefined values are skipped.
 */

function isObject(item: unknown): item is Record<string, unknown> {
  return Boolean(item && typeof item === "object" && !Array.isArray(item));
}

/**
 * Deep merges multiple objects together.
 * Later objects override earlier ones. Undefined values are skipped.
 * Arrays are replaced, not merged.
 */
export function deepMerge<T>(
  ...objects: (T | Partial<T> | undefined | null)[]
): T {
  const result = {} as Record<string, unknown>;

  for (const obj of objects) {
    if (obj == null) continue;

    for (const key of Object.keys(obj as object)) {
      const value = (obj as Record<string, unknown>)[key];

      if (value === undefined) continue;

      if (isObject(value) && isObject(result[key])) {
        // Recursively merge nested objects
        result[key] = deepMerge(result[key] as Record<string, unknown>, value);
      } else {
        // Replace value (including arrays)
        result[key] = value;
      }
    }
  }

  return result as T;
}
