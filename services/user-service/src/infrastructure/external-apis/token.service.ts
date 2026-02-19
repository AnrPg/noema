/**
 * @noema/user-service - JWT Token Service
 *
 * Token management using jose library.
 */

import type { UserId } from '@noema/types';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { nanoid } from 'nanoid';
import { InvalidTokenError } from '../../domain/user-service/errors/index.js';
import type { ITokenPair, IUser } from '../../types/user.types.js';

// ============================================================================
// Types
// ============================================================================

export interface ITokenPayload extends JWTPayload {
  sub: string;
  roles: string[];
  type: 'access' | 'refresh';
}

export interface ITokenService {
  generateTokenPair(user: IUser): Promise<ITokenPair>;
  verifyAccessToken(token: string): Promise<ITokenPayload>;
  verifyRefreshToken(token: string): Promise<{ userId: UserId; tokenId: string }>;
  revokeRefreshToken(tokenId: string): Promise<void>;
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

// ============================================================================
// Implementation
// ============================================================================

export class JwtTokenService implements ITokenService {
  private readonly accessSecret: Uint8Array;
  private readonly refreshSecret: Uint8Array;

  constructor(private readonly config: ITokenConfig) {
    this.accessSecret = new TextEncoder().encode(config.accessTokenSecret);
    this.refreshSecret = new TextEncoder().encode(config.refreshTokenSecret);
  }

  async generateTokenPair(user: IUser): Promise<ITokenPair> {
    const now = Math.floor(Date.now() / 1000);
    const accessExpiresIn = this.parseExpiresIn(this.config.accessTokenExpiresIn);
    const refreshExpiresIn = this.parseExpiresIn(this.config.refreshTokenExpiresIn);

    // Generate access token
    const accessToken = await new SignJWT({
      sub: user.id,
      roles: user.roles,
      type: 'access',
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

      return {
        userId: typedPayload.sub as UserId,
        tokenId: typedPayload.jti as string,
      };
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        throw error;
      }
      throw new InvalidTokenError('Invalid or expired refresh token');
    }
  }

  async revokeRefreshToken(_tokenId: string): Promise<void> {
    // TODO: Store revoked tokens in Redis or database
    // For now, tokens are not revokable
  }

  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid expiresIn format: ${expiresIn}`);
    }

    const value = parseInt(match[1]!, 10);
    const unit = match[2]!;

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
