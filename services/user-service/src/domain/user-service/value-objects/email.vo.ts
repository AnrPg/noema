/**
 * @noema/user-service - Email Value Object
 *
 * Immutable value object for email addresses with validation.
 */

/**
 * Email value object.
 * Ensures email is always valid, normalized, and immutable.
 */
export class Email {
  private readonly value: string;

  private constructor(email: string) {
    this.value = email;
  }

  /**
   * Creates an Email from a string.
   * Normalizes to lowercase and validates format.
   *
   * @throws Error if email is invalid
   */
  public static create(email: string): Email {
    if (email === '') {
      throw new Error('Email is required');
    }

    const normalized = email.trim().toLowerCase();

    if (!Email.isValidFormat(normalized)) {
      throw new Error(`Invalid email format: ${email}`);
    }

    return new Email(normalized);
  }

  /**
   * Creates an Email from an already-validated string (from database).
   * Skips validation for performance.
   */
  public static fromPersisted(email: string): Email {
    return new Email(email);
  }

  /**
   * Validates email format using RFC 5322 simplified pattern.
   */
  private static isValidFormat(email: string): boolean {
    const emailRegex =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  /**
   * Returns the email string.
   */
  public toString(): string {
    return this.value;
  }

  /**
   * Returns the email string.
   */
  public getValue(): string {
    return this.value;
  }

  /**
   * Gets the domain part of the email.
   */
  public getDomain(): string {
    return this.value.slice(this.value.indexOf('@') + 1);
  }

  /**
   * Gets the local part of the email (before @).
   */
  public getLocalPart(): string {
    return this.value.slice(0, this.value.indexOf('@'));
  }

  /**
   * Checks equality with another Email.
   */
  public equals(other: Email): boolean {
    return this.value === other.value;
  }
}
