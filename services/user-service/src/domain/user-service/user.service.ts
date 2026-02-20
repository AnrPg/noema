/**
 * @noema/user-service - User Service
 *
 * Domain service implementing all user-related business logic.
 * Follows the SERVICE_CLASS_SPECIFICATION pattern.
 */

import type { IAgentHints } from '@noema/contracts';
import type { CorrelationId, IOffsetPagination, IPaginatedResponse, UserId } from '@noema/types';
import { ID_PREFIXES } from '@noema/types';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import type { Logger } from 'pino';
import type { ITokenService } from '../../infrastructure/external-apis/token.service.js';
import type {
  IAuthSession,
  IChangePasswordInput,
  ICreateUserInput,
  IFailedLoginHistoryEntry,
  ILoginHistoryEntry,
  ILoginInput,
  ITokenPair,
  IUpdateProfileInput,
  IUpdateSettingsInput,
  IUser,
  IUserFilters,
} from '../../types/user.types.js';
import { UserRole, UserStatus } from '../../types/user.types.js';
import type { IEventPublisher } from '../shared/event-publisher.js';
import {
  AccountLockedError,
  AuthorizationError,
  BusinessRuleError,
  EmailAlreadyExistsError,
  InsufficientRoleError,
  InvalidAccountStatusError,
  InvalidCredentialsError,
  TooManyLoginAttemptsError,
  UsernameAlreadyExistsError,
  UserNotFoundError,
  ValidationError,
  VersionConflictError,
} from './errors/index.js';
import type { IUserRepository } from './user.repository.js';
import {
  ChangePasswordInputSchema,
  CreateUserInputSchema,
  LoginInputSchema,
  UpdateProfileInputSchema,
  UpdateSettingsInputSchema,
} from './user.schemas.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Execution context for service operations.
 */
export interface IExecutionContext {
  /** Current user ID (null for anonymous) */
  userId: UserId | null;
  /** Request correlation ID */
  correlationId: CorrelationId;
  /** User roles for authorization */
  roles: UserRole[];
  /** Client IP for audit */
  clientIp?: string;
  /** User agent */
  userAgent?: string;
}

/**
 * Service result wrapper.
 */
export interface IServiceResult<T> {
  /** Result data */
  data: T;
  /** Agent hints for next actions */
  agentHints: IAgentHints;
}

// ============================================================================
// Constants
// ============================================================================

const SALT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 30;

// ============================================================================
// User Service
// ============================================================================

/**
 * User service implementation.
 */
export class UserService {
  private readonly logger: Logger;

  constructor(
    private readonly repository: IUserRepository,
    private readonly eventPublisher: IEventPublisher,
    private readonly tokenService: ITokenService,
    logger: Logger
  ) {
    this.logger = logger.child({ service: 'UserService' });
  }

  // ============================================================================
  // Create Operations
  // ============================================================================

  /**
   * Register a new user.
   */
  async create(
    input: ICreateUserInput,
    context: IExecutionContext
  ): Promise<IServiceResult<IUser>> {
    this.logger.info({ input: { ...input, password: '[REDACTED]' } }, 'Creating user');

    // Validate input
    const validatedInput = (await this.validateCreateInput(input)) as ICreateUserInput;

    // Check business rules
    await this.checkCreateRules(validatedInput);

    // Hash password
    const passwordHash = await bcrypt.hash(validatedInput.password, SALT_ROUNDS);

    // Generate ID
    const id = `${ID_PREFIXES.UserId}${nanoid(21)}` as UserId;

    // Create user
    const user = await this.repository.create({
      id,
      ...validatedInput,
      passwordHash,
    });

    // Publish event
    await this.eventPublisher.publish({
      eventType: 'user.created',
      aggregateType: 'User',
      aggregateId: id,
      payload: {
        entity: this.sanitizeUser(user),
        source: 'user',
      },
      metadata: {
        correlationId: context.correlationId,
        userId: context.userId,
      },
    });

    this.logger.info({ userId: id }, 'User created successfully');

    return {
      data: user,
      agentHints: this.createAgentHints('created', user),
    };
  }

  // ============================================================================
  // Read Operations
  // ============================================================================

