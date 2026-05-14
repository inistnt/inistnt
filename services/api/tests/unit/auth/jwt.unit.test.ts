// ═══════════════════════════════════════════════════════════
// UNIT TESTS — JWT sign / verify logic
// Tests the internal base64url + HMAC-SHA256 implementation
// ═══════════════════════════════════════════════════════════

import crypto from 'crypto';

const SECRET = 'test_access_secret_32_chars_minimum_x';

// Mirror the functions from auth.service.ts to test them in isolation
function base64url(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function signJwt(
  payload: Record<string, unknown>,
  secret: string,
  expirySeconds: number,
): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64url(JSON.stringify({ ...payload, iat: now, exp: now + expirySeconds }));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyJwt(token: string, secret: string) {
  try {
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) return null;

    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${body}`)
      .digest('base64url');

    if (expectedSig !== signature) return null;

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────

describe('JWT — sign & verify', () => {
  describe('signJwt', () => {
    it('produces a 3-segment token', () => {
      const token = signJwt({ sub: 'user-1', userType: 'user' }, SECRET, 900);
      expect(token.split('.')).toHaveLength(3);
    });

    it('encodes the payload sub correctly', () => {
      const token = signJwt({ sub: 'user-abc', userType: 'user' }, SECRET, 900);
      const [, body] = token.split('.');
      const decoded = JSON.parse(Buffer.from(body, 'base64url').toString());
      expect(decoded.sub).toBe('user-abc');
      expect(decoded.userType).toBe('user');
    });

    it('sets iat and exp fields', () => {
      const before = Math.floor(Date.now() / 1000);
      const token = signJwt({ sub: 'u1' }, SECRET, 900);
      const after = Math.floor(Date.now() / 1000);
      const [, body] = token.split('.');
      const decoded = JSON.parse(Buffer.from(body, 'base64url').toString());
      expect(decoded.iat).toBeGreaterThanOrEqual(before);
      expect(decoded.iat).toBeLessThanOrEqual(after);
      expect(decoded.exp).toBeGreaterThanOrEqual(before + 900);
    });

    it('uses URL-safe base64 (no +, /, =)', () => {
      for (let i = 0; i < 20; i++) {
        const token = signJwt({ sub: `u${i}`, data: 'test+data/here==' }, SECRET, 900);
        expect(token).not.toMatch(/[+/=]/);
      }
    });
  });

  describe('verifyJwt', () => {
    it('returns the payload for a valid token', () => {
      const token = signJwt({ sub: 'user-1', userType: 'user' }, SECRET, 900);
      const payload = verifyJwt(token, SECRET);
      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe('user-1');
      expect(payload?.userType).toBe('user');
    });

    it('returns null for an expired token', () => {
      const token = signJwt({ sub: 'user-1' }, SECRET, -1); // expired 1 second ago
      const payload = verifyJwt(token, SECRET);
      expect(payload).toBeNull();
    });

    it('returns null when signature is tampered', () => {
      const token = signJwt({ sub: 'user-1' }, SECRET, 900);
      const [header, body] = token.split('.');
      const tamperedToken = `${header}.${body}.tampered_signature_xxxx`;
      expect(verifyJwt(tamperedToken, SECRET)).toBeNull();
    });

    it('returns null when signed with a different secret', () => {
      const token = signJwt({ sub: 'user-1' }, 'different_secret_here_12345678', 900);
      expect(verifyJwt(token, SECRET)).toBeNull();
    });

    it('returns null when token has fewer than 3 segments', () => {
      expect(verifyJwt('onlyone', SECRET)).toBeNull();
      expect(verifyJwt('two.parts', SECRET)).toBeNull();
      expect(verifyJwt('', SECRET)).toBeNull();
    });

    it('returns null when body is not valid JSON', () => {
      const [header, , sig] = signJwt({ sub: 'u1' }, SECRET, 900).split('.');
      const badBody = Buffer.from('not-json').toString('base64url');
      expect(verifyJwt(`${header}.${badBody}.${sig}`, SECRET)).toBeNull();
    });

    it('returns null when payload is missing', () => {
      expect(verifyJwt('..', SECRET)).toBeNull();
    });
  });
});
