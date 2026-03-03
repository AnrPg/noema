/**
 * @noema/events - User Domain Events
 *
 * Event definitions for user domain events.
 * Payload types are self-contained (inlined rather than referencing
 * service-local types) so that event consumers in any service can
 * use them without importing user-service internals.
 *
 * @see EVENT_SCHEMA_SPECIFICATION
 */

import type { UserId } from '@noema/types';
import type { ITypedEvent } from '../types.js';

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
  USERNAME_CHANGED: 'user.username.changed',
  EMAIL_CHANGE_INITIATED: 'user.email_change.initiated',
  EMAIL_CHANGED: 'user.email.changed',
  PASSWORD_RESET_REQUESTED: 'user.password_reset.requested',
} as const;

export type UserEventType = (typeof UserEventType)[keyof typeof UserEventType];

// ============================================================================
// Auth Provider (inline for event self-containment)
// ============================================================================

/**
 * Authentication providers supported by the platform.
 * Inlined here so event consumers do not need user-service internals.
 */
export type UserAuthProvider = 'local' | 'google' | 'apple' | 'github';

// ============================================================================
// Event Payload Snapshot Types
// ============================================================================

/**
 * Sanitized user entity snapshot for events (no sensitive data).
 * Mirrors user-service IUser minus passwordHash and mfaSecret.
 */
export interface IUserEntitySnapshot {
  id: UserId;
  username: string;
  email: string;
  emailVerified: boolean;
  status: string;
  roles: string[];
  authProviders: UserAuthProvider[];
  profile: Record<string, unknown>;
  settings: Record<string, unknown>;
  lastLoginAt: string | null;
  loginCount: number;
  mfaEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Event Payloads
// ============================================================================

/**
 * Payload for user.created event.
 */
export interface IUserCreatedPayload {
  entity: IUserEntitySnapshot;
  source: 'user' | 'agent' | 'system' | 'import';
}

/**
 * Payload for user.profile.updated event.
 */
export interface IUserProfileUpdatedPayload {
  changes: Record<string, unknown>;
  previousVersion: number;
}

/**
 * Payload for user.settings.changed event.
 */
export interface IUserSettingsChangedPayload {
  changes: Record<string, unknown>;
  previousVersion: number;
}

/**
 * Payload for user.password.changed event.
 */
export type IUserPasswordChangedPayload = Record<string, never>;

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
  provider: UserAuthProvider;
}

/**
 * Payload for user.auth_provider.unlinked event.
 */
export interface IUserAuthProviderUnlinkedPayload {
  provider: UserAuthProvider;
}

/**
 * Payload for user.username.changed event.
 */
export interface IUserUsernameChangedPayload {
  previousUsername: string;
  newUsername: string;
}

/**
 * Payload for user.email_change.initiated event.
 * Emitted when a user starts the email change flow (verification email sent to new address).
 */
export interface IUserEmailChangeInitiatedPayload {
  pendingEmail: string;
}

/**
 * Payload for user.email.changed event.
 * Emitted when the email verification token is confirmed and the email is actually updated.
 */
export interface IUserEmailChangedPayload {
  previousEmail: string;
  newEmail: string;
}

/**
 * Payload for user.password_reset.requested event.
 * Emitted when a password reset email is sent (only if the email exists).
 */
export interface IUserPasswordResetRequestedPayload {
  email: string;
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
export type IUserUsernameChangedEvent = ITypedEvent<
  'user.username.changed',
  'User',
  IUserUsernameChangedPayload
>;
export type IUserEmailChangeInitiatedEvent = ITypedEvent<
  'user.email_change.initiated',
  'User',
  IUserEmailChangeInitiatedPayload
>;
export type IUserEmailChangedEvent = ITypedEvent<
  'user.email.changed',
  'User',
  IUserEmailChangedPayload
>;
export type IUserPasswordResetRequestedEvent = ITypedEvent<
  'user.password_reset.requested',
  'User',
  IUserPasswordResetRequestedPayload
>;

/**
 * Union of all user domain events.
 */
export type UserDomainEvent =
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
  | IUserAuthProviderUnlinkedEvent
  | IUserUsernameChangedEvent
  | IUserEmailChangeInitiatedEvent
  | IUserEmailChangedEvent
  | IUserPasswordResetRequestedEvent;
