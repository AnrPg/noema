/**
 * @noema/user-service - Admin User Service
 *
 * Standalone domain service for admin user management (Phase 4).
 * Implements the "Immune System" — status changes, role management,
 * admin-triggered password resets, login history, and audit log.
 *
 * Design decisions:
 * - Scope-based authorization (`admin:users` JWT scope)
 * - Append-only audit log for every admin mutation
 * - Domain events for all status/role changes
 * - Session revocation on suspend/ban (automatic)
 * - Declarative role replacement (not additive)
 */

import type { IAgentHints } from '@noema/contracts';
import type { IOffsetPagination, IPaginatedResponse, UserId } from '@noema/types';
import { createHash, randomBytes } from 'node:crypto';
import type { Logger } from 'pino';
import type { ITokenService } from '../../infrastructure/external-apis/token.service.js';
import type {
  IAuditLogQueryFilters,
  IChangeUserStatusInput,
  ILoginHistoryResponse,
  ISessionQueryFilters,
  ISetUserRolesInput,
  IUserStatusChangeResponse,
} from '../../types/admin.types.js';
import { PasswordResetInitiator, StatusChangeAction } from '../../types/admin.types.js';
import type { IUser } from '../../types/user.types.js';
import { UserRole, UserStatus } from '../../types/user.types.js';
import type { IEventPublisher } from '../shared/event-publisher.js';
import {
  AuthorizationError,
  BusinessRuleError,
  UserNotFoundError,
} from '../user-service/errors/index.js';
import type { IUserRepository } from '../user-service/user.repository.js';
import type { IExecutionContext, IServiceResult } from '../user-service/user.service.js';
import type { ISessionRepository, IUserStatusChangeRepository } from './admin.repository.js';

// ============================================================================
// Constants
// ============================================================================

const ADMIN_PASSWORD_RESET_TOKEN_EXPIRY_MINUTES = 60;
const ADMIN_PASSWORD_RESET_TOKEN_EXPIRY_LABEL = String(ADMIN_PASSWORD_RESET_TOKEN_EXPIRY_MINUTES);
const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'http://localhost:3000';

// ============================================================================
// Service Dependencies
// ============================================================================

export interface IAdminUserServiceDependencies {
  userRepository: IUserRepository;
  statusChangeRepository: IUserStatusChangeRepository;
  sessionRepository: ISessionRepository;
  eventPublisher: IEventPublisher;
  tokenService: ITokenService;
  logger: Logger;
}

// ============================================================================
// Admin User Service
// ============================================================================

export class AdminUserService {
  private readonly userRepository: IUserRepository;
  private readonly statusChangeRepository: IUserStatusChangeRepository;
  private readonly sessionRepository: ISessionRepository;
  private readonly eventPublisher: IEventPublisher;
  private readonly tokenService: ITokenService;
  private readonly logger: Logger;

  constructor(deps: IAdminUserServiceDependencies) {
    this.userRepository = deps.userRepository;
    this.statusChangeRepository = deps.statusChangeRepository;
    this.sessionRepository = deps.sessionRepository;
    this.eventPublisher = deps.eventPublisher;
    this.tokenService = deps.tokenService;
    this.logger = deps.logger.child({ service: 'AdminUserService' });
  }

  // ============================================================================
  // T4.1 — Change User Status (Suspend / Ban / Reactivate)
  // ============================================================================

