/**
 * @noema/content-service — Cursor Utility Tests
 *
 * Tests cursor encode/decode round-trip and error handling.
 */

import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../../../src/utils/cursor.js';
import type { ICursorData } from '../../../src/utils/cursor.js';

describe('cursor utilities', () => {
  // ==========================================================================
  // encodeCursor / decodeCursor
  // ==========================================================================

  describe('encodeCursor()', () => {
    it('produces a base64url string', () => {
      const data: ICursorData = {
        id: 'card_abc123',
        sortValue: '2026-01-15T10:30:00.000Z',
        sortField: 'createdAt',
      };

      const cursor = encodeCursor(data);

      expect(typeof cursor).toBe('string');
      expect(cursor.length).toBeGreaterThan(0);
      // base64url should not contain +, /, or =
      expect(cursor).not.toMatch(/[+/=]/);
    });
  });

  describe('decodeCursor()', () => {
    it('round-trips with encodeCursor', () => {
      const data: ICursorData = {
        id: 'card_xyz789',
        sortValue: '2026-02-20T08:00:00.000Z',
        sortField: 'updatedAt',
      };

      const cursor = encodeCursor(data);
      const decoded = decodeCursor(cursor);

      expect(decoded).toEqual(data);
    });

    it('returns null for invalid base64', () => {
      expect(decodeCursor('not-valid-base64!!!')).toBeNull();
    });

    it('returns null for valid base64 but invalid JSON', () => {
      const badCursor = Buffer.from('not json').toString('base64url');
      expect(decodeCursor(badCursor)).toBeNull();
    });

    it('returns null when id is missing', () => {
      const incomplete = Buffer.from(JSON.stringify({ sortValue: 'x', sortField: 'y' })).toString('base64url');
      expect(decodeCursor(incomplete)).toBeNull();
    });

    it('returns null when sortField is missing', () => {
      const incomplete = Buffer.from(JSON.stringify({ id: 'x', sortValue: 'y' })).toString('base64url');
      expect(decodeCursor(incomplete)).toBeNull();
    });

    it('handles difficulty sort values', () => {
      const data: ICursorData = {
        id: 'card_diff1',
        sortValue: 'INTERMEDIATE',
        sortField: 'difficulty',
      };

      const cursor = encodeCursor(data);
      const decoded = decodeCursor(cursor);

      expect(decoded).toEqual(data);
    });
  });
});
