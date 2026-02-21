/**
 * @noema/content-service — Content Schemas Unit Tests
 *
 * Tests CreateCardInputSchema (with superRefine), DeckQuerySchema,
 * UpdateCardInputSchema, ChangeCardStateInputSchema.
 */

import { describe, expect, it } from 'vitest';
import {
  AnyCardTypeSchema,
  ChangeCardStateInputSchema,
  CreateCardInputSchema,
  DeckQuerySchema,
  UpdateCardInputSchema,
} from '../../../src/domain/content-service/content.schemas.js';
import { atomicContent, clozeContent, multipleChoiceContent } from '../../fixtures/index.js';

// ============================================================================
// AnyCardTypeSchema
// ============================================================================

describe('AnyCardTypeSchema', () => {
  it('accepts standard card types', () => {
    expect(AnyCardTypeSchema.safeParse('atomic').success).toBe(true);
    expect(AnyCardTypeSchema.safeParse('cloze').success).toBe(true);
    expect(AnyCardTypeSchema.safeParse('multiple_choice').success).toBe(true);
  });

  it('accepts remediation card types', () => {
    expect(AnyCardTypeSchema.safeParse('contrastive_pair').success).toBe(true);
    expect(AnyCardTypeSchema.safeParse('calibration_training').success).toBe(true);
  });

  it('rejects unknown types', () => {
    expect(AnyCardTypeSchema.safeParse('nonexistent').success).toBe(false);
  });
});

// ============================================================================
// CreateCardInputSchema (with superRefine)
// ============================================================================

