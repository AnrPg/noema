/**
 * Offline Intent Token — Key Rotation Tests (session-service)
 *
 * session-service is the single authority for the offline intent token
 * lifecycle: issuance, verification, and rotation (ADR-0023).
 *
 * Covers: key ring config parsing, kid-based signing, multi-key verification,
 * rotation window behavior, legacy token fallback, and retired key rejection.
 */

import { decodeProtectedHeader, jwtVerify, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers — replicate minimal production logic for isolated unit testing
// ---------------------------------------------------------------------------

const MIN_SECRET_LENGTH = 32;

/**
 * Mirror of session-service config `parseOfflineIntentTokenKeyRing`.
 * Allows empty key ring when neither KEYS nor SECRET is set (verification
 * can be disabled via VERIFY_OFFLINE_INTENT_TOKENS=false).
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

  // Legacy single-secret fallback (optional — verification can be disabled)
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

/** Mirror of getVerificationKeys — kid-targeted lookup with fallback */
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
    .setSubject(claims['userId'] as string)
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
    .setSubject(claims['userId'] as string)
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
const ISSUER = 'noema.session';
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
// Key Ring Config Parsing
// ===========================================================================

describe('parseOfflineIntentTokenKeyRing', () => {
  it('parses multi-key ring with valid secrets', () => {
    const result = parseOfflineIntentTokenKeyRing({
      OFFLINE_INTENT_TOKEN_KEYS: `v1:${SECRET_V1},v2:${SECRET_V2}`,
      OFFLINE_INTENT_TOKEN_ACTIVE_KID: 'v1',
    });

    expect(result.activeKeyId).toBe('v1');
    expect(Object.keys(result.keys)).toEqual(['v1', 'v2']);
    expect(result.keys['v1']).toBe(SECRET_V1);
    expect(result.keys['v2']).toBe(SECRET_V2);
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

  it('falls back to legacy single-key ring using OFFLINE_INTENT_TOKEN_SECRET', () => {
    const result = parseOfflineIntentTokenKeyRing({
      OFFLINE_INTENT_TOKEN_SECRET: SECRET_V1,
      OFFLINE_INTENT_TOKEN_KEYS: undefined,
      OFFLINE_INTENT_TOKEN_ACTIVE_KID: undefined,
    });

    expect(result.activeKeyId).toBe('default');
    expect(result.keys).toEqual({ default: SECRET_V1 });
  });

  it('uses OFFLINE_INTENT_TOKEN_ACTIVE_KID with legacy secret', () => {
    const result = parseOfflineIntentTokenKeyRing({
      OFFLINE_INTENT_TOKEN_SECRET: SECRET_V1,
      OFFLINE_INTENT_TOKEN_KEYS: undefined,
      OFFLINE_INTENT_TOKEN_ACTIVE_KID: 'mykey',
    });

    expect(result.activeKeyId).toBe('mykey');
    expect(result.keys).toEqual({ mykey: SECRET_V1 });
  });

  it('rejects secret shorter than 32 characters in key ring', () => {
    expect(() =>
      parseOfflineIntentTokenKeyRing({
        OFFLINE_INTENT_TOKEN_KEYS: `v1:${SHORT_SECRET}`,
        OFFLINE_INTENT_TOKEN_ACTIVE_KID: 'v1',
      })
    ).toThrow('at least 32 characters');
  });

  it('rejects legacy secret shorter than 32 characters', () => {
    expect(() =>
      parseOfflineIntentTokenKeyRing({
        OFFLINE_INTENT_TOKEN_SECRET: SHORT_SECRET,
        OFFLINE_INTENT_TOKEN_KEYS: undefined,
        OFFLINE_INTENT_TOKEN_ACTIVE_KID: undefined,
      })
    ).toThrow('at least 32 characters');
  });

  it('rejects key ring when OFFLINE_INTENT_TOKEN_ACTIVE_KID is missing', () => {
    expect(() =>
      parseOfflineIntentTokenKeyRing({
        OFFLINE_INTENT_TOKEN_KEYS: `v1:${SECRET_V1}`,
        OFFLINE_INTENT_TOKEN_ACTIVE_KID: undefined,
      })
    ).toThrow('OFFLINE_INTENT_TOKEN_ACTIVE_KID is required');
  });

  it('rejects key ring when active kid is not in keys', () => {
    expect(() =>
      parseOfflineIntentTokenKeyRing({
        OFFLINE_INTENT_TOKEN_KEYS: `v1:${SECRET_V1}`,
        OFFLINE_INTENT_TOKEN_ACTIVE_KID: 'v2',
      })
    ).toThrow('does not exist in OFFLINE_INTENT_TOKEN_KEYS');
  });

  it('rejects malformed key ring entries (missing colon)', () => {
    expect(() =>
      parseOfflineIntentTokenKeyRing({
        OFFLINE_INTENT_TOKEN_KEYS: `v1${SECRET_V1}`,
        OFFLINE_INTENT_TOKEN_ACTIVE_KID: 'v1',
      })
    ).toThrow("Expected comma-separated 'kid:secret' pairs");
  });

  it('ignores empty OFFLINE_INTENT_TOKEN_KEYS and falls back to legacy', () => {
    const result = parseOfflineIntentTokenKeyRing({
      OFFLINE_INTENT_TOKEN_KEYS: '  ',
      OFFLINE_INTENT_TOKEN_SECRET: SECRET_V1,
      OFFLINE_INTENT_TOKEN_ACTIVE_KID: undefined,
    });

    expect(result.activeKeyId).toBe('default');
    expect(result.keys).toEqual({ default: SECRET_V1 });
  });
});

// ===========================================================================
// Token Issuance — kid in Protected Header
// ===========================================================================

describe('token issuance stamps correct kid', () => {
  it('includes kid in the JWT protected header', async () => {
    const secrets = buildSecretsMap({ v1: SECRET_V1 });
    const token = await signToken('v1', secrets.get('v1')!, TEST_CLAIMS, TOKEN_OPTIONS);

    const header = decodeProtectedHeader(token);
    expect(header.kid).toBe('v1');
    expect(header.alg).toBe('HS256');
  });

  it('signs with the active key id from the ring', async () => {
    const secrets = buildSecretsMap({ v1: SECRET_V1, v2: SECRET_V2 });
    const token = await signToken('v2', secrets.get('v2')!, TEST_CLAIMS, TOKEN_OPTIONS);

    const header = decodeProtectedHeader(token);
    expect(header.kid).toBe('v2');

    // Verify with the correct key succeeds
    const { payload } = await jwtVerify(token, secrets.get('v2')!, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    expect(payload.sub).toBe('user_test123');
  });

  it('sets sub claim to userId', async () => {
    const secrets = buildSecretsMap({ v1: SECRET_V1 });
    const token = await signToken('v1', secrets.get('v1')!, TEST_CLAIMS, TOKEN_OPTIONS);

    const { payload } = await jwtVerify(token, secrets.get('v1')!, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    expect(payload.sub).toBe(TEST_CLAIMS.userId);
  });

  it('sets correct issuer (noema.session)', async () => {
    const secrets = buildSecretsMap({ v1: SECRET_V1 });
    const token = await signToken('v1', secrets.get('v1')!, TEST_CLAIMS, TOKEN_OPTIONS);

    const { payload } = await jwtVerify(token, secrets.get('v1')!, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    expect(payload.iss).toBe('noema.session');
  });
});

// ===========================================================================
// Multi-Key Verification — kid-targeted + fallback
// ===========================================================================

describe('multi-key verification', () => {
  it('verifies token using matching kid from key ring', async () => {
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

  it('verifies token signed with old key (rotation window active)', async () => {
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

  it('verifies token signed with new key after cutover', async () => {
    const secrets = buildSecretsMap({ v1: SECRET_V1, v2: SECRET_V2 });
    const token = await signToken('v2', secrets.get('v2')!, TEST_CLAIMS, TOKEN_OPTIONS);

    const header = decodeProtectedHeader(token);
    const candidates = getVerificationKeys(header.kid, secrets);
    expect(candidates).toHaveLength(1);

    const { payload } = await jwtVerify(token, candidates[0]!, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    expect((payload as Record<string, unknown>)['userId']).toBe('user_test123');
  });

  it('returns empty candidates for unknown kid (retired key)', async () => {
    const secrets = buildSecretsMap({ v2: SECRET_V2 });
    const token = await signToken(
      'v1',
      buildSecretsMap({ v1: SECRET_V1 }).get('v1')!,
      TEST_CLAIMS,
      TOKEN_OPTIONS
    );

    const header = decodeProtectedHeader(token);
    const candidates = getVerificationKeys(header.kid, secrets);
    expect(candidates).toHaveLength(0);
  });

  it('fails verification when token kid matches no key in ring', async () => {
    const secrets = buildSecretsMap({ v2: SECRET_V2 });
    const token = await signToken(
      'v1',
      buildSecretsMap({ v1: SECRET_V1 }).get('v1')!,
      TEST_CLAIMS,
      TOKEN_OPTIONS
    );

    const header = decodeProtectedHeader(token);
    const candidates = getVerificationKeys(header.kid, secrets);

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

  it('fails verification when token was signed with wrong secret for same kid', async () => {
    const wrongSecret = buildSecretsMap({ v1: SECRET_V2 });
    const realSecret = buildSecretsMap({ v1: SECRET_V1 });
    const token = await signToken('v1', realSecret.get('v1')!, TEST_CLAIMS, TOKEN_OPTIONS);

    const header = decodeProtectedHeader(token);
    const candidates = getVerificationKeys(header.kid, wrongSecret);
    expect(candidates).toHaveLength(1);

    await expect(
      jwtVerify(token, candidates[0]!, { issuer: ISSUER, audience: AUDIENCE })
    ).rejects.toThrow();
  });

  it('empty key ring causes all verification to fail', async () => {
    const emptyRing = buildSecretsMap({});
    const token = await signToken(
      'v1',
      new TextEncoder().encode(SECRET_V1),
      TEST_CLAIMS,
      TOKEN_OPTIONS
    );

    const candidates = getVerificationKeys('v1', emptyRing);
    expect(candidates).toHaveLength(0);
  });
});

// ===========================================================================
// Legacy Token Fallback (no kid in header)
// ===========================================================================

describe('legacy token fallback', () => {
  it('falls back to trying all keys when token has no kid', async () => {
    const secret = buildSecretsMap({ default: SECRET_V1 });
    const token = await signLegacyToken(secret.get('default')!, TEST_CLAIMS, TOKEN_OPTIONS);

    const header = decodeProtectedHeader(token);
    expect(header.kid).toBeUndefined();

    const candidates = getVerificationKeys(header.kid, secret);
    expect(candidates).toHaveLength(1);

    const { payload } = await jwtVerify(token, candidates[0]!, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    expect((payload as Record<string, unknown>)['userId']).toBe('user_test123');
  });

  it('falls back to all keys and succeeds with matching secret', async () => {
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

  it('fails fallback when no key matches legacy token', async () => {
    const secrets = buildSecretsMap({ v2: SECRET_V2, v3: SECRET_V3 });
    const token = await signLegacyToken(
      new TextEncoder().encode(SECRET_V1),
      TEST_CLAIMS,
      TOKEN_OPTIONS
    );

    const header = decodeProtectedHeader(token);
    const candidates = getVerificationKeys(header.kid, secrets);

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
// Full Rotation Lifecycle (3-phase simulation)
// ===========================================================================

describe('full 3-phase rotation lifecycle', () => {
  const verifyWithCandidates = async (
    token: string,
    secretsMap: Map<string, Uint8Array>
  ): Promise<boolean> => {
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

  it('simulates introduce → cutover → retire', async () => {
    // ── Pre-rotation: only v1 ──
    const preRotation = buildSecretsMap({ v1: SECRET_V1 });
    const tokenPreRotation = await signToken(
      'v1',
      preRotation.get('v1')!,
      TEST_CLAIMS,
      TOKEN_OPTIONS
    );
    expect(await verifyWithCandidates(tokenPreRotation, preRotation)).toBe(true);

    // ── Phase 1: introduce v2 alongside v1 (active still v1) ──
    const phase1 = buildSecretsMap({ v1: SECRET_V1, v2: SECRET_V2 });
    const tokenPhase1 = await signToken('v1', phase1.get('v1')!, TEST_CLAIMS, TOKEN_OPTIONS);
    expect(await verifyWithCandidates(tokenPreRotation, phase1)).toBe(true);
    expect(await verifyWithCandidates(tokenPhase1, phase1)).toBe(true);

    // ── Phase 2: cutover signing to v2 ──
    const tokenPhase2 = await signToken('v2', phase1.get('v2')!, TEST_CLAIMS, TOKEN_OPTIONS);
    expect(await verifyWithCandidates(tokenPreRotation, phase1)).toBe(true);
    expect(await verifyWithCandidates(tokenPhase1, phase1)).toBe(true);
    expect(await verifyWithCandidates(tokenPhase2, phase1)).toBe(true);

    // ── Phase 3: retire v1 ──
    const phase3 = buildSecretsMap({ v2: SECRET_V2 });
    expect(await verifyWithCandidates(tokenPhase2, phase3)).toBe(true);
    expect(await verifyWithCandidates(tokenPreRotation, phase3)).toBe(false);
    expect(await verifyWithCandidates(tokenPhase1, phase3)).toBe(false);
  });

  it('supports 3-key window during overlapping rotations', async () => {
    const threeKeyRing = buildSecretsMap({
      v1: SECRET_V1,
      v2: SECRET_V2,
      v3: SECRET_V3,
    });

    const tokenV1 = await signToken('v1', threeKeyRing.get('v1')!, TEST_CLAIMS, TOKEN_OPTIONS);
    const tokenV2 = await signToken('v2', threeKeyRing.get('v2')!, TEST_CLAIMS, TOKEN_OPTIONS);
    const tokenV3 = await signToken('v3', threeKeyRing.get('v3')!, TEST_CLAIMS, TOKEN_OPTIONS);

    expect(await verifyWithCandidates(tokenV1, threeKeyRing)).toBe(true);
    expect(await verifyWithCandidates(tokenV2, threeKeyRing)).toBe(true);
    expect(await verifyWithCandidates(tokenV3, threeKeyRing)).toBe(true);
  });

  it('rejects all tokens after full key ring replacement', async () => {
    const oldRing = buildSecretsMap({ v1: SECRET_V1 });
    const newRing = buildSecretsMap({ v3: SECRET_V3 });
    const tokenOld = await signToken('v1', oldRing.get('v1')!, TEST_CLAIMS, TOKEN_OPTIONS);

    expect(await verifyWithCandidates(tokenOld, oldRing)).toBe(true);
    expect(await verifyWithCandidates(tokenOld, newRing)).toBe(false);
  });
});
