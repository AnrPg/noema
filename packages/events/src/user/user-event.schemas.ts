/**
 * @noema/events - User Event Zod Schemas
 *
 * Runtime validation schemas for user domain events.
 * Uses `createEventSchema()` from @noema/events for the envelope.
 *
 * Note: only the most commonly consumed events have full envelope schemas.
 * Remaining events define payload-level schemas only.
 */

import { UserIdSchema } from '@noema/validation';
import { z } from 'zod';
import { createEventSchema } from '../schemas.js';

// ============================================================================
// Shared Schemas
// ============================================================================

const UserAuthProviderSchema = z.enum(['local', 'google', 'apple', 'github']);

// ============================================================================
// Payload Schemas
// ============================================================================

/**
 * Payload for `user.created` event.
 */
export const UserCreatedPayloadSchema = z.object({
  entity: z.object({
    id: UserIdSchema,
    username: z.string().min(1),
    email: z.string().email(),
    emailVerified: z.boolean(),
    status: z.string().min(1),
    roles: z.array(z.string()),
    authProviders: z.array(UserAuthProviderSchema),
    profile: z.record(z.unknown()),
    settings: z.record(z.unknown()),
    lastLoginAt: z.string().datetime().nullable(),
    loginCount: z.number().int().nonnegative(),
    mfaEnabled: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),
  source: z.enum(['user', 'agent', 'system', 'import']),
});

/**
 * Payload for `user.profile.updated` event.
 */
export const UserProfileUpdatedPayloadSchema = z.object({
  changes: z.record(z.unknown()),
  previousVersion: z.number().int().nonnegative(),
});

/**
 * Payload for `user.settings.changed` event.
 */
export const UserSettingsChangedPayloadSchema = z.object({
  changes: z.record(z.unknown()),
  previousVersion: z.number().int().nonnegative(),
});

/**
 * Payload for `user.password.changed` event.
 */
export const UserPasswordChangedPayloadSchema = z.object({});

/**
 * Payload for `user.logged_in` event.
 */
export const UserLoggedInPayloadSchema = z.object({
  loginMethod: z.enum(['password', 'oauth', 'mfa', 'token']),
  clientIp: z.string().optional(),
  userAgent: z.string().optional(),
});

/**
 * Payload for `user.logged_out` event.
 */
export const UserLoggedOutPayloadSchema = z.object({
  reason: z.enum(['user_initiated', 'token_expired', 'forced', 'security']),
});

/**
 * Payload for `user.deactivated` event.
 */
export const UserDeactivatedPayloadSchema = z.object({
  soft: z.boolean(),
});

/**
 * Payload for `user.deleted` event.
 */
export const UserDeletedPayloadSchema = z.object({
  soft: z.boolean(),
});

/**
 * Payload for `user.email.verified` event.
 */
export const UserEmailVerifiedPayloadSchema = z.object({
  email: z.string().email(),
});

/**
 * Payload for `user.mfa.enabled` event.
 */
export const UserMfaEnabledPayloadSchema = z.object({
  method: z.enum(['totp', 'sms', 'email']),
});

/**
 * Payload for `user.mfa.disabled` event.
 */
export const UserMfaDisabledPayloadSchema = z.object({
  reason: z.enum(['user_disabled', 'admin_disabled', 'recovery']),
});

/**
 * Payload for `user.role.added` event.
 */
export const UserRoleAddedPayloadSchema = z.object({
  role: z.string().min(1),
  grantedBy: UserIdSchema,
});

/**
 * Payload for `user.role.removed` event.
 */
export const UserRoleRemovedPayloadSchema = z.object({
  role: z.string().min(1),
  removedBy: UserIdSchema,
});

/**
 * Payload for `user.locked` event.
 */
export const UserLockedPayloadSchema = z.object({
  reason: z.enum(['too_many_attempts', 'admin_action', 'security']),
  lockedUntil: z.string().datetime(),
});

/**
 * Payload for `user.unlocked` event.
 */
export const UserUnlockedPayloadSchema = z.object({
  unlockedBy: z.union([UserIdSchema, z.literal('system')]),
});

/**
 * Payload for `user.auth_provider.linked` event.
 */
export const UserAuthProviderLinkedPayloadSchema = z.object({
  provider: UserAuthProviderSchema,
});

/**
 * Payload for `user.auth_provider.unlinked` event.
 */
export const UserAuthProviderUnlinkedPayloadSchema = z.object({
  provider: UserAuthProviderSchema,
});

/**
 * Payload for `user.username.changed` event.
 */
export const UserUsernameChangedPayloadSchema = z.object({
  previousUsername: z.string().min(1),
  newUsername: z.string().min(1),
});

/**
 * Payload for `user.email_change.initiated` event.
 */
export const UserEmailChangeInitiatedPayloadSchema = z.object({
  pendingEmail: z.string().email(),
});

/**
 * Payload for `user.email.changed` event.
 */
export const UserEmailChangedPayloadSchema = z.object({
  previousEmail: z.string().email(),
  newEmail: z.string().email(),
});

/**
 * Payload for `user.password_reset.requested` event.
 */
export const UserPasswordResetRequestedPayloadSchema = z.object({
  email: z.string().email(),
});

// ============================================================================
// Full Event Schemas (envelope + typed payload)
// ============================================================================

export const UserCreatedEventSchema = createEventSchema(
  'user.created',
  'User',
  UserCreatedPayloadSchema
);

export const UserProfileUpdatedEventSchema = createEventSchema(
  'user.profile.updated',
  'User',
  UserProfileUpdatedPayloadSchema
);

export const UserSettingsChangedEventSchema = createEventSchema(
  'user.settings.changed',
  'User',
  UserSettingsChangedPayloadSchema
);

export const UserLoggedInEventSchema = createEventSchema(
  'user.logged_in',
  'User',
  UserLoggedInPayloadSchema
);

export const UserLoggedOutEventSchema = createEventSchema(
  'user.logged_out',
  'User',
  UserLoggedOutPayloadSchema
);

export const UserUsernameChangedEventSchema = createEventSchema(
  'user.username.changed',
  'User',
  UserUsernameChangedPayloadSchema
);

export const UserEmailChangeInitiatedEventSchema = createEventSchema(
  'user.email_change.initiated',
  'User',
  UserEmailChangeInitiatedPayloadSchema
);

export const UserEmailChangedEventSchema = createEventSchema(
  'user.email.changed',
  'User',
  UserEmailChangedPayloadSchema
);

export const UserPasswordResetRequestedEventSchema = createEventSchema(
  'user.password_reset.requested',
  'User',
  UserPasswordResetRequestedPayloadSchema
);

// ============================================================================
// Type Inference
// ============================================================================

export type UserCreatedEventInput = z.input<typeof UserCreatedEventSchema>;
export type UserProfileUpdatedEventInput = z.input<typeof UserProfileUpdatedEventSchema>;
export type UserSettingsChangedEventInput = z.input<typeof UserSettingsChangedEventSchema>;
export type UserLoggedInEventInput = z.input<typeof UserLoggedInEventSchema>;
export type UserLoggedOutEventInput = z.input<typeof UserLoggedOutEventSchema>;
export type UserUsernameChangedEventInput = z.input<typeof UserUsernameChangedEventSchema>;
export type UserEmailChangeInitiatedEventInput = z.input<
  typeof UserEmailChangeInitiatedEventSchema
>;
export type UserEmailChangedEventInput = z.input<typeof UserEmailChangedEventSchema>;
export type UserPasswordResetRequestedEventInput = z.input<
  typeof UserPasswordResetRequestedEventSchema
>;
