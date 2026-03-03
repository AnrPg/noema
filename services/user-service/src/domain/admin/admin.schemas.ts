/**
 * @noema/user-service - Admin Zod Validation Schemas
 *
 * Zod schemas for all Phase 4 admin endpoints.
 * Uses z.coerce for GET query params (string → number coercion).
 */

import { z } from 'zod';
import { UserRole, UserStatus } from '../../types/user.types.js';

// ============================================================================
// Path Parameters
// ============================================================================

export const AdminUserParamsSchema = z.object({
  id: z.string().min(1, 'User ID is required'),
});

// ============================================================================
// T4.1 — Change User Status
// ============================================================================

export const ChangeUserStatusBodySchema = z
  .object({
    status: z.enum([UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.BANNED]),
    reason: z.string().min(1).max(1000).optional(),
    expiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .refine(
    (data) => {
      // reason is required when suspending or banning
      if (data.status === UserStatus.SUSPENDED || data.status === UserStatus.BANNED) {
        return data.reason !== undefined && data.reason.length > 0;
      }
      return true;
    },
    {
      message: 'Reason is required when suspending or banning a user',
      path: ['reason'],
    }
  )
  .refine(
    (data) => {
      // expiresAt is only valid for suspensions
      if (data.expiresAt !== undefined && data.status !== UserStatus.SUSPENDED) {
        return false;
      }
      return true;
    },
    {
      message: 'expiresAt is only valid for suspensions',
      path: ['expiresAt'],
    }
  );

export type ChangeUserStatusBody = z.infer<typeof ChangeUserStatusBodySchema>;

// ============================================================================
// T4.2 — Set User Roles
// ============================================================================

export const SetUserRolesBodySchema = z.object({
  roles: z
    .array(
      z.enum([
        UserRole.USER,
        UserRole.LEARNER,
        UserRole.PREMIUM,
        UserRole.CREATOR,
        UserRole.ADMIN,
        UserRole.SUPER_ADMIN,
      ])
    )
    .min(1, 'At least one role is required'),
});

export type SetUserRolesBody = z.infer<typeof SetUserRolesBodySchema>;

// ============================================================================
// T4.4 — Session / Login History Query
// ============================================================================

export const SessionQuerySchema = z.object({
  status: z.enum(['active', 'expired', 'revoked', 'all']).default('all'),
  sortBy: z.enum(['createdAt', 'expiresAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type SessionQuery = z.infer<typeof SessionQuerySchema>;

// ============================================================================
// T4.5 — Audit Log Query
// ============================================================================

export const AuditLogQuerySchema = z.object({
  action: z
    .enum(['STATUS_CHANGE', 'ROLE_CHANGE', 'PASSWORD_RESET', 'SESSION_REVOCATION'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;