  /**
   * Change a user's account status.
   *
   * Business rules:
   * - Requires `admin:users` scope.
   * - Admins cannot change their own status.
   * - SUSPENDED and BANNED require a reason.
   * - Only SUSPENDED status allows an expiresAt.
   * - Suspend/ban automatically revokes all sessions and refresh tokens.
   * - Creates an audit log entry.
   * - Emits the appropriate domain event.
   */
  async changeUserStatus(
    targetUserId: UserId,
    input: IChangeUserStatusInput,
    context: IExecutionContext
  ): Promise<IServiceResult<{ userId: string; status: string; message: string }>> {
    this.requireScope(context, 'admin:users');
    const adminUserId = this.requireAuthenticatedAdmin(context);

    this.logger.info(
      { targetUserId, newStatus: input.status, adminId: context.userId },
      'Admin changing user status'
    );

    // Guard: cannot change own status
    if (context.userId === targetUserId) {
      throw new BusinessRuleError('Admins cannot change their own account status');
    }

    // Validate target user exists
    const targetUser = await this.validateTargetUser(targetUserId);
    const previousStatus = targetUser.status;

    // Guard: no-op — already in requested status
    if (previousStatus === input.status) {
      throw new BusinessRuleError(`User is already in status '${input.status}'`, {
        currentStatus: previousStatus,
        requestedStatus: input.status,
      });
    }

    // Update the user's status
    const updatedUser = await this.userRepository.updateStatus(
      targetUserId,
      input.status,
      targetUser.version
    );

    // Auto-revoke sessions + tokens on suspend or ban
    let sessionsRevoked = 0;
    let tokensRevoked = 0;
    if (input.status === UserStatus.SUSPENDED || input.status === UserStatus.BANNED) {
      [sessionsRevoked, tokensRevoked] = await Promise.all([
        this.sessionRepository.endAllByUser(targetUserId),
        this.tokenService.revokeAllRefreshTokensForUser(targetUserId),
      ]);

      this.logger.info(
        { targetUserId, sessionsRevoked, tokensRevoked },
        'Revoked sessions and tokens for suspended/banned user'
      );
    }

    // Create audit log entry
    await this.statusChangeRepository.create({
      userId: targetUserId,
      changedBy: adminUserId,
      action: StatusChangeAction.STATUS_CHANGE,
      previousValue: { status: previousStatus },
      newValue: {
        status: input.status,
        ...(sessionsRevoked > 0 ? { sessionsRevoked } : {}),
        ...(tokensRevoked > 0 ? { tokensRevoked } : {}),
      },
      reason: input.reason,
      expiresAt: input.expiresAt !== undefined ? new Date(input.expiresAt) : undefined,
    });

    // Emit domain event
    await this.publishStatusChangeEvent(targetUserId, input, previousStatus, context, adminUserId);

    this.logger.info(
      { targetUserId, previousStatus, newStatus: input.status },
      'User status changed successfully'
    );

    return {
      data: {
        userId: targetUserId,
        status: updatedUser.status,
        message: `User status changed from '${previousStatus}' to '${input.status}'`,
      },
      agentHints: this.createAgentHints(
        'changeUserStatus',
        `Admin ${adminUserId} changed user ${targetUserId} status: ${previousStatus} → ${input.status}`
      ),
    };
  }

  // ============================================================================
  // T4.2 — Set User Roles (Declarative Replacement)
  // ============================================================================

