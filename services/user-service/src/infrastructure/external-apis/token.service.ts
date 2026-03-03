/**
 * @noema/user-service - JWT Token Service
 *
 * Token management using jose library.
 */

import type { UserId } from '@noema/types';
import type { Redis } from 'ioredis';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { nanoid } from 'nanoid';
import type { PrismaClient } from '../../../generated/prisma/index.js';
import { InvalidTokenError } from '../../domain/user-service/errors/index.js';
import type { ITokenPair, IUser } from '../../types/user.types.js';

// ============================================================================
// Types
// ============================================================================

export interface ITokenPayload extends JWTPayload {
  sub: string;
  roles: string[];
  scopes: string[];
  type: 'access' | 'refresh';
}

// ============================================================================
// Scope Derivation
// ============================================================================

/**
 * Scope definitions per role tier.
 *
 * User-facing roles (learner, premium, creator) all inherit the
 * base `user` scope set.  `admin`/`super_admin` inherit everything
 * from `user` plus administration scopes.  `agent` and `service`
 * are included for future machine-to-machine token generation.
 */
const BASE_USER_SCOPES: readonly string[] = [
  'scheduler:plan',
  'scheduler:write',
  'session:read',
  'session:write',
  'content:read',
  'content:write',
  'kg:read',
  'kg:write',
] as const;

const ADMIN_SCOPES: readonly string[] = [
  ...BASE_USER_SCOPES,
  'admin:read',
  'admin:write',
  'admin:users',
  'scheduler:admin',
  'session:system:expire',
  'kg:admin',
  'content:admin',
] as const;

const AGENT_SCOPES: readonly string[] = [
  'scheduler:plan',
  'scheduler:write',
  'session:write',
  'kg:read',
  'kg:write',
  'kg:admin',
  'content:read',
] as const;

/**
 * All known scopes — used for the `service` role.
 */
const ALL_SCOPES: readonly string[] = [...new Set([...ADMIN_SCOPES, ...AGENT_SCOPES])] as const;

const ROLE_SCOPE_MAP: Record<string, readonly string[]> = {
  // Universal base role
  user: BASE_USER_SCOPES,
  // User-facing roles inherit base user scopes
  learner: BASE_USER_SCOPES,
  premium: BASE_USER_SCOPES,
  creator: BASE_USER_SCOPES,
  // Administration
  admin: ADMIN_SCOPES,
  super_admin: ADMIN_SCOPES,
  // Machine-to-machine (future)
  agent: AGENT_SCOPES,
  service: ALL_SCOPES,
};

/**
 * Deterministic scope derivation from roles.
 *
 * The same set of roles always produces the same sorted, de-duplicated
 * array of scope strings.  This function is the single source of truth
 * for what a principal with a given role set is allowed to do.
 */
export function deriveScopesFromRoles(roles: string[]): string[] {
  const scopeSet = new Set<string>();
  for (const role of roles) {
    const scopes = ROLE_SCOPE_MAP[role];
    if (scopes !== undefined) {
      for (const scope of scopes) {
        scopeSet.add(scope);
      }
    }
  }
  return [...scopeSet].sort();
}

export interface ITokenService {
  generateTokenPair(user: IUser): Promise<ITokenPair>;
  verifyAccessToken(token: string): Promise<ITokenPayload>;
  verifyRefreshToken(token: string): Promise<{ userId: UserId; tokenId: string }>;
  revokeRefreshToken(tokenId: string): Promise<void>;
  revokeAllRefreshTokensForUser(userId: UserId): Promise<number>;
}

// ============================================================================
// Configuration
// ============================================================================

export interface ITokenConfig {
  accessTokenSecret: string;
  refreshTokenSecret: string;
  accessTokenExpiresIn: string;
  refreshTokenExpiresIn: string;
  issuer: string;
  audience: string;
}

export interface ITokenServiceDependencies {
  prisma: PrismaClient;
  redis: Redis;
  revokedTokenPrefix?: string;
}

// ============================================================================
// Implementation
// ============================================================================

export class JwtTokenService implements ITokenService {
  private readonly accessSecret: Uint8Array;
  private readonly refreshSecret: Uint8Array;
  private readonly revokedTokenPrefix: string;

  constructor(
    private readonly config: ITokenConfig,
    private readonly deps: ITokenServiceDependencies
  ) {
    this.accessSecret = new TextEncoder().encode(config.accessTokenSecret);
    this.refreshSecret = new TextEncoder().encode(config.refreshTokenSecret);
    this.revokedTokenPrefix = deps.revokedTokenPrefix ?? 'noema:auth:revoked:refresh';
  }