  /**
   * Find user by ID.
   */
  async findById(id: UserId, context: IExecutionContext): Promise<IServiceResult<IUser>> {
    this.logger.debug({ userId: id }, 'Finding user by ID');

    const user = await this.repository.findById(id);

    if (!user) {
      throw new UserNotFoundError(id);
    }

    // Check authorization - users can only see their own profile
    // unless they're admin
    if (context.userId !== id && !this.hasRole(context, [UserRole.ADMIN, UserRole.SUPER_ADMIN])) {
      // Return limited public profile (cast to IUser for API consistency)
      return {
        data: this.getPublicProfile(user) as IUser,
        agentHints: this.createAgentHints('found', user),
      };
    }

    return {
      data: user,
      agentHints: this.createAgentHints('found', user),
    };
  }

  /**
   * Find user by email.
   */
  async findByEmail(email: string, _context: IExecutionContext): Promise<IServiceResult<IUser>> {
    this.logger.debug({ email }, 'Finding user by email');

    const user = await this.repository.findByEmail(email.toLowerCase());

    if (!user) {
      throw new UserNotFoundError(email);
    }

    return {
      data: user,
      agentHints: this.createAgentHints('found', user),
    };
  }

  /**
   * Find users with filters.
   */
  async find(
    filters: IUserFilters,
    pagination: IOffsetPagination,
    context: IExecutionContext
  ): Promise<IServiceResult<IPaginatedResponse<IUser>>> {
    this.logger.debug({ filters, pagination }, 'Finding users');

    // Only admins can list users
    this.requireRole(context, [UserRole.ADMIN, UserRole.SUPER_ADMIN]);

    const result = await this.repository.find(filters, pagination);

    return {
      data: result,
      agentHints: {
        suggestedNextActions: [
          {
            action: 'refine_search',
            description: 'Refine search with additional filters',
            priority: 'medium',
            category: 'exploration',
          },
        ],
        relatedResources: [],
        confidence: 0.9,
        sourceQuality: 'high',
        validityPeriod: 'short',
        contextNeeded: [],
        assumptions: [],
        riskFactors: [],
        dependencies: [],
        estimatedImpact: { benefit: 0.3, effort: 0.2, roi: 1.5 },
        preferenceAlignment: [],
        reasoning: 'Database query successful',
      },
    };
  }

  // ============================================================================
  // Update Operations
  // ============================================================================

  /**
   * Update user profile.
   */
  async updateProfile(
    id: UserId,
    input: IUpdateProfileInput,
    version: number,
    context: IExecutionContext
  ): Promise<IServiceResult<IUser>> {
    this.logger.info({ userId: id, input }, 'Updating user profile');

    // Validate input
    const validatedInput = UpdateProfileInputSchema.parse(input) as IUpdateProfileInput;

    // Authorization - users can only update their own profile
    this.requireSelfOrAdmin(context, id);

    // Get existing user
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new UserNotFoundError(id);
    }

    // Check version for optimistic locking
    if (existing.version !== version) {
      throw new VersionConflictError(version, existing.version);
    }

    // Check business rules
    await this.checkUpdateRules(validatedInput, existing, context);

    // Update profile
    const updated = await this.repository.updateProfile(id, validatedInput, version);

    // Publish event
    await this.eventPublisher.publish({
      eventType: 'user.profile.updated',
      aggregateType: 'User',
      aggregateId: id,
      payload: {
        changes: validatedInput,
        previousVersion: version,
      },
      metadata: {
        correlationId: context.correlationId,
        userId: context.userId,
      },
    });

    this.logger.info({ userId: id }, 'Profile updated successfully');

