/**
 * @noema/user-service - Admin Domain Types
 *
 * Types for Phase 4 Admin User Management.
 * Covers status changes, role management, login history,
 * audit log, and admin-triggered password resets.
 */

import type { UserId } from '@noema/types';
import type { UserRole, UserStatus } from './user.types.js';

// ============================================================================
// Status Change Action Enum
// ============================================================================

export const StatusChangeAction = {
  STATUS_CHANGE: 'STATUS_CHANGE',
  ROLE_CHANGE: 'ROLE_CHANGE',
  PASSWORD_RESET: 'PASSWORD_RESET',
  SESSION_REVOCATION: 'SESSION_REVOCATION',
} as const;

export type StatusChangeAction = (typeof StatusChangeAction)[keyof typeof StatusChangeAction];

// ============================================================================
// Password Reset Initiator Enum
// ============================================================================

export const PasswordResetInitiator = {
  USER: 'USER',
  ADMIN: 'ADMIN',
} as const;

export type PasswordResetInitiator =
  (typeof PasswordResetInitiator)[keyof typeof PasswordResetInitiator];

// ============================================================================
// Session Status (derived, not stored)
// ============================================================================

export const SessionStatus = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
} as const;

export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

// ============================================================================
// Admin Action Inputs
// ============================================================================

/**
 * Input for changing a user's account status (T4.1).
 */
export interface IChangeUserStatusInput {
  /** Target status */
  status: typeof UserStatus.ACTIVE | typeof UserStatus.SUSPENDED | typeof UserStatus.BANNED;
  /** Admin-provided reason (required for SUSPENDED and BANNED) */
  reason?: string | undefined;
  /** Suspension expiry (optional, for SUSPENDED only) */
  expiresAt?: string | undefined;
}

/**
 * Input for setting a user's roles (T4.2).
 * Declarative: replaces current roles entirely.
 */
export interface ISetUserRolesInput {
  /** Full set of roles to assign */
  roles: UserRole[];
}

/**
 * Query filters for login history (T4.4).
 */
export interface ISessionQueryFilters {
  status?: 'active' | 'expired' | 'revoked' | 'all' | undefined;
  sortBy?: 'createdAt' | 'expiresAt' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

/**
 * Query filters for audit log (T4.5).
 */
export interface IAuditLogQueryFilters {
  action?: StatusChangeAction | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Response for a single session/login history entry (T4.4).
 */
export interface ILoginHistoryResponse {
  id: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastActiveAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  status: SessionStatus;
}

/**
 * Response for a single audit log entry (T4.5).
 */
export interface IUserStatusChangeResponse {
  id: string;
  userId: string;
  changedBy: string;
  changedByDisplayName: string | null;
  action: StatusChangeAction;
  previousValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
  reason: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/**
 * Domain entity for UserStatusChange (internal use).
 */
export interface IUserStatusChange {
  id: string;
  userId: string;
  changedBy: string;
  action: StatusChangeAction;
  previousValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
  reason: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

/**
 * Domain entity for UserSession query results.
 */
export interface IUserSession {
  id: string;
  userId: string;
  deviceId: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  startedAt: Date;
  lastActiveAt: Date;
  endedAt: Date | null;
}

/**
 * Input for creating an audit log entry.
 */
export interface ICreateStatusChangeInput {
  userId: string;
  changedBy: UserId;
  action: StatusChangeAction;
  previousValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
  reason?: string | undefined;
  expiresAt?: Date | undefined;
}
