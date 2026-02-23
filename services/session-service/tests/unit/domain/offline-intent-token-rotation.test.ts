/**
 * Offline Intent Token Verification — Key Rotation Tests (session-service)
 *
 * session-service only verifies tokens (never issues them). These tests cover
 * the verify-side key ring behavior: kid-targeted lookup, fallback for legacy
 * tokens, rotation window acceptance, and retired key rejection.
 */

import { decodeProtectedHeader, jwtVerify, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers — replicate minimal production logic for isolated unit testing
// ---------------------------------------------------------------------------

const MIN_SECRET_LENGTH = 32;

/**
 * Mirror of session-service `parseOfflineIntentTokenKeyRing`.
 * Unlike scheduler-service, session-service allows an empty key ring when
 * neither `OFFLINE_INTENT_TOKEN_KEYS` nor `OFFLINE_INTENT_TOKEN_SECRET` is set
 * (verification can be disabled via VERIFY_OFFLINE_INTENT_TOKENS=false).
 */
function parseOfflineIntentTokenKeyRing(env: Record<string, string | undefined>): {
  activeKeyId: string;
  keys: Record<string, string>;
} {
  const keyRingRaw = env['OFFLINE_INTENT_TOKEN_KEYS'];
  const activeKeyIdRaw = env['OFFLINE_INTENT_TOKEN_ACTIVE_KID'];

  if (keyRingRaw !== undefined && keyRingRaw.trim() !== '') {
    const entries = keyRingRaw
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    const keys: Record<string, string> = {};

    for (const entry of entries) {
      const separatorIndex = entry.indexOf(':');
      if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
        throw new Error(
          "Invalid OFFLINE_INTENT_TOKEN_KEYS format. Expected comma-separated 'kid:secret' pairs"
        );
      }

      const keyId = entry.slice(0, separatorIndex).trim();
      const secret = entry.slice(separatorIndex + 1).trim();
      if (keyId.length === 0 || secret.length === 0) {
        throw new Error('OFFLINE_INTENT_TOKEN_KEYS contains empty key id or secret');
      }

      if (secret.length < MIN_SECRET_LENGTH) {
        throw new Error(
          `OFFLINE_INTENT_TOKEN key '${keyId}' must be at least ${String(MIN_SECRET_LENGTH)} characters`
        );
      }

      keys[keyId] = secret;
    }

    const activeKeyId = (activeKeyIdRaw ?? '').trim();
    if (activeKeyId.length === 0) {
      throw new Error(
        'OFFLINE_INTENT_TOKEN_ACTIVE_KID is required when OFFLINE_INTENT_TOKEN_KEYS is set'
      );
    }

    if (!(activeKeyId in keys)) {
      throw new Error(
        `OFFLINE_INTENT_TOKEN_ACTIVE_KID '${activeKeyId}' does not exist in OFFLINE_INTENT_TOKEN_KEYS`
      );
    }

    return { activeKeyId, keys };
  }

  // session-service: legacy secret is optional (verification can be disabled)
  const legacySecret = (env['OFFLINE_INTENT_TOKEN_SECRET'] ?? '').trim();
  const activeKeyId = (activeKeyIdRaw ?? 'default').trim();

  if (legacySecret.length === 0) {
    return { activeKeyId, keys: {} };
  }

  if (legacySecret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `OFFLINE_INTENT_TOKEN key '${activeKeyId}' must be at least ${String(MIN_SECRET_LENGTH)} characters`
    );
  }

  return { activeKeyId, keys: { [activeKeyId]: legacySecret } };
}

/** Mirror of getOfflineIntentVerificationKeys */
function getVerificationKeys(tokenKid: unknown, secretsMap: Map<string, Uint8Array>): Uint8Array[] {
  if (typeof tokenKid === 'string' && tokenKid.length > 0) {
    const selected = secretsMap.get(tokenKid);
    if (selected === undefined) {
      return [];
    }
    return [selected];
  }
  return [...secretsMap.values()];
}

function buildSecretsMap(keys: Record<string, string>): Map<string, Uint8Array> {
  return new Map(
    Object.entries(keys).map(([keyId, secret]) => [keyId, new TextEncoder().encode(secret)])
  );
}

async function signToken(
  kid: string,
  secret: Uint8Array,
  claims: Record<string, unknown>,
  options: { issuer: string; audience: string; expiresInSeconds: number }
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT', kid })
    .setIssuedAt(now)
    .setExpirationTime(now + options.expiresInSeconds)
    .setIssuer(options.issuer)
    .setAudience(options.audience)
    .setJti(crypto.randomUUID())
    .sign(secret);
}