  async generateTokenPair(user: IUser): Promise<ITokenPair> {
    const now = Math.floor(Date.now() / 1000);
    const accessExpiresIn = this.parseExpiresIn(this.config.accessTokenExpiresIn);
    const refreshExpiresIn = this.parseExpiresIn(this.config.refreshTokenExpiresIn);

    // Derive scopes from user roles (deterministic)
    const scopes = deriveScopesFromRoles(user.roles);

    // Generate access token
    const accessToken = await new SignJWT({
      sub: user.id,
      roles: user.roles,
      type: 'access',
      scopes,
      scope: scopes.join(' '),
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt(now)
      .setExpirationTime(now + accessExpiresIn)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setJti(nanoid(21))
      .sign(this.accessSecret);

    // Generate refresh token
    const refreshTokenId = nanoid(21);
    const refreshToken = await new SignJWT({
      sub: user.id,
      type: 'refresh',
      jti: refreshTokenId,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt(now)
      .setExpirationTime(now + refreshExpiresIn)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .sign(this.refreshSecret);

    const refreshExpiresAt = new Date((now + refreshExpiresIn) * 1000);
    await this.deps.prisma.refreshToken.create({
      data: {
        id: refreshTokenId,
        userId: user.id,
        token: refreshToken,
        expiresAt: refreshExpiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpiresIn,
      tokenType: 'Bearer',
    };
  }

  async verifyAccessToken(token: string): Promise<ITokenPayload> {
    try {
      const { payload } = await jwtVerify(token, this.accessSecret, {
        issuer: this.config.issuer,
        audience: this.config.audience,
      });

      if ((payload as ITokenPayload).type !== 'access') {
        throw new InvalidTokenError('Invalid token type');
      }

      return payload as ITokenPayload;
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        throw error;
      }
      throw new InvalidTokenError('Invalid or expired access token');
    }
  }

  async verifyRefreshToken(token: string): Promise<{ userId: UserId; tokenId: string }> {
    try {
      const { payload } = await jwtVerify(token, this.refreshSecret, {
        issuer: this.config.issuer,
        audience: this.config.audience,
      });

      const typedPayload = payload as ITokenPayload;

      if (typedPayload.type !== 'refresh') {
        throw new InvalidTokenError('Invalid token type');
      }

      const tokenId = typedPayload.jti;
      if (tokenId === undefined || tokenId === '') {
        throw new InvalidTokenError('Missing token identifier');
      }

      await this.ensureRefreshTokenActive(tokenId, token, typedPayload.sub as UserId);

      return {
        userId: typedPayload.sub as UserId,
        tokenId,
      };
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        throw error;
      }
      throw new InvalidTokenError('Invalid or expired refresh token');
    }
  }

  async revokeRefreshToken(tokenId: string): Promise<void> {
    const tokenRow = await this.deps.prisma.refreshToken.findUnique({
      where: { id: tokenId },
    });

    if (!tokenRow) {
      return;
    }

    if (tokenRow.revokedAt === null) {
      await this.deps.prisma.refreshToken.update({
        where: { id: tokenId },
        data: { revokedAt: new Date() },
      });
    }

    await this.cacheRevokedToken(tokenId, tokenRow.expiresAt);
  }

  async revokeAllRefreshTokensForUser(userId: UserId): Promise<number> {
    const activeTokens = await this.deps.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        expiresAt: true,
      },
    });

    if (activeTokens.length === 0) {
      return 0;
    }

    await this.deps.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { revokedAt: new Date() },
    });

    await Promise.all(
      activeTokens.map((token) => this.cacheRevokedToken(token.id, token.expiresAt))
    );

    return activeTokens.length;
  }

  private async ensureRefreshTokenActive(
    tokenId: string,
    rawToken: string,
    userId: UserId
  ): Promise<void> {
    const cacheKey = this.getRevokedTokenKey(tokenId);
    const cachedRevocation = await this.deps.redis.get(cacheKey);
    if (cachedRevocation !== null) {
      throw new InvalidTokenError('Refresh token has been revoked');
    }

    const tokenRow = await this.deps.prisma.refreshToken.findUnique({
      where: { id: tokenId },
    });

    if (!tokenRow) {
      throw new InvalidTokenError('Refresh token not recognized');
    }

    if (tokenRow.userId !== userId) {
      throw new InvalidTokenError('Refresh token subject mismatch');
    }

    if (tokenRow.token !== rawToken) {
      throw new InvalidTokenError('Refresh token mismatch');
    }

    if (tokenRow.revokedAt !== null) {
      await this.cacheRevokedToken(tokenId, tokenRow.expiresAt);
      throw new InvalidTokenError('Refresh token has been revoked');
    }

    if (tokenRow.expiresAt.getTime() <= Date.now()) {
      throw new InvalidTokenError('Refresh token is expired');
    }
  }

  private getRevokedTokenKey(tokenId: string): string {
    return `${this.revokedTokenPrefix}:${tokenId}`;
  }

  private async cacheRevokedToken(tokenId: string, expiresAt: Date): Promise<void> {
    const ttlSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
    await this.deps.redis.set(this.getRevokedTokenKey(tokenId), '1', 'EX', ttlSeconds);
  }

  private parseExpiresIn(expiresIn: string): number {
    const match = /^(\d+)([smhd])$/.exec(expiresIn);
    if (!match) {
      throw new Error(`Invalid expiresIn format: ${expiresIn}`);
    }

    const [, valueStr, unit] = match;

    if (valueStr === undefined || unit === undefined) {
      throw new Error(`Invalid expiresIn format: ${expiresIn}`);
    }

    const value = parseInt(valueStr, 10);

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 60 * 60 * 24;
      default:
        throw new Error(`Invalid time unit: ${unit}`);
    }
  }
}
