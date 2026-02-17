/**
 * @noema/user-service - Username Value Object
 *
 * Immutable value object for usernames with validation.
 */

/**
 * Username value object.
 * Ensures username is always valid, normalized, and immutable.
 */
export class Username {
  private readonly value: string;

  private static readonly MIN_LENGTH = 3;
  private static readonly MAX_LENGTH = 30;
  private static readonly PATTERN = /^[a-z][a-z0-9_]*$/;

  /** Reserved usernames that cannot be used */
  private static readonly RESERVED = new Set([
    'admin',
    'administrator',
    'root',
    'system',
    'noema',
    'support',
    'help',
    'api',
    'www',
    'mail',
    'email',
    'null',
    'undefined',
    'anonymous',
    'guest',
    'user',
    'test',
    'demo',
    'superuser',
    'moderator',
    'mod',
  ]);

  private constructor(username: string) {
    this.value = username;
  }

  /**
   * Creates a Username from a string.
   * Normalizes to lowercase and validates format.
   *
   * @throws Error if username is invalid
   */
  public static create(username: string): Username {
    if (!username || typeof username !== 'string') {
      throw new Error('Username is required');
    }

    const normalized = username.trim().toLowerCase();

    const validation = Username.validate(normalized);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    return new Username(normalized);
  }

  /**
   * Creates a Username from an already-validated string (from database).
   * Skips validation for performance.
   */
  public static fromPersisted(username: string): Username {
    return new Username(username);
  }

  /**
   * Validates a username string.
   */
  public static validate(username: string): { valid: boolean; error?: string } {
    if (username.length < Username.MIN_LENGTH) {
      return {
        valid: false,
        error: `Username must be at least ${Username.MIN_LENGTH} characters`,
      };
    }

    if (username.length > Username.MAX_LENGTH) {
      return {
        valid: false,
        error: `Username must be at most ${Username.MAX_LENGTH} characters`,
      };
    }

    if (!Username.PATTERN.test(username)) {
      return {
        valid: false,
        error:
          'Username must start with a letter and contain only lowercase letters, numbers, and underscores',
      };
    }

    if (Username.RESERVED.has(username)) {
      return {
        valid: false,
        error: 'This username is reserved and cannot be used',
      };
    }

    return { valid: true };
  }

  /**
   * Returns the username string.
   */
  public toString(): string {
    return this.value;
  }

  /**
   * Returns the username string.
   */
  public getValue(): string {
    return this.value;
  }

  /**
   * Checks equality with another Username.
   */
  public equals(other: Username): boolean {
    return this.value === other.value;
  }
}
