/**
 * @noema/user-service - User Events
 *
 * Event definitions for user domain events.
 * Follow EVENT_SCHEMA_SPECIFICATION patterns.
 */

import type { ITypedEvent } from '@noema/events';
import type { UserId } from '@noema/types';
import { z } from 'zod';
import type {
  AuthProvider,
  IUpdateProfileInput,
  IUpdateSettingsInput,
  IUser,
} from '../../types/user.types.js';

// ============================================================================
// Event Types
// ============================================================================

/**
 * All user event types.
 */
export const UserEventType = {
  CREATED: 'user.created',
  UPDATED: 'user.updated',
  DELETED: 'user.deleted',
  DEACTIVATED: 'user.deactivated',
  RESTORED: 'user.restored',
  PROFILE_UPDATED: 'user.profile.updated',
  SETTINGS_CHANGED: 'user.settings.changed',
  PASSWORD_CHANGED: 'user.password.changed',
  EMAIL_VERIFIED: 'user.email.verified',
  LOGGED_IN: 'user.logged_in',
  LOGGED_OUT: 'user.logged_out',
  MFA_ENABLED: 'user.mfa.enabled',
  MFA_DISABLED: 'user.mfa.disabled',
  ROLE_ADDED: 'user.role.added',
  ROLE_REMOVED: 'user.role.removed',
  LOCKED: 'user.locked',
  UNLOCKED: 'user.unlocked',
  AUTH_PROVIDER_LINKED: 'user.auth_provider.linked',
  AUTH_PROVIDER_UNLINKED: 'user.auth_provider.unlinked',
} as const;

export type UserEventType = (typeof UserEventType)[keyof typeof UserEventType];

// ============================================================================
// Event Payloads
// ============================================================================

/**
 * Sanitized user for events (no sensitive data).
 */
export type SanitizedUser = Omit<IUser, 'passwordHash' | 'mfaSecret'>;

/**
 * Payload for user.created event.
 */
export interface IUserCreatedPayload {
  entity: SanitizedUser;
  source: 'user' | 'agent' | 'system' | 'import';
}

/**
 * Payload for user.profile.updated event.
 */
export interface IUserProfileUpdatedPayload {
  changes: IUpdateProfileInput;
  previousVersion: number;
}

/**
 * Payload for user.settings.changed event.
 */
export interface IUserSettingsChangedPayload {
  changes: IUpdateSettingsInput;
  previousVersion: number;
}

/**
 * Payload for user.password.changed event.
 */
export interface IUserPasswordChangedPayload {
  /** Nothing stored - security */
}

/**
 * Payload for user.logged_in event.
 */
export interface IUserLoggedInPayload {
  loginMethod: 'password' | 'oauth' | 'mfa' | 'token';
  clientIp?: string;
  userAgent?: string;
}

/**
 * Payload for user.logged_out event.
 */
export interface IUserLoggedOutPayload {
  reason: 'user_initiated' | 'token_expired' | 'forced' | 'security';
}

/**
 * Payload for user.deactivated event.
 */
export interface IUserDeactivatedPayload {
  soft: boolean;
}

/**
 * Payload for user.deleted event.
 */
export interface IUserDeletedPayload {
  soft: boolean;
}

/**
 * Payload for user.email.verified event.
 */
export interface IUserEmailVerifiedPayload {
  email: string;
}

/**
 * Payload for user.mfa.enabled event.
 */
export interface IUserMfaEnabledPayload {
  method: 'totp' | 'sms' | 'email';
}

/**
 * Payload for user.mfa.disabled event.
 */
export interface IUserMfaDisabledPayload {
  reason: 'user_disabled' | 'admin_disabled' | 'recovery';
}

/**
 * Payload for user.role.added event.
 */
export interface IUserRoleAddedPayload {
  role: string;
  grantedBy: UserId;
}

/**
 * Payload for user.role.removed event.
 */
export interface IUserRoleRemovedPayload {
  role: string;
  removedBy: UserId;
}

/**
 * Payload for user.locked event.
 */
export interface IUserLockedPayload {
  reason: 'too_many_attempts' | 'admin_action' | 'security';
  lockedUntil: string;
}

/**
 * Payload for user.unlocked event.
 */
export interface IUserUnlockedPayload {
  unlockedBy: UserId | 'system';
}

