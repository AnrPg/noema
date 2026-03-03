/**
 * @noema/user-service - User Events
 *
 * Re-exports from the shared @noema/events package.
 * All user domain event types and schemas are centrally defined there.
 */

// Re-export types
export type {
  IUserAuthProviderLinkedEvent,
  IUserAuthProviderLinkedPayload,
  IUserAuthProviderUnlinkedEvent,
  IUserAuthProviderUnlinkedPayload,
  IUserCreatedEvent,
  IUserCreatedPayload,
  IUserDeactivatedEvent,
  IUserDeactivatedPayload,
  IUserDeletedEvent,
  IUserDeletedPayload,
  IUserEmailChangeInitiatedEvent,
  IUserEmailChangeInitiatedPayload,
  IUserEmailChangedEvent,
  IUserEmailChangedPayload,
  IUserEmailVerifiedEvent,
  IUserEmailVerifiedPayload,
  IUserEntitySnapshot,
  IUserLockedEvent,
  IUserLockedPayload,
  IUserLoggedInEvent,
  IUserLoggedInPayload,
  IUserLoggedOutEvent,
  IUserLoggedOutPayload,
  IUserMfaDisabledEvent,
  IUserMfaDisabledPayload,
  IUserMfaEnabledEvent,
  IUserMfaEnabledPayload,
  IUserPasswordChangedEvent,
  IUserPasswordChangedPayload,
  IUserPasswordResetRequestedEvent,
  IUserPasswordResetRequestedPayload,
  IUserProfileUpdatedEvent,
  IUserProfileUpdatedPayload,
  IUserRoleAddedEvent,
  IUserRoleAddedPayload,
  IUserRoleRemovedEvent,
  IUserRoleRemovedPayload,
  IUserSettingsChangedEvent,
  IUserSettingsChangedPayload,
  IUserUnlockedEvent,
  IUserUnlockedPayload,
  IUserUsernameChangedEvent,
  IUserUsernameChangedPayload,
  UserAuthProvider,
  UserDomainEvent,
} from '@noema/events/user';

// Re-export values
export { UserEventType } from '@noema/events/user';

// Re-export schemas
export {
  UserAuthProviderLinkedPayloadSchema,
  UserAuthProviderUnlinkedPayloadSchema,
  UserCreatedPayloadSchema,
  UserDeactivatedPayloadSchema,
  UserDeletedPayloadSchema,
  UserEmailChangeInitiatedPayloadSchema,
  UserEmailChangedPayloadSchema,
  UserEmailVerifiedPayloadSchema,
  UserLockedPayloadSchema,
  UserLoggedInPayloadSchema,
  UserLoggedOutPayloadSchema,
  UserMfaDisabledPayloadSchema,
  UserMfaEnabledPayloadSchema,
  UserPasswordChangedPayloadSchema,
  UserPasswordResetRequestedPayloadSchema,
  UserProfileUpdatedPayloadSchema,
  UserRoleAddedPayloadSchema,
  UserRoleRemovedPayloadSchema,
  UserSettingsChangedPayloadSchema,
  UserUnlockedPayloadSchema,
  UserUsernameChangedPayloadSchema,
} from '@noema/events/user';