describe('CreateCardInputSchema', () => {
  it('validates a correct atomic card', () => {
    const input = {
      cardType: 'atomic',
      content: atomicContent(),
    };
    const result = CreateCardInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('applies defaults for optional fields', () => {
    const input = {
      cardType: 'atomic',
      content: atomicContent(),
    };
    const result = CreateCardInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.difficulty).toBe('intermediate');
      expect(result.data.source).toBe('user');
      expect(result.data.knowledgeNodeIds).toEqual([]);
      expect(result.data.tags).toEqual([]);
    }
  });

  it('validates cloze card with correct content', () => {
    const input = {
      cardType: 'cloze',
      content: clozeContent(),
    };
    const result = CreateCardInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects cloze card with atomic content (superRefine)', () => {
    const input = {
      cardType: 'cloze',
      content: atomicContent(), // missing template + clozes
    };
    const result = CreateCardInputSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      // Errors should be under content path from superRefine
      const contentErrors = result.error.issues.filter((i) => i.path[0] === 'content');
      expect(contentErrors.length).toBeGreaterThan(0);
    }
  });

  it('validates multiple choice with correct content', () => {
    const input = {
      cardType: 'multiple_choice',
      content: multipleChoiceContent(),
    };
    const result = CreateCardInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects unknown card type', () => {
    const input = {
      cardType: 'nonexistent',
      content: atomicContent(),
    };
    const result = CreateCardInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('validates knowledgeNodeIds format', () => {
    const input = {
      cardType: 'atomic',
      content: atomicContent(),
      knowledgeNodeIds: ['node_aaaaaaaaaaaaaaaaaaaaa'],
    };
    const result = CreateCardInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects invalid knowledgeNodeIds format', () => {
    const input = {
      cardType: 'atomic',
      content: atomicContent(),
      knowledgeNodeIds: ['bad-id'],
    };
    const result = CreateCardInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects more than 50 knowledgeNodeIds', () => {
    const input = {
      cardType: 'atomic',
      content: atomicContent(),
      knowledgeNodeIds: Array.from(
        { length: 51 },
        (_, i) => `node_${'a'.repeat(20)}${String(i).padStart(1, '0')}`
      ),
    };
    const result = CreateCardInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('validates tags format', () => {
    const input = {
      cardType: 'atomic',
      content: atomicContent(),
      tags: ['math', 'algebra-101'],
    };
    const result = CreateCardInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects invalid tags', () => {
    const input = {
      cardType: 'atomic',
      content: atomicContent(),
      tags: ['INVALID'],
    };
    const result = CreateCardInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// UpdateCardInputSchema
// ============================================================================

describe('UpdateCardInputSchema', () => {
  it('accepts partial updates', () => {
    const result = UpdateCardInputSchema.safeParse({
      content: atomicContent(),
    });
    expect(result.success).toBe(true);
  });

  it('accepts difficulty-only update', () => {
    const result = UpdateCardInputSchema.safeParse({
      difficulty: 'advanced',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown fields (strict mode)', () => {
    const result = UpdateCardInputSchema.safeParse({
      content: atomicContent(),
      unknownField: 'value',
    });
    expect(result.success).toBe(false);
  });

  it('accepts empty object', () => {
    const result = UpdateCardInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// ChangeCardStateInputSchema
// ============================================================================

describe('ChangeCardStateInputSchema', () => {
  it('accepts valid state', () => {
    expect(ChangeCardStateInputSchema.safeParse({ state: 'active' }).success).toBe(true);
    expect(ChangeCardStateInputSchema.safeParse({ state: 'suspended' }).success).toBe(true);
    expect(ChangeCardStateInputSchema.safeParse({ state: 'archived' }).success).toBe(true);
    expect(ChangeCardStateInputSchema.safeParse({ state: 'draft' }).success).toBe(true);
  });

  it('rejects invalid state', () => {
    expect(ChangeCardStateInputSchema.safeParse({ state: 'deleted' }).success).toBe(false);
  });

  it('accepts optional reason', () => {
    const result = ChangeCardStateInputSchema.safeParse({
      state: 'archived',
      reason: 'No longer relevant',
    });
    expect(result.success).toBe(true);
  });

  it('rejects reason exceeding 500 chars', () => {
    const result = ChangeCardStateInputSchema.safeParse({
      state: 'archived',
      reason: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// DeckQuerySchema
// ============================================================================

describe('DeckQuerySchema', () => {
  it('accepts empty query (uses defaults)', () => {
    const result = DeckQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortBy).toBe('createdAt');
      expect(result.data.sortOrder).toBe('desc');
      expect(result.data.offset).toBe(0);
      expect(result.data.limit).toBe(20);
    }
  });

  it('accepts filter by card types', () => {
    const result = DeckQuerySchema.safeParse({
      cardTypes: ['atomic', 'cloze'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts filter by states', () => {
    const result = DeckQuerySchema.safeParse({
      states: ['draft', 'active'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts knowledgeNodeIdMode', () => {
    const modes = ['any', 'all', 'exact', 'subtree', 'prerequisites', 'related'] as const;
    for (const mode of modes) {
      const result = DeckQuerySchema.safeParse({ knowledgeNodeIdMode: mode });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid knowledgeNodeIdMode', () => {
    const result = DeckQuerySchema.safeParse({ knowledgeNodeIdMode: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects limit > 100', () => {
    const result = DeckQuerySchema.safeParse({ limit: 101 });
    expect(result.success).toBe(false);
  });

  it('rejects limit < 1', () => {
    const result = DeckQuerySchema.safeParse({ limit: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects negative offset', () => {
    const result = DeckQuerySchema.safeParse({ offset: -1 });
    expect(result.success).toBe(false);
  });

  it('accepts date range filters', () => {
    const result = DeckQuerySchema.safeParse({
      createdAfter: '2025-01-01T00:00:00.000Z',
      createdBefore: '2025-12-31T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid date format', () => {
    const result = DeckQuerySchema.safeParse({
      createdAfter: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });

  it('accepts search text', () => {
    const result = DeckQuerySchema.safeParse({
      search: 'photosynthesis',
    });
    expect(result.success).toBe(true);
  });

  it('rejects search text exceeding 200 chars', () => {
    const result = DeckQuerySchema.safeParse({
      search: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });
});
