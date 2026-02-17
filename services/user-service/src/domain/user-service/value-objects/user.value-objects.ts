/**
 * @noema/user-service - Value Objects
 *
 * Immutable value objects for user domain.
 * These enforce domain rules at construction time.
 */

import { z } from 'zod';

// ============================================================================
// Email Value Object
// ============================================================================

/**
 * Schema for validated email addresses.
 */
export const EmailSchema = z
  .string()
  .email('Invalid email format')
  .max(254, 'Email too long')
  .transform((val) => val.toLowerCase().trim())
  .describe('Email address (lowercase, validated)');

/**
 * Email value object.
 * Immutable and validated at construction.
 */
export class Email {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  /**
   * Create a validated Email value object.
   * @throws if email is invalid
   */
  static create(value: string): Email {
    const parsed = EmailSchema.parse(value);
    return new Email(parsed);
  }

  /**
   * Check if a string is a valid email without creating an instance.
   */
  static isValid(value: unknown): boolean {
    return EmailSchema.safeParse(value).success;
  }

  /**
   * Get the raw email string.
   */
  get value(): string {
    return this._value;
  }

  /**
   * Get the domain portion of the email.
   */
  get domain(): string {
    // Email is validated to contain @
    return this._value.split('@')[1]!;
  }

  /**
   * Get the local portion of the email (before @).
   */
  get local(): string {
    // Email is validated to contain @
    return this._value.split('@')[0]!;
  }

  /**
   * Check equality with another Email.
   */
  equals(other: Email): boolean {
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
// Username Value Object
// ============================================================================

/**
 * Schema for validated usernames.
 * Rules: 3-30 chars, alphanumeric + underscore, must start with letter.
 */
export const UsernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_]*$/,
    'Username must start with letter and contain only letters, numbers, and underscores'
  )
  .transform((val) => val.toLowerCase())
  .describe('Username (3-30 chars, alphanumeric + underscore, lowercase)');

/**
 * Username value object.
 * Immutable and validated at construction.
 */
export class Username {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  /**
   * Create a validated Username value object.
   * @throws if username is invalid
   */
  static create(value: string): Username {
    const parsed = UsernameSchema.parse(value);
    return new Username(parsed);
  }

  /**
   * Check if a string is a valid username without creating an instance.
   */
  static isValid(value: unknown): boolean {
    return UsernameSchema.safeParse(value).success;
  }

  /**
   * Get the raw username string.
   */
  get value(): string {
    return this._value;
  }

  /**
   * Check equality with another Username.
   */
  equals(other: Username): boolean {
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
// Password Value Object
// ============================================================================

/**
 * Schema for password requirements.
 * Rules: 8-128 chars, must contain uppercase, lowercase, number, special char.
 */
export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((val) => /[a-z]/.test(val), 'Password must contain a lowercase letter')
  .refine((val) => /[A-Z]/.test(val), 'Password must contain an uppercase letter')
  .refine((val) => /[0-9]/.test(val), 'Password must contain a number')
  .refine(
    (val) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(val),
    'Password must contain a special character'
  )
  .describe('Password (8-128 chars, mixed case, number, special char)');

/**
 * Password value object.
 * Used for validation before hashing; never stores plaintext.
 */
export class Password {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  /**
   * Create a validated Password value object.
   * @throws if password doesn't meet requirements
   */
  static create(value: string): Password {
    PasswordSchema.parse(value);
    return new Password(value);
  }

  /**
   * Check if a string meets password requirements.
   */
  static isValid(value: unknown): boolean {
    return PasswordSchema.safeParse(value).success;
  }

  /**
   * Get the plaintext password (only for hashing).
   */
  get value(): string {
    return this._value;
  }

  /**
   * Check password strength.
   * Returns a strength score from 0-100.
   */
  getStrength(): number {
    let score = 0;
    const length = this._value.length;

    // Length scoring
    if (length >= 8) score += 20;
    if (length >= 12) score += 20;
    if (length >= 16) score += 10;

    // Character variety scoring
    if (/[a-z]/.test(this._value)) score += 10;
    if (/[A-Z]/.test(this._value)) score += 10;
    if (/[0-9]/.test(this._value)) score += 10;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(this._value)) score += 20;

    return Math.min(score, 100);
  }

  // Never expose password in string or JSON
  toString(): string {
    return '[PASSWORD]';
  }

  toJSON(): string {
    return '[PASSWORD]';
  }
}

// ============================================================================
// Display Name Value Object
// ============================================================================

/**
 * Schema for display names.
 */
export const DisplayNameSchema = z
  .string()
  .min(1, 'Display name is required')
  .max(100, 'Display name must be at most 100 characters')
  .transform((val) => val.trim())
  .describe('Display name (1-100 chars)');

/**
 * Display name value object.
 */
export class DisplayName {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  static create(value: string): DisplayName {
    const parsed = DisplayNameSchema.parse(value);
    return new DisplayName(parsed);
  }

  static isValid(value: unknown): boolean {
    return DisplayNameSchema.safeParse(value).success;
  }

  get value(): string {
    return this._value;
  }

  equals(other: DisplayName): boolean {
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
// Timezone Value Object
// ============================================================================

/**
 * List of valid IANA timezones.
 * This is a subset - full list would be from Intl.supportedValuesOf('timeZone')
 */
export const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Phoenix',
  'America/Toronto',
  'America/Vancouver',
  'America/Sao_Paulo',
  'America/Mexico_City',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Athens',
  'Europe/Moscow',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'Asia/Seoul',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
  'Pacific/Honolulu',
] as const;

/**
 * Schema for timezone validation.
 */
export const TimezoneSchema = z
  .string()
  .refine(
    (val) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: val });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid IANA timezone' }
  )
  .describe('IANA timezone identifier');

/**
 * Timezone value object.
 */
export class Timezone {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  static create(value: string): Timezone {
    const parsed = TimezoneSchema.parse(value);
    return new Timezone(parsed);
  }

  static isValid(value: unknown): boolean {
    return TimezoneSchema.safeParse(value).success;
  }

  /**
   * Get the default timezone (UTC).
   */
  static default(): Timezone {
    return new Timezone('UTC');
  }

  get value(): string {
    return this._value;
  }

  /**
   * Get current time in this timezone.
   */
  getCurrentTime(): Date {
    return new Date(new Date().toLocaleString('en-US', { timeZone: this._value }));
  }

  /**
   * Format a date in this timezone.
   */
  formatDate(date: Date, options?: Intl.DateTimeFormatOptions): string {
    return date.toLocaleString('en-US', {
      timeZone: this._value,
      ...options,
    });
  }

  equals(other: Timezone): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }

  toJSON(): string {
    return this._value;
  }
}
