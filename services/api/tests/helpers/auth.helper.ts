// ═══════════════════════════════════════════════════════════
// AUTH HELPER — Generate real JWTs for tests
// Uses the same signing logic as auth.service.ts
// ═══════════════════════════════════════════════════════════

import crypto from 'crypto';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test_access_secret_32_chars_minimum_x';

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
  expirySeconds = 900,
): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64url(
    JSON.stringify({ ...payload, iat: now, exp: now + expirySeconds }),
  );
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

/** Generate a valid access token for a regular user */
export function generateUserToken(userId: string, mobile = '9876543210'): string {
  return signJwt({ sub: userId, userType: 'user', mobile }, ACCESS_SECRET);
}

/** Generate a valid access token for a worker */
export function generateWorkerToken(workerId: string, mobile = '9876543211'): string {
  return signJwt({ sub: workerId, userType: 'worker', mobile }, ACCESS_SECRET);
}

/** Generate a valid access token for a staff member */
export function generateStaffToken(
  staffId: string,
  role: string = 'ADMIN',
): string {
  return signJwt({ sub: staffId, userType: 'staff', role }, ACCESS_SECRET);
}

/** Generate a token that is already expired */
export function generateExpiredToken(userId: string): string {
  return signJwt({ sub: userId, userType: 'user' }, ACCESS_SECRET, -1);
}

/** Generate a token signed with a wrong secret */
export function generateTamperedToken(userId: string): string {
  return signJwt({ sub: userId, userType: 'user' }, 'wrong_secret_completely_different');
}

/** Auth header string for Bearer tokens */
export function bearerHeader(token: string) {
  return { authorization: `Bearer ${token}` };
}
