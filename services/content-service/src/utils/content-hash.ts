/**
 * @noema/content-service - Content Hash Utility
 *
 * Generates deterministic SHA-256 hashes from card content for deduplication.
 * The hash covers cardType + content so that two cards with the same content
 * but different types are treated as distinct.
 */

import { createHash } from 'node:crypto';

// ============================================================================
// Stable JSON Serialization
// ============================================================================

/**
 * Create a sorted, deterministic JSON string from an object.
 * Ensures the same logical content always produces the same hash regardless
 * of property insertion order.
 */
function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return '';
  if (typeof obj !== 'object') return JSON.stringify(obj);

  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => stableStringify(item)).join(',') + ']';
  }

  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sortedKeys.map((key) => {
    const value = (obj as Record<string, unknown>)[key];
    return JSON.stringify(key) + ':' + stableStringify(value);
  });
  return '{' + pairs.join(',') + '}';
}

// ============================================================================
// Content Hash
// ============================================================================

/**
 * Generate a SHA-256 hash of card content for deduplication.
 *
 * Hash inputs: `{ cardType, content }` — deterministically serialized.
 * Two cards with identical cardType and content will always produce the same
 * hash, regardless of metadata, tags, or other fields.
 *
 * @returns 64-character lowercase hex string
 */
export function generateContentHash(
  cardType: string,
  content: Record<string, unknown>
): string {
  const payload = stableStringify({ cardType, content });
  return createHash('sha256').update(payload).digest('hex');
}