/**
 * Payload for user.auth_provider.linked event.
 */
export interface IUserAuthProviderLinkedPayload {
  provider: AuthProvider;
}

/**
 * Payload for user.auth_provider.unlinked event.
 */
export interface IUserAuthProviderUnlinkedPayload {
  provider: AuthProvider;
}

// ============================================================================
// Typed Event Interfaces
// ============================================================================

export type IUserCreatedEvent = ITypedEvent<'user.created', 'User', IUserCreatedPayload>;
export type IUserProfileUpdatedEvent = ITypedEvent<
  'user.profile.updated',
  'User',
  IUserProfileUpdatedPayload
>;
export type IUserSettingsChangedEvent = ITypedEvent<
  'user.settings.changed',
  'User',
  IUserSettingsChangedPayload
>;
export type IUserPasswordChangedEvent = ITypedEvent<
  'user.password.changed',
  'User',
  IUserPasswordChangedPayload
>;
export type IUserLoggedInEvent = ITypedEvent<'user.logged_in', 'User', IUserLoggedInPayload>;
export type IUserLoggedOutEvent = ITypedEvent<'user.logged_out', 'User', IUserLoggedOutPayload>;
export type IUserDeactivatedEvent = ITypedEvent<
  'user.deactivated',
  'User',
  IUserDeactivatedPayload
>;
export type IUserDeletedEvent = ITypedEvent<'user.deleted', 'User', IUserDeletedPayload>;
export type IUserEmailVerifiedEvent = ITypedEvent<
  'user.email.verified',
  'User',
  IUserEmailVerifiedPayload
>;
export type IUserMfaEnabledEvent = ITypedEvent<'user.mfa.enabled', 'User', IUserMfaEnabledPayload>;
export type IUserMfaDisabledEvent = ITypedEvent<
  'user.mfa.disabled',
  'User',
  IUserMfaDisabledPayload
>;
export type IUserRoleAddedEvent = ITypedEvent<'user.role.added', 'User', IUserRoleAddedPayload>;
export type IUserRoleRemovedEvent = ITypedEvent<
  'user.role.removed',
  'User',
  IUserRoleRemovedPayload
>;
export type IUserLockedEvent = ITypedEvent<'user.locked', 'User', IUserLockedPayload>;
export type IUserUnlockedEvent = ITypedEvent<'user.unlocked', 'User', IUserUnlockedPayload>;
export type IUserAuthProviderLinkedEvent = ITypedEvent<
  'user.auth_provider.linked',
  'User',
  IUserAuthProviderLinkedPayload
>;
export type IUserAuthProviderUnlinkedEvent = ITypedEvent<
  'user.auth_provider.unlinked',
  'User',
  IUserAuthProviderUnlinkedPayload
>;

/**
 * Union of all user events.
 */
export type UserEvent =
  | IUserCreatedEvent
  | IUserProfileUpdatedEvent
  | IUserSettingsChangedEvent
  | IUserPasswordChangedEvent
  | IUserLoggedInEvent
  | IUserLoggedOutEvent
  | IUserDeactivatedEvent
  | IUserDeletedEvent
  | IUserEmailVerifiedEvent
  | IUserMfaEnabledEvent
  | IUserMfaDisabledEvent
  | IUserRoleAddedEvent
  | IUserRoleRemovedEvent
  | IUserLockedEvent
  | IUserUnlockedEvent
  | IUserAuthProviderLinkedEvent
  | IUserAuthProviderUnlinkedEvent;

// ============================================================================
// Event Schemas for Validation
// ============================================================================

export const UserCreatedPayloadSchema = z.object({
  entity: z.object({
    id: z.string(),
    username: z.string(),
    email: z.string(),
    // ... other fields
  }),
  source: z.enum(['user', 'agent', 'system', 'import']),
});

export const UserProfileUpdatedPayloadSchema = z.object({
  changes: z.record(z.unknown()),
  previousVersion: z.number().int().nonnegative(),
});

export const UserSettingsChangedPayloadSchema = z.object({
  changes: z.record(z.unknown()),
  previousVersion: z.number().int().nonnegative(),
});

export const UserLoggedInPayloadSchema = z.object({
  loginMethod: z.enum(['password', 'oauth', 'mfa', 'token']),
  clientIp: z.string().optional(),
  userAgent: z.string().optional(),
});
