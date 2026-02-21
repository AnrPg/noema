/**
 * @noema/content-service — Error Classes Unit Tests
 *
 * Tests construction, serialization, and type guards for all domain errors.
 */

import { describe, expect, it } from 'vitest';
import {
  AuthenticationError,
  AuthorizationError,
  BatchLimitExceededError,
  BusinessRuleError,
  CardNotFoundError,
  DuplicateCardError,
  ExternalServiceError,
  InvalidCardStateError,
  isAuthenticationError,
  isAuthorizationError,
  isDomainError,
  isValidationError,
  ValidationError,
  VersionConflictError,
} from '../../../src/domain/content-service/errors/content.errors.js';

// ============================================================================
// ValidationError
// ============================================================================

describe('ValidationError', () => {
  it('stores code and message', () => {
    const err = new ValidationError('Bad input', { name: ['required'] });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('Bad input');
    expect(err.fieldErrors).toEqual({ name: ['required'] });
  });

  it('serializes to JSON', () => {
    const err = new ValidationError('Bad');
    const json = err.toJSON();
    expect(json.name).toBe('ValidationError');
    expect(json.code).toBe('VALIDATION_ERROR');
    expect(json.timestamp).toBeDefined();
  });

  it('defaults fieldErrors to empty object', () => {
    const err = new ValidationError('Bad');
    expect(err.fieldErrors).toEqual({});
  });
});

// ============================================================================
// AuthenticationError
// ============================================================================

describe('AuthenticationError', () => {
  it('uses default message', () => {
    const err = new AuthenticationError();
    expect(err.message).toBe('Authentication failed');
    expect(err.code).toBe('AUTHENTICATION_ERROR');
  });

  it('accepts custom message', () => {
    const err = new AuthenticationError('Token expired');
    expect(err.message).toBe('Token expired');
  });
});

// ============================================================================
// AuthorizationError
// ============================================================================

describe('AuthorizationError', () => {
  it('uses default message', () => {
    const err = new AuthorizationError();
    expect(err.message).toBe('Access denied');
    expect(err.code).toBe('AUTHORIZATION_ERROR');
  });
});

// ============================================================================
// CardNotFoundError
// ============================================================================

describe('CardNotFoundError', () => {
  it('stores the card identifier', () => {
    const err = new CardNotFoundError('card_abc');
    expect(err.cardId).toBe('card_abc');
    expect(err.code).toBe('CARD_NOT_FOUND');
    expect(err.message).toContain('card_abc');
  });
});

// ============================================================================
// VersionConflictError
// ============================================================================

describe('VersionConflictError', () => {
  it('stores expected and actual versions', () => {
    const err = new VersionConflictError(1, 3);
    expect(err.expectedVersion).toBe(1);
    expect(err.actualVersion).toBe(3);
    expect(err.code).toBe('VERSION_CONFLICT');
    expect(err.message).toContain('expected 1');
    expect(err.message).toContain('found 3');
  });
});

// ============================================================================
// DuplicateCardError
// ============================================================================

describe('DuplicateCardError', () => {
  it('stores existing card ID', () => {
    const err = new DuplicateCardError('card_existing');
    expect(err.existingCardId).toBe('card_existing');
    expect(err.code).toBe('DUPLICATE_CARD');
  });
});

// ============================================================================
// BusinessRuleError
// ============================================================================

describe('BusinessRuleError', () => {
  it('stores code and details', () => {
    const err = new BusinessRuleError('Not allowed', { reason: 'test' });
    expect(err.code).toBe('BUSINESS_RULE_VIOLATION');
    expect(err.details).toEqual({ reason: 'test' });
  });
});

// ============================================================================
// InvalidCardStateError
// ============================================================================

describe('InvalidCardStateError', () => {
  it('stores current state and attempted action', () => {
    const err = new InvalidCardStateError('archived', 'update');
    expect(err.currentState).toBe('archived');
    expect(err.attemptedAction).toBe('update');
    expect(err.message).toContain('archived');
    expect(err.message).toContain('update');
  });
});

// ============================================================================
// BatchLimitExceededError
// ============================================================================

describe('BatchLimitExceededError', () => {
  it('stores limit and requested count', () => {
    const err = new BatchLimitExceededError(100, 150);
    expect(err.limit).toBe(100);
    expect(err.requested).toBe(150);
    expect(err.message).toContain('100');
    expect(err.message).toContain('150');
  });
});

// ============================================================================
// ExternalServiceError
// ============================================================================

describe('ExternalServiceError', () => {
  it('stores service name', () => {
    const err = new ExternalServiceError('Redis', 'Connection refused');
    expect(err.serviceName).toBe('Redis');
    expect(err.code).toBe('EXTERNAL_SERVICE_ERROR');
    expect(err.message).toContain('Redis');
  });
});

// ============================================================================
// Type Guards
// ============================================================================

describe('Type guards', () => {
  const validationErr = new ValidationError('v');
  const authErr = new AuthenticationError();
  const authzErr = new AuthorizationError();
  const notFoundErr = new CardNotFoundError('id');
  const plainErr = new Error('plain');

  describe('isDomainError()', () => {
    it('returns true for all domain errors', () => {
      expect(isDomainError(validationErr)).toBe(true);
      expect(isDomainError(authErr)).toBe(true);
      expect(isDomainError(authzErr)).toBe(true);
      expect(isDomainError(notFoundErr)).toBe(true);
    });

    it('returns false for plain Error', () => {
      expect(isDomainError(plainErr)).toBe(false);
    });

    it('returns false for non-errors', () => {
      expect(isDomainError(null)).toBe(false);
      expect(isDomainError('string')).toBe(false);
      expect(isDomainError(42)).toBe(false);
    });
  });

  describe('isValidationError()', () => {
    it('returns true for ValidationError', () => {
      expect(isValidationError(validationErr)).toBe(true);
    });

    it('returns false for other domain errors', () => {
      expect(isValidationError(authErr)).toBe(false);
    });
  });

  describe('isAuthenticationError()', () => {
    it('returns true for AuthenticationError', () => {
      expect(isAuthenticationError(authErr)).toBe(true);
    });

    it('returns false for AuthorizationError', () => {
      expect(isAuthenticationError(authzErr)).toBe(false);
    });
  });

  describe('isAuthorizationError()', () => {
    it('returns true for AuthorizationError', () => {
      expect(isAuthorizationError(authzErr)).toBe(true);
    });

    it('returns false for AuthenticationError', () => {
      expect(isAuthorizationError(authErr)).toBe(false);
    });
  });
});

// ============================================================================
// toJSON() includes all expected fields
// ============================================================================

describe('toJSON()', () => {
  it('includes name, code, message, timestamp', () => {
    const err = new CardNotFoundError('card_123');
    const json = err.toJSON();
    expect(json).toHaveProperty('name');
    expect(json).toHaveProperty('code');
    expect(json).toHaveProperty('message');
    expect(json).toHaveProperty('timestamp');
    expect(json).toHaveProperty('details');
  });

  it('timestamp is ISO 8601', () => {
    const err = new ValidationError('test');
    const json = err.toJSON();
    expect(() => new Date(json.timestamp as string)).not.toThrow();
  });
});