    return {
      data: updated,
      agentHints: this.createAgentHints('updated', updated),
    };
  }

  /**
   * Update user settings.
   */
  async updateSettings(
    id: UserId,
    input: IUpdateSettingsInput,
    version: number,
    context: IExecutionContext
  ): Promise<IServiceResult<IUser>> {
    this.logger.info({ userId: id, input }, 'Updating user settings');

    // Validate input
    const validatedInput = UpdateSettingsInputSchema.parse(input) as IUpdateSettingsInput;

    // Authorization - users can only update their own settings
    this.requireSelfOrAdmin(context, id);

    // Get existing user
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new UserNotFoundError(id);
    }

    // Check version
    if (existing.version !== version) {
      throw new VersionConflictError(version, existing.version);
    }

    // Update settings
    const updated = await this.repository.updateSettings(id, validatedInput, version);

    // Publish event
    await this.eventPublisher.publish({
      eventType: 'user.settings.changed',
      aggregateType: 'User',
      aggregateId: id,
      payload: {
        changes: validatedInput,
        previousVersion: version,
      },
      metadata: {
        correlationId: context.correlationId,
        userId: context.userId,
      },
    });

    this.logger.info({ userId: id }, 'Settings updated successfully');

    return {
      data: updated,
      agentHints: this.createAgentHints('settings_updated', updated),
    };
  }

  /**
   * Change user password.
   */
  async changePassword(
    id: UserId,
    input: IChangePasswordInput,
    version: number,
    context: IExecutionContext
  ): Promise<IServiceResult<void>> {
    this.logger.info({ userId: id }, 'Changing password');

    // Validate input
    const validatedInput = ChangePasswordInputSchema.parse(input);

    // Authorization
    this.requireSelfOrAdmin(context, id);

    // Get existing user
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new UserNotFoundError(id);
    }

    // Verify current password
    if (existing.passwordHash) {
      const passwordValid = await bcrypt.compare(
        validatedInput.currentPassword,
        existing.passwordHash
      );
      if (!passwordValid) {
        throw new InvalidCredentialsError();
      }
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(validatedInput.newPassword, SALT_ROUNDS);

    // Update password with history tracking (changedBy is context.userId)
    await this.repository.updatePassword(id, passwordHash, version, context.userId || undefined);

    // Publish event
    await this.eventPublisher.publish({
      eventType: 'user.password.changed',
      aggregateType: 'User',
      aggregateId: id,
      payload: {},
      metadata: {
        correlationId: context.correlationId,
        userId: context.userId,
      },
    });

    this.logger.info({ userId: id }, 'Password changed successfully');

    return {
      data: undefined,
      agentHints: {
        suggestedNextActions: [
          {
            action: 'verify_sessions',
            description: 'Verify and invalidate other active sessions if needed',
            priority: 'high',
            category: 'optimization',
          },
        ],
        relatedResources: [],
        confidence: 1.0,
        sourceQuality: 'high',
        validityPeriod: 'immediate',
        contextNeeded: [],
        assumptions: [],
        riskFactors: [],
        dependencies: [],
        estimatedImpact: { benefit: 0.9, effort: 0.1, roi: 9.0 },
        preferenceAlignment: [],
        reasoning: 'Password updated successfully',
      },
    };
  }

  // ============================================================================
  // Authentication Operations
  // ============================================================================

  /**
   * Authenticate user with credentials.
   */
  async login(
    input: ILoginInput,
    context: IExecutionContext
  ): Promise<IServiceResult<IAuthSession>> {
    this.logger.info({ identifier: input.identifier }, 'User login attempt');

    // Validate input
    const validatedInput = LoginInputSchema.parse(input);

    // Find user
    const user = await this.repository.findByIdentifier(validatedInput.identifier);
    if (!user) {
      // Don't reveal whether email/username exists
      throw new InvalidCredentialsError();
    }

    // Check account status
    if (user.status !== UserStatus.ACTIVE) {
      throw new InvalidAccountStatusError(user.status, 'login');
    }

    // Check if account is locked
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      throw new AccountLockedError(user.lockedUntil);
    }

    // Verify password
    if (!user.passwordHash) {
      throw new BusinessRuleError('Account requires OAuth login');
    }

    const passwordValid = await bcrypt.compare(validatedInput.password, user.passwordHash);
    if (!passwordValid) {
      await this.handleFailedLogin(user, context);
      throw new InvalidCredentialsError();
    }

    // Check MFA if enabled
    if (user.mfaEnabled && !validatedInput.mfaCode) {
      return {
        data: { user, tokens: null as unknown as ITokenPair },
        agentHints: {
          suggestedNextActions: [
            {
              action: 'provide_mfa_code',
              description: 'MFA code required to complete login',
              priority: 'critical',
              category: 'learning',
            },
          ],
          relatedResources: [],
          confidence: 1.0,
          sourceQuality: 'high',
          validityPeriod: 'immediate',
          contextNeeded: ['mfa_code'],
          assumptions: [],
          riskFactors: [],
          dependencies: [],
          estimatedImpact: { benefit: 0.9, effort: 0.1, roi: 9.0 },
          preferenceAlignment: [],
          reasoning: 'MFA enabled on account',
        },
      };
    }

    // Generate tokens
    const tokens = await this.tokenService.generateTokenPair(user);

    // Create login history entry
    const loginEntry: ILoginHistoryEntry = {
      timestamp: new Date().toISOString(),
      ipAddress: context.clientIp,
      userAgent: context.userAgent,
      success: true,
    };

    // Update login tracking with history entry
    await this.repository.updateLoginTracking(
      user.id,
      {
        lastLoginAt: new Date().toISOString(),
        loginCount: user.loginCount + 1,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      loginEntry
    );

    // Publish event
    await this.eventPublisher.publish({
      eventType: 'user.logged_in',
      aggregateType: 'User',
      aggregateId: user.id,
      payload: {
        loginMethod: 'password',
        clientIp: context.clientIp,
        userAgent: context.userAgent,
      },
      metadata: {
        correlationId: context.correlationId,
        userId: user.id,
      },
    });

    this.logger.info({ userId: user.id }, 'User logged in successfully');

    return {
      data: { user, tokens },
      agentHints: this.createAgentHints('logged_in', user),
    };
  }

  /**
   * Refresh access token.
   */
  async refreshToken(
    refreshToken: string,
    _context: IExecutionContext
  ): Promise<IServiceResult<ITokenPair>> {
    this.logger.debug('Refreshing token');

    const { userId } = await this.tokenService.verifyRefreshToken(refreshToken);

    const user = await this.repository.findById(userId);
    if (!user) {
      throw new UserNotFoundError(userId);
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new InvalidAccountStatusError(user.status, 'refresh token');
    }

    const tokens = await this.tokenService.generateTokenPair(user);

    return {
      data: tokens,
      agentHints: {
        suggestedNextActions: [],
        relatedResources: [],
        confidence: 1.0,
        sourceQuality: 'high',
        validityPeriod: 'short',
        contextNeeded: [],
        assumptions: [],
        riskFactors: [],
        dependencies: [],
        estimatedImpact: { benefit: 0.5, effort: 0.1, roi: 5.0 },
        preferenceAlignment: [],
        reasoning: 'Token refreshed',
      },
    };
  }

  // ============================================================================
  // Delete Operations
  // ============================================================================

  /**
   * Soft delete user account.
   */
  async delete(
    id: UserId,
    soft: boolean = true,
    context: IExecutionContext
  ): Promise<IServiceResult<void>> {
    this.logger.info({ userId: id, soft }, 'Deleting user');

    // Authorization
    this.requireSelfOrAdmin(context, id);

    // Get existing user
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new UserNotFoundError(id);
    }

    // Check delete rules
    await this.checkDeleteRules(existing, context);

    if (soft) {
      await this.repository.softDelete(id);
    } else {
      // Hard delete requires super admin
      this.requireRole(context, [UserRole.SUPER_ADMIN]);
      await this.repository.hardDelete(id);
    }

    // Publish event
    await this.eventPublisher.publish({
      eventType: soft ? 'user.deactivated' : 'user.deleted',
      aggregateType: 'User',
      aggregateId: id,
      payload: {
        soft,
      },
      metadata: {
        correlationId: context.correlationId,
        userId: context.userId,
      },
    });

    this.logger.info({ userId: id, soft }, 'User deleted successfully');

    return {
      data: undefined,
      agentHints: {
        suggestedNextActions: soft
          ? [
              {
                action: 'restore_account',
                description: 'Account can be restored if needed',
                priority: 'low',
                category: 'correction',
              },
            ]
          : [],
        relatedResources: [],
        confidence: 1.0,
        sourceQuality: 'high',
        validityPeriod: 'indefinite',
        contextNeeded: [],
        assumptions: [],
        riskFactors: soft
          ? []
          : [
              {
                type: 'accuracy',
                severity: 'critical',
                description: 'Hard delete is irreversible',
                probability: 1.0,
                impact: 1.0,
              },
            ],
        dependencies: [],
        estimatedImpact: soft
          ? { benefit: 0.3, effort: 0.2, roi: 1.5 }
          : { benefit: 0.5, effort: 0.3, roi: 1.67 },
        preferenceAlignment: [],
        reasoning: soft ? 'Account soft deleted (can be restored)' : 'Account permanently deleted',
      },
    };
  }

  // ============================================================================
  // Private Validation Methods
  // ============================================================================

  private async validateCreateInput(input: ICreateUserInput) {
    try {
      return CreateUserInputSchema.parse(input);
    } catch (error) {
      if (error instanceof Error && 'errors' in error) {
        const zodError = error as { errors: Array<{ path: string[]; message: string }> };
        const fieldErrors: Record<string, string[]> = {};
        for (const err of zodError.errors) {
          const field = err.path.join('.');
          if (!fieldErrors[field]) {
            fieldErrors[field] = [];
          }
          fieldErrors[field].push(err.message);
        }
        throw new ValidationError('Invalid input', fieldErrors);
      }
      throw error;
    }
  }

  // ============================================================================
  // Private Business Rule Methods
  // ============================================================================

  private async checkCreateRules(input: ICreateUserInput): Promise<void> {
    // Check email uniqueness
    if (await this.repository.emailExists(input.email)) {
      throw new EmailAlreadyExistsError(input.email);
    }

    // Check username uniqueness
    if (await this.repository.usernameExists(input.username)) {
      throw new UsernameAlreadyExistsError(input.username);
    }
  }

  private async checkUpdateRules(
    _input: IUpdateProfileInput,
    _existing: IUser,
    _context: IExecutionContext
  ): Promise<void> {
    // Add any profile update rules here
  }

  private async checkDeleteRules(existing: IUser, _context: IExecutionContext): Promise<void> {
    // Prevent deleting super admins
    if (existing.roles.includes(UserRole.SUPER_ADMIN)) {
      throw new BusinessRuleError('Cannot delete super admin account');
    }
  }

  // ============================================================================
  // Private Authorization Methods
  // ============================================================================

  private hasRole(context: IExecutionContext, roles: UserRole[]): boolean {
    return roles.some((role) => context.roles.includes(role));
  }

  private requireRole(context: IExecutionContext, roles: UserRole[]): void {
    if (!this.hasRole(context, roles)) {
      throw new InsufficientRoleError(roles);
    }
  }

  private requireSelfOrAdmin(context: IExecutionContext, targetId: UserId): void {
    if (
      context.userId !== targetId &&
      !this.hasRole(context, [UserRole.ADMIN, UserRole.SUPER_ADMIN])
    ) {
      throw new AuthorizationError('Access denied');
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async handleFailedLogin(user: IUser, context: IExecutionContext): Promise<void> {
    // Create failed login history entry
    const failedEntry: IFailedLoginHistoryEntry = {
      timestamp: new Date().toISOString(),
      reason: 'invalid_password',
      ipAddress: context.clientIp,
    };

    const attempts = await this.repository.incrementFailedLoginAttempts(user.id, failedEntry);

    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      const lockUntil = new Date();
      lockUntil.setMinutes(lockUntil.getMinutes() + LOCK_DURATION_MINUTES);
      await this.repository.lockAccount(user.id, lockUntil.toISOString());

      throw new TooManyLoginAttemptsError(0);
    }

    throw new TooManyLoginAttemptsError(MAX_LOGIN_ATTEMPTS - attempts);
  }

  private sanitizeUser(user: IUser): Omit<IUser, 'passwordHash' | 'mfaSecret'> {
    const { passwordHash, mfaSecret, ...sanitized } = user;
    return sanitized;
  }

  private getPublicProfile(user: IUser): Partial<IUser> {
    return {
      id: user.id,
      username: user.username,
      profile: {
        displayName: user.profile.displayName,
        bio: user.profile.bio,
        avatarUrl: user.profile.avatarUrl,
        timezone: user.profile.timezone,
        language: user.profile.language,
        country: user.profile.country,
      },
    };
  }

  private createAgentHints(action: string, user: IUser): IAgentHints {
    const hints: IAgentHints = {
      suggestedNextActions: [],
      relatedResources: [
        {
          type: 'User',
          id: user.id,
          label: user.profile.displayName || user.username,
          relevance: 1.0,
        },
      ],
      confidence: 1.0,
      sourceQuality: 'high',
      validityPeriod: 'medium',
      contextNeeded: [],
      assumptions: [],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0.8, effort: 0.2, roi: 4.0 },
      preferenceAlignment: [],
      reasoning: `${action} operation completed`,
    };

    // Add action-specific hints
    switch (action) {
      case 'created':
        hints.suggestedNextActions.push(
          {
            action: 'verify_email',
            description: 'Send email verification link',
            priority: 'high',
            category: 'optimization',
          },
          {
            action: 'complete_profile',
            description: 'Prompt user to complete their profile',
            priority: 'medium',
            category: 'exploration',
          }
        );
        break;
      case 'logged_in':
        hints.suggestedNextActions.push(
          {
            action: 'load_preferences',
            description: 'Load user preferences and settings',
            priority: 'high',
            category: 'optimization',
          },
          {
            action: 'check_streak',
            description: 'Check and update learning streak',
            priority: 'medium',
            category: 'learning',
          }
        );
        break;
      case 'updated':
        hints.suggestedNextActions.push({
          action: 'sync_profile',
          description: 'Sync profile changes to other services',
          priority: 'medium',
          category: 'optimization',
        });
        break;
      case 'settings_updated':
        hints.suggestedNextActions.push({
          action: 'apply_settings',
          description: 'Apply new settings to active sessions',
          priority: 'high',
          category: 'optimization',
        });
        break;
    }

    return hints;
  }
}
