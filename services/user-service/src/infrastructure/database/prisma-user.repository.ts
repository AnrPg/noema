/**
 * @noema/user-service - Prisma User Repository
 *
 * Implementation of IUserRepository using Prisma.
 */

import type { IOffsetPagination, IPaginatedResponse, UserId } from '@noema/types';
import type { Prisma, PrismaClient, User as PrismaUser } from '@prisma/client';
import { VersionConflictError } from '../../domain/user-service/errors/index.js';
import type { IUserRepository } from '../../domain/user-service/user.repository.js';
import type {
    ICreateUserInput,
    IFailedLoginHistoryEntry,
    ILoginHistoryEntry,
    IPasswordChangeHistoryEntry,
    IUpdateProfileInput,
    IUpdateSettingsInput,
    IUser,
    IUserFilters,
    IUserProfile,
    IUserSettings,
} from '../../types/user.types.js';
import { AuthProvider, Language, MAX_HISTORY_ITEMS, Theme, UserRole, UserStatus } from '../../types/user.types.js';

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_PROFILE: IUserProfile = {
  displayName: '',
  bio: null,
  avatarUrl: null,
  timezone: 'UTC',
  language: Language.EN,
  country: null,
};

const DEFAULT_SETTINGS: IUserSettings = {
  theme: Theme.SYSTEM,
  dailyReminderEnabled: true,
  dailyReminderTime: '09:00',
  defaultNewCardsPerDay: 20,
  defaultReviewCardsPerDay: 100,
  soundEnabled: true,
  hapticEnabled: true,
  autoAdvanceEnabled: false,
  showTimerEnabled: true,
  emailStreakReminders: true,
  emailAchievements: true,
  pushNotificationsEnabled: true,
  analyticsEnabled: true,
};

// ============================================================================
// Repository Implementation
// ============================================================================