  /**
   * Declaratively set all roles for a user.
   *
   * Business rules:
   * - Requires `admin:users` scope.
   * - Replaces all existing roles (declarative, not additive).
   * - USER role is always implicitly included.
   * - Admins cannot demote themselves (self-demotion guard).
   * - Creates an audit log entry.
   * - Emits `user.roles.changed` event.
   */
  async setUserRoles(
    targetUserId: UserId,
    input: ISetUserRolesInput,
    context: IExecutionContext
  ): Promise<IServiceResult<{ userId: string; roles: string[]; message: string }>> {
    this.requireScope(context, 'admin:users');
    const adminUserId = this.requireAuthenticatedAdmin(context);

    this.logger.info(
      { targetUserId, newRoles: input.roles, adminId: context.userId },
      'Admin setting user roles'
    );

    // Validate target user exists
    const targetUser = await this.validateTargetUser(targetUserId);
    const previousRoles = [...targetUser.roles];

    // Ensure USER role is always present
    const newRoles = Array.from(new Set([UserRole.USER, ...input.roles]));

    // Guard: self-demotion (cannot remove own ADMIN role)
    if (context.userId === targetUserId) {
      const hadAdmin = previousRoles.includes(UserRole.ADMIN);
      const willHaveAdmin = newRoles.includes(UserRole.ADMIN);
      if (hadAdmin && !willHaveAdmin) {
        throw new BusinessRuleError(
          'Admins cannot remove their own ADMIN role. Ask another admin to do this.'
        );
      }
    }

    // No-op check
    const sortedPrev = [...previousRoles].sort();
    const sortedNew = [...newRoles].sort();
    if (JSON.stringify(sortedPrev) === JSON.stringify(sortedNew)) {
      throw new BusinessRuleError(
        'No role changes detected — roles are already set to the requested values',
        {
          currentRoles: previousRoles,
          requestedRoles: newRoles,
        }
      );
    }

    // Declarative role set via repository
    const updatedUser = await this.userRepository.setRoles(
      targetUserId,
      newRoles,
      targetUser.version
    );

    // Create audit log entry
    await this.statusChangeRepository.create({
      userId: targetUserId,
      changedBy: adminUserId,
      action: StatusChangeAction.ROLE_CHANGE,
      previousValue: { roles: previousRoles },
      newValue: { roles: newRoles },
    });

    // Emit domain event
    await this.eventPublisher.publish({
      eventType: 'user.roles.changed',
      aggregateType: 'User',
      aggregateId: targetUserId,
      payload: {
        oldRoles: previousRoles,
        newRoles,
        changedBy: adminUserId,
      },
      metadata: {
        correlationId: context.correlationId,
        userId: adminUserId,
      },
    });

    this.logger.info({ targetUserId, previousRoles, newRoles }, 'User roles changed successfully');

    return {
      data: {
        userId: targetUserId,
        roles: updatedUser.roles,
        message: `Roles updated: [${previousRoles.join(', ')}] → [${newRoles.join(', ')}]`,
      },
      agentHints: this.createAgentHints(
        'setUserRoles',
        `Admin ${adminUserId} changed roles for ${targetUserId}`
      ),
    };
  }

  // ============================================================================
  // T4.3 — Admin-Triggered Password Reset
  // ============================================================================

  /**
   * Trigger a password reset on behalf of a user.
   *
   * Business rules:
   * - Requires `admin:users` scope.
   * - Generates a reset token with ADMIN initiator tracking.
   * - Extended expiry (60 min vs 15 min for self-service).
   * - Creates an audit log entry.
   * - Emits `user.admin.password_reset` event.
   * - Returns the reset URL (admin hands it to user via secure channel).
   */
  async adminResetPassword(
    targetUserId: UserId,
    context: IExecutionContext
  ): Promise<
    IServiceResult<{ userId: string; resetUrl: string; expiresInMinutes: number; message: string }>
  > {
    this.requireScope(context, 'admin:users');
    const adminUserId = this.requireAuthenticatedAdmin(context);

    this.logger.info({ targetUserId, adminId: context.userId }, 'Admin triggering password reset');

    // Validate target user exists
    const targetUser = await this.validateTargetUser(targetUserId);

    // Generate cryptographically secure token (same pattern as self-service)
    const rawToken = randomBytes(64).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + ADMIN_PASSWORD_RESET_TOKEN_EXPIRY_MINUTES);

    // Store token with admin initiator tracking
    await this.userRepository.createPasswordResetToken({
      userId: targetUserId,
      tokenHash,
      expiresAt,
      initiator: PasswordResetInitiator.ADMIN,
      initiatedBy: adminUserId,
    });

    const resetUrl = `${FRONTEND_URL}/auth/reset-password?token=${rawToken}`;

    // Create audit log entry
    await this.statusChangeRepository.create({
      userId: targetUserId,
      changedBy: adminUserId,
      action: StatusChangeAction.PASSWORD_RESET,
      previousValue: {},
      newValue: {
        initiator: PasswordResetInitiator.ADMIN,
        expiresInMinutes: ADMIN_PASSWORD_RESET_TOKEN_EXPIRY_MINUTES,
      },
    });