async function signLegacyToken(
  secret: Uint8Array,
  claims: Record<string, unknown>,
  options: { issuer: string; audience: string; expiresInSeconds: number }
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + options.expiresInSeconds)
    .setIssuer(options.issuer)
    .setAudience(options.audience)
    .setJti(crypto.randomUUID())
    .sign(secret);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SECRET_V1 = 'abcdefghijklmnopqrstuvwxyz123456'; // 32 chars
const SECRET_V2 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ789012'; // 32 chars
const SECRET_V3 = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'; // 32 chars
const SHORT_SECRET = 'too-short';
const ISSUER = 'noema.scheduler';
const AUDIENCE = 'noema.mobile';
const TOKEN_OPTIONS = { issuer: ISSUER, audience: AUDIENCE, expiresInSeconds: 3600 };

const TEST_CLAIMS = {
  tokenVersion: 'v1',
  userId: 'user_test123',
  sessionBlueprint: { checkpointSignals: ['confidence_drift'] },
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  nonce: crypto.randomUUID(),
};

// ===========================================================================
// Key Ring Config Parsing (session-service specific)
// ===========================================================================

describe('parseOfflineIntentTokenKeyRing (session-service)', () => {
  it('parses multi-key ring with valid secrets', () => {
    const result = parseOfflineIntentTokenKeyRing({
      OFFLINE_INTENT_TOKEN_KEYS: `v1:${SECRET_V1},v2:${SECRET_V2}`,
      OFFLINE_INTENT_TOKEN_ACTIVE_KID: 'v1',
    });

    expect(result.activeKeyId).toBe('v1');
    expect(Object.keys(result.keys)).toEqual(['v1', 'v2']);
  });

  it('allows empty key ring when no secrets configured (verification disabled)', () => {
    const result = parseOfflineIntentTokenKeyRing({
      OFFLINE_INTENT_TOKEN_KEYS: undefined,
      OFFLINE_INTENT_TOKEN_SECRET: undefined,
      OFFLINE_INTENT_TOKEN_ACTIVE_KID: undefined,
    });

    expect(result.activeKeyId).toBe('default');
    expect(result.keys).toEqual({});
  });

  it('falls back to legacy single-key ring', () => {
    const result = parseOfflineIntentTokenKeyRing({
      OFFLINE_INTENT_TOKEN_KEYS: undefined,
      OFFLINE_INTENT_TOKEN_SECRET: SECRET_V1,
      OFFLINE_INTENT_TOKEN_ACTIVE_KID: undefined,
    });

    expect(result.activeKeyId).toBe('default');
    expect(result.keys).toEqual({ default: SECRET_V1 });
  });

  it('rejects short secret in key ring', () => {
    expect(() =>
      parseOfflineIntentTokenKeyRing({
        OFFLINE_INTENT_TOKEN_KEYS: `v1:${SHORT_SECRET}`,
        OFFLINE_INTENT_TOKEN_ACTIVE_KID: 'v1',
      })
    ).toThrow('at least 32 characters');
  });

  it('rejects short legacy secret', () => {
    expect(() =>
      parseOfflineIntentTokenKeyRing({
        OFFLINE_INTENT_TOKEN_KEYS: undefined,
        OFFLINE_INTENT_TOKEN_SECRET: SHORT_SECRET,
        OFFLINE_INTENT_TOKEN_ACTIVE_KID: undefined,
      })
    ).toThrow('at least 32 characters');
  });

  it('rejects key ring when active kid not in keys', () => {
    expect(() =>
      parseOfflineIntentTokenKeyRing({
        OFFLINE_INTENT_TOKEN_KEYS: `v1:${SECRET_V1}`,
        OFFLINE_INTENT_TOKEN_ACTIVE_KID: 'v2',
      })
    ).toThrow('does not exist in OFFLINE_INTENT_TOKEN_KEYS');
  });

  it('rejects missing active kid when key ring is set', () => {
    expect(() =>
      parseOfflineIntentTokenKeyRing({
        OFFLINE_INTENT_TOKEN_KEYS: `v1:${SECRET_V1}`,
        OFFLINE_INTENT_TOKEN_ACTIVE_KID: undefined,
      })
    ).toThrow('OFFLINE_INTENT_TOKEN_ACTIVE_KID is required');
  });
});

// ===========================================================================
// Verification — kid-targeted + fallback
// ===========================================================================

