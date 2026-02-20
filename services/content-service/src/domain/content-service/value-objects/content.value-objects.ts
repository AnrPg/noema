/**
 * @noema/content-service - Value Objects
 *
 * Immutable value objects for content domain.
 * These enforce domain rules at construction time.
 */

import { z } from 'zod';

// ============================================================================
// Tag Value Object
// ============================================================================

/**
 * Schema for validated tags.
 * Rules: 1-50 chars, lowercase, alphanumeric + hyphens, no leading/trailing hyphens.
 */
export const TagSchema = z
  .string()
  .min(1, 'Tag must not be empty')
  .max(50, 'Tag must be at most 50 characters')
  .regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/,
    'Tag must be lowercase alphanumeric with hyphens, no leading/trailing hyphens'
  )
  .transform((val) => val.toLowerCase().trim())
  .describe('Tag (1-50 chars, lowercase, alphanumeric + hyphens)');

/**
 * Tag value object.
 * Immutable and validated at construction.
 */
export class Tag {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  /**
   * Create a validated Tag value object.
   * @throws if tag is invalid
   */
  static create(value: string): Tag {
    const parsed = TagSchema.parse(value);
    return new Tag(parsed);
  }

  /**
   * Check if a string is a valid tag without creating an instance.
   */
  static isValid(value: unknown): boolean {
    return TagSchema.safeParse(value).success;
  }

  get value(): string {
    return this._value;
  }

  equals(other: Tag): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }

  toJSON(): string {
    return this._value;
  }
}

// ============================================================================
// Card Front Content Value Object
// ============================================================================

/**
 * Schema for card front content (question/prompt).
 * Markdown supported, must not be empty or purely whitespace.
 */
export const CardFrontSchema = z
  .string()
  .min(1, 'Card front must not be empty')
  .max(10000, 'Card front must be at most 10,000 characters')
  .refine((val) => val.trim().length > 0, 'Card front must not be blank')
  .describe('Card front (question/prompt), Markdown supported');

/**
 * Schema for card back content (answer/explanation).
 * Markdown supported, must not be empty or purely whitespace.
 */
export const CardBackSchema = z
  .string()
  .min(1, 'Card back must not be empty')
  .max(50000, 'Card back must be at most 50,000 characters')
  .refine((val) => val.trim().length > 0, 'Card back must not be blank')
  .describe('Card back (answer/explanation), Markdown supported');

/**
 * Schema for optional hint.
 */
export const HintSchema = z
  .string()
  .max(1000, 'Hint must be at most 1,000 characters')
  .optional()
  .describe('Optional hint shown before reveal');

/**
 * Schema for optional explanation.
 */
export const ExplanationSchema = z
  .string()
  .max(50000, 'Explanation must be at most 50,000 characters')
  .optional()
  .describe('Optional detailed explanation');

// ============================================================================
// Preview Generator
// ============================================================================

/** Maximum preview length for list views */
const MAX_PREVIEW_LENGTH = 120;

/**
 * Generate a preview string from card front content.
 * Strips Markdown formatting and truncates.
 */
export function generatePreview(front: string): string {
  // Strip basic Markdown formatting
  const stripped = front
    .replace(/#{1,6}\s/g, '') // headings
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/\*([^*]+)\*/g, '$1') // italic
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // images
    .replace(/\n+/g, ' ') // newlines
    .trim();

  if (stripped.length <= MAX_PREVIEW_LENGTH) {
    return stripped;
  }
  return `${stripped.slice(0, MAX_PREVIEW_LENGTH - 3)}...`;
}
