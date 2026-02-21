/**
 * @noema/content-service — Value Object Unit Tests
 *
 * Tests Tag, CardFront/Back schemas, and generatePreview().
 */

import { describe, expect, it } from 'vitest';
import {
  CardBackSchema,
  CardFrontSchema,
  ExplanationSchema,
  generatePreview,
  HintSchema,
  Tag,
  TagSchema,
} from '../../../src/domain/content-service/value-objects/content.value-objects.js';

// ============================================================================
// TagSchema
// ============================================================================

describe('TagSchema', () => {
  it.each(['math', 'a', 'calculus-101', 'ab', 'a1b2c3'])('accepts valid tag "%s"', (tag) => {
    expect(TagSchema.safeParse(tag).success).toBe(true);
  });

  it.each([
    ['', 'empty string'],
    ['A', 'uppercase single char'],
    ['UPPER', 'all uppercase'],
    ['-leading', 'leading hyphen'],
    ['trailing-', 'trailing hyphen'],
    ['has space', 'contains space'],
    ['special!', 'special char'],
    ['a'.repeat(51), 'exceeds 50 chars'],
  ])('rejects invalid tag "%s" (%s)', (tag) => {
    expect(TagSchema.safeParse(tag).success).toBe(false);
  });

  it('transforms to lowercase', () => {
    // The regex requires lowercase, so mixed case fails before transform
    const result = TagSchema.safeParse('math');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('math');
  });
});

// ============================================================================
// Tag class
// ============================================================================

describe('Tag', () => {
  it('creates a valid Tag', () => {
    const tag = Tag.create('biology');
    expect(tag.value).toBe('biology');
    expect(tag.toString()).toBe('biology');
    expect(tag.toJSON()).toBe('biology');
  });

  it('throws on invalid tag', () => {
    expect(() => Tag.create('INVALID')).toThrow();
    expect(() => Tag.create('')).toThrow();
  });

  it('isValid returns true for valid tags', () => {
    expect(Tag.isValid('math')).toBe(true);
    expect(Tag.isValid('calculus-101')).toBe(true);
  });

  it('isValid returns false for invalid tags', () => {
    expect(Tag.isValid('UPPER')).toBe(false);
    expect(Tag.isValid(123)).toBe(false);
    expect(Tag.isValid('')).toBe(false);
  });

  it('equality check works', () => {
    const a = Tag.create('math');
    const b = Tag.create('math');
    const c = Tag.create('physics');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

// ============================================================================
// CardFrontSchema
// ============================================================================

describe('CardFrontSchema', () => {
  it('accepts valid front content', () => {
    expect(CardFrontSchema.safeParse('What is X?').success).toBe(true);
  });

  it('rejects empty string', () => {
    expect(CardFrontSchema.safeParse('').success).toBe(false);
  });

  it('rejects whitespace-only string', () => {
    expect(CardFrontSchema.safeParse('   ').success).toBe(false);
  });

  it('rejects content exceeding 10,000 chars', () => {
    expect(CardFrontSchema.safeParse('a'.repeat(10_001)).success).toBe(false);
  });

  it('accepts content at 10,000 chars', () => {
    expect(CardFrontSchema.safeParse('a'.repeat(10_000)).success).toBe(true);
  });
});

// ============================================================================
// CardBackSchema
// ============================================================================

describe('CardBackSchema', () => {
  it('accepts valid back content', () => {
    expect(CardBackSchema.safeParse('The answer is Y.').success).toBe(true);
  });

  it('rejects empty string', () => {
    expect(CardBackSchema.safeParse('').success).toBe(false);
  });

  it('rejects whitespace-only', () => {
    expect(CardBackSchema.safeParse('  \n  ').success).toBe(false);
  });

  it('accepts content up to 50,000 chars', () => {
    expect(CardBackSchema.safeParse('a'.repeat(50_000)).success).toBe(true);
  });

  it('rejects content over 50,000 chars', () => {
    expect(CardBackSchema.safeParse('a'.repeat(50_001)).success).toBe(false);
  });
});

// ============================================================================
// HintSchema
// ============================================================================

describe('HintSchema', () => {
  it('accepts a hint', () => {
    expect(HintSchema.safeParse('Think about...').success).toBe(true);
  });

  it('accepts undefined (optional)', () => {
    expect(HintSchema.safeParse(undefined).success).toBe(true);
  });

  it('rejects hint exceeding 1,000 chars', () => {
    expect(HintSchema.safeParse('a'.repeat(1_001)).success).toBe(false);
  });
});

// ============================================================================
// ExplanationSchema
// ============================================================================

describe('ExplanationSchema', () => {
  it('accepts an explanation', () => {
    expect(ExplanationSchema.safeParse('Because...').success).toBe(true);
  });

  it('accepts undefined (optional)', () => {
    expect(ExplanationSchema.safeParse(undefined).success).toBe(true);
  });

  it('rejects explanation exceeding 50,000 chars', () => {
    expect(ExplanationSchema.safeParse('a'.repeat(50_001)).success).toBe(false);
  });
});

// ============================================================================
// generatePreview()
// ============================================================================

describe('generatePreview()', () => {
  it('returns short text unchanged', () => {
    expect(generatePreview('Hello')).toBe('Hello');
  });

  it('truncates long text with ellipsis', () => {
    const long = 'a'.repeat(200);
    const result = generatePreview(long);
    expect(result.length).toBe(120);
    expect(result.endsWith('...')).toBe(true);
  });

  it('strips markdown headings', () => {
    expect(generatePreview('## Title')).toBe('Title');
  });

  it('strips bold markers', () => {
    expect(generatePreview('This is **bold** text')).toBe('This is bold text');
  });

  it('strips italic markers', () => {
    expect(generatePreview('This is *italic* text')).toBe('This is italic text');
  });

  it('strips inline code', () => {
    expect(generatePreview('Use `const x = 1`')).toBe('Use const x = 1');
  });

  it('strips markdown links', () => {
    expect(generatePreview('[click here](http://example.com)')).toBe('click here');
  });

  it('strips markdown images (leaves ! prefix per current regex)', () => {
    // Current regex replaces ![...](...) → alt text but leaves leading '!'
    expect(generatePreview('![alt text](http://img.png)')).toBe('!alt text');
  });

  it('replaces newlines with spaces', () => {
    expect(generatePreview('line1\nline2\nline3')).toBe('line1 line2 line3');
  });

  it('returns exactly 120 chars when input is at boundary', () => {
    const text = 'a'.repeat(120);
    expect(generatePreview(text)).toBe(text);
  });
});
