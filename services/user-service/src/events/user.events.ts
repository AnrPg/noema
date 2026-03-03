/**
 * @noema/user-service - User Events
 *
 * Re-exports from the shared @noema/events package.
 * All user domain event types and schemas are centrally defined there.
 */

// Re-export types
export type {
  UserAuthProvider,
  IUserEntitySnapshot,
  IUserCreatedPayload,
  IUserProfileUpdatedPayload,
  IUserSettingsChangedPayload,
  IUserPasswordChangedPayload,
  IUserLoggedInPayload,
  IUserLoggedOutPayload,
  IUserDeactivatedPayload,
  IUserDeletedPayload,
  IUserEmailVerifiedPayload,
  IUserMfaEnabledPayload,
  IUserMfaDisabledPayload,
  IUserRoleAddedPayload,
  IUserRoleRemovedPayload,
  IUserLockedPayload,
  IUserUnlockedPayload,
  IUserAuthProviderLinkedPayload,
  IUserAuthProviderUnlinkedPayload,
  IUserUsernameChangedPayload,
  IUserEmailChangeInitiatedPayload,
  IUserEmailChangedPayload,
  IUserPasswordResetRequestedPayload,
  IUserCreatedEvent,
  IUserProfileUpdatedEvent,
  IUserSettingsChangedEvent,
  IUserPasswordChangedEvent,
  IUserLoggedInEvent,
  IUserLoggedOutEvent,
  IUserDeactivatedEvent,
  IUserDeletedEvent,
  IUserEmailVerifiedEvent,
  IUserMfaEnabledEvent,
  IUserMfaDisabledEvent,
  IUserRoleAddedEvent,
  IUserRoleRemovedEvent,
  IUserLockedEvent,
  IUserUnlockedEvent,
  IUserAuthProviderLinkedEvent,
  IUserAuthProviderUnlinkedEvent,
  IUserUsernameChangedEvent,
  IUserEmailChangeInitiatedEvent,
  IUserEmailChangedEvent,
  IUserPasswordResetRequestedEvent,
  UserDomainEvent,
} from '@noema/events/user';

// Re-export values
export { UserEventType } from '@noema/events/user';

// Re-export schemas
export {
  UserCreatedPayloadSchema,
  UserProfileUpdatedPayloadSchema,
  UserSettingsChangedPayloadSchema,
  UserLoggedInPayloadSchema,
  UserPasswordChangedPayloadSchema,
  UserLoggedOutPayloadSchema,
  UserDeactivatedPayloadSchema,
  UserDeletedPayloadSchema,
  UserEmailVerifiedPayloadSchema,
  UserMfaEnabledPayloadSchema,
  UserMfaDisabledPayloadSchema,
  UserRoleAddedPayloadSchema,
  UserRoleRemovedPayloadSchema,
  UserLockedPayloadSchema,
  UserUnlockedPayloadSchema,
  UserAuthProviderLinkedPayloadSchema,
  UserAuthProviderUnlinkedPayloadSchema,
  UserUsernameChangedPayloadSchema,
  UserEmailChangeInitiatedPayloadSchema,
  UserEmailChangedPayloadSchema,
  UserPasswordResetRequestedPayloadSchema,
} from '@noema/events/user';
