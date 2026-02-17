/**
 * @noema/user-service - User Repository Interface
 *
 * Abstract repository interface for user data access.
 * Implementations can use Prisma, in-memory, or other storage.
 */

import type { IOffsetPagination, IPaginatedResponse, UserId } from '@noema/types';
import type {
  ICreateUserInput,
  IFailedLoginHistoryEntry,
  ILoginHistoryEntry,
  IUpdateProfileInput,
  IUpdateSettingsInput,
  IUser,
  IUserFilters,
} from '../../types/user.types.js';

// ============================================================================
// Repository Interface
// ============================================================================

/**
 * User repository interface.
 * All data access goes through this interface.
 */
export interface IUserRepository {
  // ============================================================================
  // Read Operations
  // ============================================================================

  /**
   * Find user by ID.
   * @returns User or null if not found
   */
  findById(id: UserId): Promise<IUser | null>;

  /**
   * Find user by email.
   * @returns User or null if not found
   */
  findByEmail(email: string): Promise<IUser | null>;

  /**
   * Find user by username.
   * @returns User or null if not found
   */
  findByUsername(username: string): Promise<IUser | null>;

  /**
   * Find user by email or username.
   * Used for login.
   * @returns User or null if not found
   */
  findByIdentifier(identifier: string): Promise<IUser | null>;

  /**
   * Find users matching filters with pagination.
   */
  find(filters: IUserFilters, pagination: IOffsetPagination): Promise<IPaginatedResponse<IUser>>;

  /**
   * Check if email exists.
   */
  emailExists(email: string): Promise<boolean>;

  /**
   * Check if username exists.
   */
  usernameExists(username: string): Promise<boolean>;

  /**
   * Count users matching filters.
   */
  count(filters?: IUserFilters): Promise<number>;

  // ============================================================================
  // Write Operations
  // ============================================================================

  /**
   * Create a new user.
   * @returns Created user
   */
  create(input: ICreateUserInput & { id: UserId; passwordHash?: string }): Promise<IUser>;

  /**
   * Update user profile.
   * Uses optimistic locking.
   * @returns Updated user
   */
  updateProfile(id: UserId, input: IUpdateProfileInput, version: number): Promise<IUser>;

  /**
   * Update user settings.
   * Uses optimistic locking.
   * @returns Updated user
   */
  updateSettings(id: UserId, input: IUpdateSettingsInput, version: number): Promise<IUser>;

  /**
   * Update password hash.
   * @param changedBy - User ID of who made the change (self or admin)
   * @returns Updated user
   */
  updatePassword(
    id: UserId,
    passwordHash: string,
    version: number,
    changedBy?: UserId
  ): Promise<IUser>;

  /**
   * Update user status.
   * @returns Updated user
   */
  updateStatus(id: UserId, status: string, version: number): Promise<IUser>;

  /**
   * Update email verification status.
   * @returns Updated user
   */
  updateEmailVerified(id: UserId, verified: boolean, version: number): Promise<IUser>;

  /**
   * Update login tracking fields.
   * @param loginEntry - Optional entry to add to login history
   */
  updateLoginTracking(
    id: UserId,
    data: {
      lastLoginAt: string;
      loginCount: number;
      failedLoginAttempts: number;
      lockedUntil: string | null;
    },
    loginEntry?: ILoginHistoryEntry
  ): Promise<void>;

  /**
   * Increment failed login attempts.
   * @param entry - Optional entry to add to failed login history
   * @returns New attempt count
   */
  incrementFailedLoginAttempts(id: UserId, entry?: IFailedLoginHistoryEntry): Promise<number>;

  /**
   * Reset failed login attempts.
   */
  resetFailedLoginAttempts(id: UserId): Promise<void>;

  /**
   * Lock account until specified time.
   */
  lockAccount(id: UserId, lockedUntil: string): Promise<void>;

  /**
   * Unlock account.
   */
  unlockAccount(id: UserId): Promise<void>;

  /**
   * Add auth provider to user.
   */
  addAuthProvider(id: UserId, provider: string): Promise<void>;

  /**
   * Remove auth provider from user.
   */
  removeAuthProvider(id: UserId, provider: string): Promise<void>;

  /**
   * Enable MFA for user.
   */
  enableMfa(id: UserId, secret: string, version: number): Promise<IUser>;

  /**
   * Disable MFA for user.
   */
  disableMfa(id: UserId, version: number): Promise<IUser>;

  /**
   * Add role to user.
   */
  addRole(id: UserId, role: string): Promise<void>;

  /**
   * Remove role from user.
   */
  removeRole(id: UserId, role: string): Promise<void>;

  // ============================================================================
  // Delete Operations
  // ============================================================================

  /**
   * Soft delete user.
   * Sets deletedAt timestamp.
   */
  softDelete(id: UserId): Promise<void>;

  /**
   * Permanently delete user.
   * Use with caution.
   */
  hardDelete(id: UserId): Promise<void>;

  /**
   * Restore soft-deleted user.
   */
  restore(id: UserId): Promise<void>;
}

// ============================================================================
// Repository Factory Types
// ============================================================================

/**
 * Repository type registry.
 * Used for dependency injection.
 */
export const USER_REPOSITORY = Symbol.for('IUserRepository');
