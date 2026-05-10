const crypto = require('node:crypto');
const { parseDotEnv } = require('./shared.cjs');

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createProofTokenFactory(envFilePath) {
  const env = parseDotEnv(envFilePath);
  const secret = env.ACCESS_TOKEN_SECRET ?? env.JWT_SECRET;
  if (typeof secret !== 'string' || secret.trim().length === 0) {
    throw new Error('Missing ACCESS_TOKEN_SECRET or JWT_SECRET for closed-loop proof tokens.');
  }

  const issuer = env.JWT_ISSUER ?? 'noema.app';
  const audience = env.JWT_AUDIENCE ?? 'noema.app';
  const subject = env.CLOSED_LOOP_PROOF_SUBJECT ?? 'noema-proof-harness';
  const clientId = env.CLOSED_LOOP_PROOF_CLIENT_ID ?? 'noema-proof-harness';

  return function issueProofToken(options = {}) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const scopes = Array.isArray(options.scopes)
      ? options.scopes
      : typeof options.scope === 'string' && options.scope.trim().length > 0
        ? [options.scope]
        : [];

    const header = {
      alg: 'HS256',
      typ: 'JWT',
    };
    const payload = {
      sub: subject,
      iss: issuer,
      aud: options.audience ?? audience,
      iat: nowSeconds,
      exp: nowSeconds + (options.expiresInSeconds ?? 60 * 60),
      jti: crypto.randomUUID(),
      type: 'access',
      roles: ['internal-proof'],
      client_id: clientId,
      ...(scopes.length > 0 ? { scopes, scope: scopes.join(' ') } : {}),
      ...(typeof options.userId === 'string' && options.userId.length > 0
        ? { userId: options.userId }
        : {}),
    };

    const encodedHeader = base64urlJson(header);
    const encodedPayload = base64urlJson(payload);
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  };
}

module.exports = {
  createProofTokenFactory,
};
