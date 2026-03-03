/**
 * @noema/user-service - Admin Repository Interfaces
 *
 * Defines separate repository interfaces for admin-specific data access:
 * - IUserStatusChangeRepository: Append-only audit log for admin actions
 * - ISessionRepository: Read-only session queries for login history
 */

import type { IOffsetPagination, IPaginatedResponse, UserId } from '@noema/types';
import type {
  IAuditLogQueryFilters,
  ICreateStatusChangeInput,
  IUserSession,
  IUserStatusChange,
} from '../../types/admin.types.js';

// ============================================================================
// Audit Log Repository
// ============================================================================

/**
 * Repository for the UserStatusChange audit log.
 *
 * This repository is intentionally append-only:
 * - `create()` to add entries
 * - `findByUser()` and `findByAdmin()` to query
 * - NO update or delete methods
 */
export interface IUserStatusChangeRepository {
  /**
   * Create an audit log entry.
   */
  create(input: ICreateStatusChangeInput): Promise<IUserStatusChange>;

  /**
   * Find audit log entries for a specific user.
   */
  findByUser(
    userId: string,
    filters: IAuditLogQueryFilters,
    pagination: IOffsetPagination
  ): Promise<IPaginatedResponse<IUserStatusChange>>;

  /**
   * Count audit log entries for a specific user.
   */
  countByUser(userId: string, filters?: IAuditLogQueryFilters): Promise<number>;
}

export const USER_STATUS_CHANGE_REPOSITORY = Symbol.for('IUserStatusChangeRepository');

// ============================================================================
// Session Repository
// ============================================================================

/**
 * Repository for UserSession queries.
 *
 * Provides read access to login/session history for admin investigations,
 * plus session revocation capabilities for admin moderation actions.
 */
export interface ISessionRepository {
  /**
   * Find sessions for a user with filtering and pagination.
   */
  findByUser(
    userId: string,
    filters: { status?: 'active' | 'expired' | 'revoked' | 'all' },
    pagination: IOffsetPagination,
    sort: { sortBy: 'createdAt' | 'expiresAt'; sortOrder: 'asc' | 'desc' }
  ): Promise<IPaginatedResponse<IUserSession>>;

  /**
   * Count sessions for a user.
   */
  countByUser(
    userId: string,
    filters?: { status?: 'active' | 'expired' | 'revoked' | 'all' }
  ): Promise<number>;

  /**
   * End all active sessions for a user (set endedAt = now).
   * Used when suspending/banning a user.
   * @returns Number of sessions ended
   */
  endAllByUser(userId: UserId): Promise<number>;
}

export const SESSION_REPOSITORY = Symbol.for('ISessionRepository');
