// ═══════════════════════════════════════════════════════════
// UNIT TESTS — tokenService
// ═══════════════════════════════════════════════════════════

jest.mock('../../../src/infrastructure/database', () => require('../../mocks/database.mock'));
jest.mock('../../../src/infrastructure/redis', () => require('../../mocks/redis.mock'));
jest.mock('../../../src/infrastructure/kafka', () => require('../../mocks/kafka.mock'));

import { tokenService } from '../../../src/modules/auth/auth.service';

describe('tokenService.generatePair', () => {
  it('returns an accessToken and a refreshToken', () => {
    const pair = tokenService.generatePair('user-1', 'user');
    expect(pair).toHaveProperty('accessToken');
    expect(pair).toHaveProperty('refreshToken');
  });

  it('accessToken has 3 JWT segments', () => {
    const { accessToken } = tokenService.generatePair('user-1', 'user');
    expect(accessToken.split('.')).toHaveLength(3);
  });

  it('refreshToken is a 128-char hex string (64 bytes)', () => {
    const { refreshToken } = tokenService.generatePair('user-1', 'user');
    expect(refreshToken).toMatch(/^[0-9a-f]{128}$/);
  });

  it('embeds extra payload fields in the access token', () => {
    const { accessToken } = tokenService.generatePair('user-1', 'user', {
      mobile: '9876543210',
      role: 'MANAGER',
    });
    const [, body] = accessToken.split('.');
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString());
    expect(decoded.mobile).toBe('9876543210');
    expect(decoded.role).toBe('MANAGER');
  });

  it('generates unique refresh tokens on each call', () => {
    const pair1 = tokenService.generatePair('u1', 'user');
    const pair2 = tokenService.generatePair('u1', 'user');
    expect(pair1.refreshToken).not.toBe(pair2.refreshToken);
  });
});

describe('tokenService.verifyAccess', () => {
  it('returns payload for a freshly generated token', () => {
    const { accessToken } = tokenService.generatePair('user-42', 'worker', { mobile: '9000000000' });
    const payload = tokenService.verifyAccess(accessToken);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('user-42');
    expect(payload?.userType).toBe('worker');
    expect(payload?.mobile).toBe('9000000000');
  });

  it('returns null for a garbage string', () => {
    expect(tokenService.verifyAccess('not.a.jwt')).toBeNull();
    expect(tokenService.verifyAccess('')).toBeNull();
    expect(tokenService.verifyAccess('abc')).toBeNull();
  });

  it('returns null for a token signed with a wrong secret', () => {
    // Craft a token signed with wrong key
    const crypto = require('crypto');
    function base64url(str: string) {
      return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const now = Math.floor(Date.now() / 1000);
    const body = base64url(JSON.stringify({ sub: 'hacker', iat: now, exp: now + 900 }));
    const sig = crypto.createHmac('sha256', 'wrong_secret').update(`${header}.${body}`).digest('base64url');
    expect(tokenService.verifyAccess(`${header}.${body}.${sig}`)).toBeNull();
  });
});

describe('tokenService.refreshExpiryDate', () => {
  it('returns a date in the future', () => {
    const date = tokenService.refreshExpiryDate();
    expect(date.getTime()).toBeGreaterThan(Date.now());
  });

  it('is approximately 30 days from now', () => {
    const date = tokenService.refreshExpiryDate();
    const diffMs = date.getTime() - Date.now();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(30, 0);
  });
});