describe('verification with kid-targeted key lookup', () => {
  it('verifies token by matching kid', async () => {
    const secrets = buildSecretsMap({ v1: SECRET_V1, v2: SECRET_V2 });
    const token = await signToken('v1', secrets.get('v1')!, TEST_CLAIMS, TOKEN_OPTIONS);

    const header = decodeProtectedHeader(token);
    const candidates = getVerificationKeys(header.kid, secrets);
    expect(candidates).toHaveLength(1);

    const { payload } = await jwtVerify(token, candidates[0]!, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    expect((payload as Record<string, unknown>)['userId']).toBe('user_test123');
  });

  it('verifies old-kid token during rotation window', async () => {
    const secrets = buildSecretsMap({ v1: SECRET_V1, v2: SECRET_V2 });
    const token = await signToken('v1', secrets.get('v1')!, TEST_CLAIMS, TOKEN_OPTIONS);

    const header = decodeProtectedHeader(token);
    const candidates = getVerificationKeys(header.kid, secrets);
    expect(candidates).toHaveLength(1);

    await expect(
      jwtVerify(token, candidates[0]!, { issuer: ISSUER, audience: AUDIENCE })
    ).resolves.toBeDefined();
  });

  it('returns empty candidates for unknown kid (retired key)', async () => {
    const secrets = buildSecretsMap({ v2: SECRET_V2 });
    const v1Secret = new TextEncoder().encode(SECRET_V1);
    const token = await signToken('v1', v1Secret, TEST_CLAIMS, TOKEN_OPTIONS);

    const header = decodeProtectedHeader(token);
    const candidates = getVerificationKeys(header.kid, secrets);
    expect(candidates).toHaveLength(0);
  });
});

// ===========================================================================
// Legacy Token Fallback
// ===========================================================================

describe('legacy token fallback (no kid)', () => {
  it('tries all keys when token has no kid', async () => {
    const secrets = buildSecretsMap({ v1: SECRET_V1, v2: SECRET_V2 });
    const token = await signLegacyToken(secrets.get('v1')!, TEST_CLAIMS, TOKEN_OPTIONS);

    const header = decodeProtectedHeader(token);
    expect(header.kid).toBeUndefined();

    const candidates = getVerificationKeys(header.kid, secrets);
    expect(candidates).toHaveLength(2);

    let verified = false;
    for (const key of candidates) {
      try {
        await jwtVerify(token, key, { issuer: ISSUER, audience: AUDIENCE });
        verified = true;
        break;
      } catch {
        // try next
      }
    }
    expect(verified).toBe(true);
  });

  it('fails when no key in ring matches legacy token', async () => {
    const secrets = buildSecretsMap({ v2: SECRET_V2 });
    const token = await signLegacyToken(
      new TextEncoder().encode(SECRET_V1),
      TEST_CLAIMS,
      TOKEN_OPTIONS
    );

    const candidates = getVerificationKeys(undefined, secrets);
    let verified = false;
    for (const key of candidates) {
      try {
        await jwtVerify(token, key, { issuer: ISSUER, audience: AUDIENCE });
        verified = true;
        break;
      } catch {
        // expected
      }
    }
    expect(verified).toBe(false);
  });
});

// ===========================================================================
// Full Rotation Lifecycle (verification-only perspective)
// ===========================================================================

describe('rotation lifecycle (verify-side)', () => {
  const verify = async (token: string, secretsMap: Map<string, Uint8Array>): Promise<boolean> => {
    try {
      const header = decodeProtectedHeader(token);
      const candidates = getVerificationKeys(header.kid, secretsMap);
      for (const key of candidates) {
        try {
          await jwtVerify(token, key, { issuer: ISSUER, audience: AUDIENCE });
          return true;
        } catch {
          // try next
        }
      }
      return false;
    } catch {
      return false;
    }
  };

  it('accepts both old and new tokens during rotation window, rejects after retire', async () => {
    // Phase 1: both v1 and v2 in ring
    const phase1Ring = buildSecretsMap({ v1: SECRET_V1, v2: SECRET_V2 });
    const oldToken = await signToken('v1', phase1Ring.get('v1')!, TEST_CLAIMS, TOKEN_OPTIONS);
    const newToken = await signToken('v2', phase1Ring.get('v2')!, TEST_CLAIMS, TOKEN_OPTIONS);

    expect(await verify(oldToken, phase1Ring)).toBe(true);
    expect(await verify(newToken, phase1Ring)).toBe(true);

    // Phase 3: only v2 remains
    const phase3Ring = buildSecretsMap({ v2: SECRET_V2 });
    expect(await verify(newToken, phase3Ring)).toBe(true);
    expect(await verify(oldToken, phase3Ring)).toBe(false);
  });

  it('empty key ring causes all verification to fail', async () => {
    const emptyRing = buildSecretsMap({});
    const token = await signToken(
      'v1',
      new TextEncoder().encode(SECRET_V1),
      TEST_CLAIMS,
      TOKEN_OPTIONS
    );

    // getVerificationKeys with unknown kid on empty ring → empty
    const candidates = getVerificationKeys('v1', emptyRing);
    expect(candidates).toHaveLength(0);
    expect(await verify(token, emptyRing)).toBe(false);
  });
});