    // Emit domain event
    await this.eventPublisher.publish({
      eventType: 'user.admin.password_reset',
      aggregateType: 'User',
      aggregateId: targetUserId,
      payload: {
        triggeredBy: adminUserId,
        email: targetUser.email,
      },
      metadata: {
        correlationId: context.correlationId,
        userId: adminUserId,
      },
    });

    this.logger.info(
      { targetUserId, adminId: context.userId },
      'Admin password reset token generated'
    );

    return {
      data: {
        userId: targetUserId,
        resetUrl,
        expiresInMinutes: ADMIN_PASSWORD_RESET_TOKEN_EXPIRY_MINUTES,
        message: `Password reset link generated for user ${targetUser.email}. Expires in ${ADMIN_PASSWORD_RESET_TOKEN_EXPIRY_LABEL} minutes.`,
      },
      agentHints: this.createAgentHints(
        'adminResetPassword',
        `Admin ${adminUserId} triggered password reset for ${targetUserId}`
      ),
    };
  }

  // ============================================================================
  // T4.4 — Login History (Session Queries)
  // ============================================================================

  /**
   * Retrieve a user's login/session history.
   *
   * Business rules:
   * - Requires `admin:users` scope.
   * - Returns paginated sessions with computed status.
   * - Status is derived: active (no endedAt), revoked (has endedAt before
   *   expected expiry), expired (otherwise).
   */
  async getLoginHistory(
    targetUserId: UserId,
    filters: ISessionQueryFilters,
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<ILoginHistoryResponse>>> {
    this.requireScope(context, 'admin:users');

    // Validate target user exists
    await this.validateTargetUser(targetUserId);

    const pagination: IOffsetPagination = {
      limit: filters.limit ?? 20,
      offset: filters.offset ?? 0,
    };

    const sort = {
      sortBy: filters.sortBy ?? ('createdAt' as const),
      sortOrder: filters.sortOrder ?? ('desc' as const),
    };

    const result = await this.sessionRepository.findByUser(
      targetUserId,
      { status: filters.status ?? 'all' },
      pagination,
      sort
    );

    // Map domain sessions to response format
    const mappedItems: ILoginHistoryResponse[] = result.items.map((session) => ({
      id: session.id,
      createdAt: session.startedAt.toISOString(),
      expiresAt: null, // UserSession model doesn't have expiresAt
      revokedAt: session.endedAt?.toISOString() ?? null,
      lastActiveAt: session.lastActiveAt.toISOString(),
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      status: this.deriveSessionStatus(session.endedAt),
    }));

    return {
      data: {
        items: mappedItems,
        ...(result.total !== undefined ? { total: result.total } : {}),
        hasMore: result.hasMore,
      },
      agentHints: this.createAgentHints(
        'getLoginHistory',
        `Retrieved ${String(mappedItems.length)} sessions for user ${targetUserId}`
      ),
    };
  }

  // ============================================================================
  // T4.5 — Audit Log
  // ============================================================================

  /**
   * Retrieve admin action audit log for a user.
   *
   * Business rules:
   * - Requires `admin:users` scope.
   * - Returns paginated, chronologically sorted audit entries.
   * - Filterable by action type.
   */
  async getAuditLog(
    targetUserId: UserId,
    filters: IAuditLogQueryFilters,
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<IUserStatusChangeResponse>>> {
    this.requireScope(context, 'admin:users');

    // Validate target user exists
    await this.validateTargetUser(targetUserId);

    const pagination: IOffsetPagination = {
      limit: filters.limit ?? 20,
      offset: filters.offset ?? 0,
    };

    const result = await this.statusChangeRepository.findByUser(
      targetUserId,
      { action: filters.action, sortOrder: filters.sortOrder ?? 'desc' },
      pagination
    );

    // Map domain entities to response format
    // Note: changedByDisplayName requires a join or a separate lookup.
    // For now, we return the changedBy ID and null for the display name.
    // A future enhancement could batch-resolve admin display names.
    const mappedItems: IUserStatusChangeResponse[] = result.items.map((entry) => ({
      id: entry.id,
      userId: entry.userId,
      changedBy: entry.changedBy,
      changedByDisplayName: null, // TODO: batch-resolve in a future enhancement
      action: entry.action,
      previousValue: entry.previousValue,
      newValue: entry.newValue,
      reason: entry.reason,
      expiresAt: entry.expiresAt?.toISOString() ?? null,
      createdAt: entry.createdAt.toISOString(),
    }));

    return {
      data: {
        items: mappedItems,
        ...(result.total !== undefined ? { total: result.total } : {}),
        hasMore: result.hasMore,
      },
      agentHints: this.createAgentHints(
        'getAuditLog',
        `Retrieved ${String(mappedItems.length)} audit entries for user ${targetUserId}`
      ),
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Require a specific JWT scope in the execution context.
   * Throws AuthorizationError if the scope is missing.
   */
  private requireScope(context: IExecutionContext, scope: string): void {
    if (!context.scopes.includes(scope)) {
      throw new AuthorizationError(
        `Missing required scope: '${scope}'. This endpoint requires admin privileges.`
      );
    }
  }

  private requireAuthenticatedAdmin(context: IExecutionContext): UserId {
    if (context.userId === null) {
      throw new AuthorizationError('Authenticated admin user required');
    }

    return context.userId;
  }

  /**
   * Validate that a target user exists and return it.
   * Throws UserNotFoundError if not found.
   */
  private async validateTargetUser(userId: UserId): Promise<IUser> {
    const user = await this.userRepository.findById(userId);
    if (user === null) {
      throw new UserNotFoundError(userId);
    }
    return user;
  }

  /**
   * Derive session status from endedAt timestamp.
   *
   * Heuristic:
   * - endedAt is null → active
   * - endedAt is set → revoked (we use "revoked" since we can't distinguish
   *   from "expired" without an explicit expiresAt column on UserSession)
   */
  private deriveSessionStatus(endedAt: Date | null): 'active' | 'expired' | 'revoked' {
    if (endedAt === null) {
      return 'active';
    }
    return 'revoked';
  }

  /**
   * Publish the appropriate domain event for a status change.
   */
  private async publishStatusChangeEvent(
    targetUserId: UserId,
    input: IChangeUserStatusInput,
    previousStatus: string,
    context: IExecutionContext,
    adminUserId: UserId
  ): Promise<void> {
    let eventType: string;
    let payload: Record<string, unknown>;

    switch (input.status) {
      case UserStatus.SUSPENDED:
        eventType = 'user.suspended';
        payload = {
          suspendedBy: adminUserId,
          reason: input.reason ?? '',
          expiresAt: input.expiresAt ?? null,
        };
        break;

      case UserStatus.BANNED:
        eventType = 'user.banned';
        payload = {
          bannedBy: adminUserId,
          reason: input.reason ?? '',
        };
        break;

      case UserStatus.ACTIVE:
        eventType = 'user.reactivated';
        payload = {
          reactivatedBy: adminUserId,
          previousStatus,
        };
        break;

      default:
        // Should not reach here given schema validation, but defensive
        this.logger.warn({ status: input.status }, 'Unknown status for event emission');
        return;
    }

    await this.eventPublisher.publish({
      eventType,
      aggregateType: 'User',
      aggregateId: targetUserId,
      payload,
      metadata: {
        correlationId: context.correlationId,
        userId: adminUserId,
      },
    });
  }

  /**
   * Create standardized agent hints for admin operations.
   */
  private createAgentHints(action: string, reasoning: string): IAgentHints {
    return {
      suggestedNextActions: [],
      relatedResources: [],
      confidence: 1.0,
      sourceQuality: 'high',
      validityPeriod: 'immediate',
      contextNeeded: [],
      assumptions: [],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0.9, effort: 0.2, roi: 4.5 },
      preferenceAlignment: [],
      reasoning: `[AdminUserService.${action}] ${reasoning}`,
    };
  }
}
