/**
 * @noema/knowledge-graph-service - JWT Token Verifier
 *
 * Verify-only token service. Tokens are issued by user-service;
 * downstream services only need to verify access tokens.
 *
 * Ported from the content-service's identical pattern.
 */

import { jwtVerify, type JWTPayload } from 'jose';
import { UnauthorizedError } from '../../domain/knowledge-graph-service/errors/base.errors.js';

// ============================================================================
// Types
// ============================================================================

export interface ITokenPayload extends JWTPayload {
  sub: string;
  roles: string[];
  scopes?: string[];
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
        throw new UnauthorizedError('Invalid token type');
      }

      return payload as ITokenPayload;
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      throw new UnauthorizedError('Invalid or expired access token');
    }
  }
}
