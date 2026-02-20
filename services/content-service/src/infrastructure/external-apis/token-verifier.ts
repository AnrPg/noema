/**
 * @noema/content-service - JWT Token Verifier
 *
 * Verify-only token service. Tokens are issued by user-service;
 * downstream services only need to verify access tokens.
 */

import { jwtVerify, type JWTPayload } from 'jose';
import { InvalidTokenError } from '../../domain/content-service/errors/index.js';

// ============================================================================
// Types
// ============================================================================

export interface ITokenPayload extends JWTPayload {
  sub: string;
  roles: string[];
  type: 'access' | 'refresh';
}

export interface ITokenVerifier {
  verifyAccessToken(token: string): Promise<ITokenPayload>;
}

// ============================================================================
// Configuration
// ============================================================================

export interface ITokenVerifierConfig {
  accessTokenSecret: string;
  issuer: string;
  audience: string;
}

// ============================================================================
// Implementation
// ============================================================================

export class JwtTokenVerifier implements ITokenVerifier {
  private readonly accessSecret: Uint8Array;

  constructor(private readonly config: ITokenVerifierConfig) {
    this.accessSecret = new TextEncoder().encode(config.accessTokenSecret);
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
}
