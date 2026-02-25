/**
 * @noema/content-service - Cursor Pagination Utilities
 *
 * Encodes and decodes opaque cursor strings for cursor-based pagination.
 * Cursor format: base64url(JSON({ id, sortValue, sortField }))
 *
 * The compound cursor (sortField value + id) ensures stable pagination
 * even when multiple records share the same sort value.
 */

// ============================================================================
// Cursor Types
// ============================================================================

export interface ICursorData {
  /** Card ID (primary sort tiebreaker) */
  id: string;
  /** Value of the sort field (ISO string for dates, raw string for others) */
  sortValue: string;
  /** Name of the sort field */
  sortField: string;
}

// ============================================================================
// Encode / Decode
// ============================================================================

/**
 * Encode cursor data into an opaque base64url string.
 */
export function encodeCursor(data: ICursorData): string {
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

/**
 * Decode an opaque cursor string back into cursor data.
 * Returns null if the cursor is invalid or malformed.
 */
export function decodeCursor(cursor: string): ICursorData | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf-8');
    const parsed: unknown = JSON.parse(raw);
    const data = parsed as ICursorData;
    if (typeof data.id !== 'string' || data.id === '' || typeof data.sortField !== 'string' || data.sortField === '') return null;
    return data;
  } catch {
    return null;
  }
}