export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ============================================================================
  // Read Operations
  // ============================================================================

  async findById(id: UserId): Promise<IUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
    });
    return user ? this.toDomain(user) : null;
  }

  async findByEmail(email: string): Promise<IUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase(), deletedAt: null },
    });
    return user ? this.toDomain(user) : null;
  }

  async findByUsername(username: string): Promise<IUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase(), deletedAt: null },
    });
    return user ? this.toDomain(user) : null;
  }

  async findByIdentifier(identifier: string): Promise<IUser | null> {
    const normalized = identifier.toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: normalized }, { username: normalized }],
        deletedAt: null,
      },
    });
    return user ? this.toDomain(user) : null;
  }

  async find(
    filters: IUserFilters,
    pagination: IOffsetPagination
  ): Promise<IPaginatedResponse<IUser>> {
    const where = this.buildWhereClause(filters);

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: pagination.offset,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: users.map((u) => this.toDomain(u)),
      total,
      hasMore: pagination.offset + pagination.limit < total,
      nextCursor: undefined,
    };
  }

  async emailExists(email: string): Promise<boolean> {
    const count = await this.prisma.user.count({
      where: { email: email.toLowerCase() },
    });
    return count > 0;
  }

  async usernameExists(username: string): Promise<boolean> {
    const count = await this.prisma.user.count({
      where: { username: username.toLowerCase() },
    });
    return count > 0;
  }

  async count(filters?: IUserFilters): Promise<number> {
    const where = filters ? this.buildWhereClause(filters) : { deletedAt: null };
    return this.prisma.user.count({ where });
  }

  // ============================================================================
  // Write Operations
  // ============================================================================

  async create(input: ICreateUserInput & { id: UserId; passwordHash?: string }): Promise<IUser> {
    const profile: IUserProfile = {
      ...DEFAULT_PROFILE,
      displayName: input.displayName || input.username,
      language: input.language || Language.EN,
      timezone: input.timezone || 'UTC',
      country: input.country || null,
    };

    const user = await this.prisma.user.create({
      data: {
        id: input.id,
        username: input.username.toLowerCase(),
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        status: UserStatus.PENDING,
        emailVerified: false,
        roles: [UserRole.LEARNER],
        authProviders: input.authProvider ? [input.authProvider] : [AuthProvider.LOCAL],
        profile: profile as unknown as Prisma.JsonObject,
        settings: DEFAULT_SETTINGS as unknown as Prisma.JsonObject,
        mfaEnabled: false,
        version: 1,
        // Initialize history arrays as empty
        loginHistory: [],
        failedLoginHistory: [],
        passwordChangeHistory: [],
      },
    });

    return this.toDomain(user);
  }

  async updateProfile(id: UserId, input: IUpdateProfileInput, version: number): Promise<IUser> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`User not found: ${id}`);
    }
    if (existing.version !== version) {
      throw new VersionConflictError(version, existing.version);
    }

    const currentProfile = existing.profile as unknown as IUserProfile;
    const newProfile = { ...currentProfile, ...input };

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        profile: newProfile as unknown as Prisma.JsonObject,
        version: { increment: 1 },
      },
    });

    return this.toDomain(user);
  }

  async updateSettings(id: UserId, input: IUpdateSettingsInput, version: number): Promise<IUser> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`User not found: ${id}`);
    }
    if (existing.version !== version) {
      throw new VersionConflictError(version, existing.version);
    }

    const currentSettings = existing.settings as unknown as IUserSettings;
    const newSettings = { ...currentSettings, ...input };

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        settings: newSettings as unknown as Prisma.JsonObject,
        version: { increment: 1 },
      },
    });

    return this.toDomain(user);
  }

  async updatePassword(id: UserId, passwordHash: string, version: number, changedBy?: UserId): Promise<IUser> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new Error(`User not found: ${id}`);

    // Build updated password change history
    let passwordChangeHistory = (existing.passwordChangeHistory as unknown as IPasswordChangeHistoryEntry[]) || [];
    const newEntry: IPasswordChangeHistoryEntry = {
      timestamp: new Date().toISOString(),
      changedBy,
    };
    passwordChangeHistory = [newEntry, ...passwordChangeHistory].slice(0, MAX_HISTORY_ITEMS);

    const user = await this.prisma.user.update({
      where: { id, version },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        passwordChangeHistory: passwordChangeHistory as unknown as Prisma.JsonArray,
        version: { increment: 1 },
      },
    });

    return this.toDomain(user);
  }

  async updateStatus(id: UserId, status: string, version: number): Promise<IUser> {
    const user = await this.prisma.user.update({
      where: { id, version },
      data: {
        status: status as UserStatus,
        version: { increment: 1 },
      },
    });

    return this.toDomain(user);
  }

  async updateEmailVerified(id: UserId, verified: boolean, version: number): Promise<IUser> {
    const user = await this.prisma.user.update({
      where: { id, version },
      data: {
        emailVerified: verified,
        status: verified ? UserStatus.ACTIVE : undefined,
        version: { increment: 1 },
      },
    });

    return this.toDomain(user);
  }

  async updateLoginTracking(
    id: UserId,
    data: {
      lastLoginAt: string;
      loginCount: number;
      failedLoginAttempts: number;
      lockedUntil: string | null;
    },
    loginEntry?: ILoginHistoryEntry
  ): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) return;

    // Build updated login history
    let loginHistory = (existing.loginHistory as unknown as ILoginHistoryEntry[]) || [];
    if (loginEntry) {
      loginHistory = [loginEntry, ...loginHistory].slice(0, MAX_HISTORY_ITEMS);
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        lastLoginAt: new Date(data.lastLoginAt),
        loginCount: data.loginCount,
        failedLoginAttempts: data.failedLoginAttempts,
        lockedUntil: data.lockedUntil ? new Date(data.lockedUntil) : null,
        loginHistory: loginHistory as unknown as Prisma.JsonArray,
      },
    });
  }

  async incrementFailedLoginAttempts(id: UserId, entry?: IFailedLoginHistoryEntry): Promise<number> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) return 0;

    // Build updated failed login history
    let failedLoginHistory = (existing.failedLoginHistory as unknown as IFailedLoginHistoryEntry[]) || [];
    if (entry) {
      failedLoginHistory = [entry, ...failedLoginHistory].slice(0, MAX_HISTORY_ITEMS);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        failedLoginAttempts: { increment: 1 },
        failedLoginHistory: failedLoginHistory as unknown as Prisma.JsonArray,
      },
    });

    return user.failedLoginAttempts;
  }

  async resetFailedLoginAttempts(id: UserId): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: 0 },
    });
  }

  async lockAccount(id: UserId, lockedUntil: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lockedUntil: new Date(lockedUntil) },
    });
  }

  async unlockAccount(id: UserId): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lockedUntil: null, failedLoginAttempts: 0 },
    });
  }

  async addAuthProvider(id: UserId, provider: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: {
        authProviders: { push: provider },
      },
    });
  }

  async removeAuthProvider(id: UserId, provider: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (user) {
      const providers = user.authProviders.filter((p) => p !== provider);
      await this.prisma.user.update({
        where: { id },
        data: { authProviders: providers },
      });
    }
  }

  async enableMfa(id: UserId, secret: string, version: number): Promise<IUser> {
    const user = await this.prisma.user.update({
      where: { id, version },
      data: {
        mfaEnabled: true,
        mfaSecret: secret,
        version: { increment: 1 },
      },
    });

    return this.toDomain(user);
  }

  async disableMfa(id: UserId, version: number): Promise<IUser> {
    const user = await this.prisma.user.update({
      where: { id, version },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        version: { increment: 1 },
      },
    });

    return this.toDomain(user);
  }

  async addRole(id: UserId, role: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: {
        roles: { push: role },
      },
    });
  }

  async removeRole(id: UserId, role: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (user) {
      const roles = user.roles.filter((r) => r !== role);
      await this.prisma.user.update({
        where: { id },
        data: { roles },
      });
    }
  }

  // ============================================================================
  // Delete Operations
  // ============================================================================

  async softDelete(id: UserId): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: UserStatus.DEACTIVATED,
      },
    });
  }

  async hardDelete(id: UserId): Promise<void> {
    await this.prisma.user.delete({ where: { id } });
  }

  async restore(id: UserId): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: null,
        status: UserStatus.ACTIVE,
      },
    });
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private buildWhereClause(filters: IUserFilters): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
    };

    // Core filters
    if (filters.status) {
      where.status = filters.status as UserStatus;
    }

    if (filters.emailVerified !== undefined) {
      where.emailVerified = filters.emailVerified;
    }

    if (filters.roles && filters.roles.length > 0) {
      where.roles = { hasSome: filters.roles };
    }

    if (filters.authProvider) {
      where.authProviders = { has: filters.authProvider };
    }

    // Profile filters (using JSON path queries)
    if (filters.username) {
      where.username = { contains: filters.username, mode: 'insensitive' };
    }

    if (filters.displayName) {
      where.profile = {
        path: ['displayName'],
        string_contains: filters.displayName,
      };
    }

    if (filters.country) {
      where.profile = {
        ...where.profile as object,
        path: ['country'],
        equals: filters.country,
      };
    }

    if (filters.language) {
      where.profile = {
        ...where.profile as object,
        path: ['language'],
        equals: filters.language,
      };
    }

    if (filters.timezone) {
      where.profile = {
        ...where.profile as object,
        path: ['timezone'],
        equals: filters.timezone,
      };
    }

    // Date range filters
    if (filters.createdAfter || filters.createdBefore) {
      where.createdAt = {};
      if (filters.createdAfter) {
        (where.createdAt as Prisma.DateTimeFilter).gte = new Date(filters.createdAfter);
      }
      if (filters.createdBefore) {
        (where.createdAt as Prisma.DateTimeFilter).lte = new Date(filters.createdBefore);
      }
    }

    if (filters.updatedAfter || filters.updatedBefore) {
      where.updatedAt = {};
      if (filters.updatedAfter) {
        (where.updatedAt as Prisma.DateTimeFilter).gte = new Date(filters.updatedAfter);
      }
      if (filters.updatedBefore) {
        (where.updatedAt as Prisma.DateTimeFilter).lte = new Date(filters.updatedBefore);
      }
    }

    if (filters.lastLoginAfter || filters.lastLoginBefore) {
      where.lastLoginAt = {};
      if (filters.lastLoginAfter) {
        (where.lastLoginAt as Prisma.DateTimeNullableFilter).gte = new Date(filters.lastLoginAfter);
      }
      if (filters.lastLoginBefore) {
        (where.lastLoginAt as Prisma.DateTimeNullableFilter).lte = new Date(filters.lastLoginBefore);
      }
    }

    // Full-text search
    if (filters.search) {
      where.OR = [
        { username: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private toDomain(user: PrismaUser): IUser {
    const profile = user.profile as unknown as IUserProfile;
    const settings = user.settings as unknown as IUserSettings;
    const loginHistory = (user.loginHistory as unknown as ILoginHistoryEntry[]) || [];
    const failedLoginHistory = (user.failedLoginHistory as unknown as IFailedLoginHistoryEntry[]) || [];
    const passwordChangeHistory = (user.passwordChangeHistory as unknown as IPasswordChangeHistoryEntry[]) || [];

    return {
      id: user.id as UserId,
      username: user.username,
      email: user.email,
      passwordHash: user.passwordHash,
      emailVerified: user.emailVerified,
      status: user.status as UserStatus,
      roles: user.roles as UserRole[],
      authProviders: user.authProviders as AuthProvider[],
      profile,
      settings,
      lastLoginAt: user.lastLoginAt?.toISOString() || null,
      loginHistory,
      loginCount: user.loginCount,
      failedLoginAttempts: user.failedLoginAttempts,
      failedLoginHistory,
      lockedUntil: user.lockedUntil?.toISOString() || null,
      passwordChangedAt: user.passwordChangedAt?.toISOString() || null,
      passwordChangeHistory,
      mfaEnabled: user.mfaEnabled,
      mfaSecret: user.mfaSecret,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      deletedAt: user.deletedAt?.toISOString() || null,
      createdBy: user.createdBy || '',
      updatedBy: user.updatedBy || '',
      version: user.version,
    };
  }
}
