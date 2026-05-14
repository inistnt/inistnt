// ═══════════════════════════════════════════════════════════
// E2E TESTS — Auth (Customer & Worker)
// ═══════════════════════════════════════════════════════════

jest.mock('../../src/infrastructure/database', () => require('../mocks/database.mock'));
jest.mock('../../src/infrastructure/redis', () => require('../mocks/redis.mock'));
jest.mock('../../src/infrastructure/kafka', () => require('../mocks/kafka.mock'));

import { buildApp } from '../helpers/app.helper';
import { db, resetDbMocks } from '../mocks/database.mock';
import { flushTestRedis, redis } from '../mocks/redis.mock';
import { mockKafka } from '../mocks/kafka.mock';
import { generateUserToken, bearerHeader } from '../helpers/auth.helper';
import { makeUser, makeWorker, makeOtpRecord, makeUserSession } from '../fixtures';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => {
  resetDbMocks();
  await flushTestRedis();
  mockKafka.clear();
});

describe('Customer/Worker Auth Flow', () => {
  const mobile = '9876543210';

  it('POST /send-otp — Success', async () => {
    (db.otpStore.create as jest.Mock).mockResolvedValue(makeOtpRecord(mobile));
    
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/send-otp',
      payload: { mobile },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(db.otpStore.create).toHaveBeenCalled();
  });

  it('POST /verify-otp — Success (New User)', async () => {
    (db.otpStore.findFirst as jest.Mock).mockResolvedValue(makeOtpRecord(mobile, { otp: '123456' }));
    (db.user.findUnique as jest.Mock).mockResolvedValue(null);
    (db.user.create as jest.Mock).mockResolvedValue(makeUser({ mobile }));
    (db.userSession.create as jest.Mock).mockResolvedValue({ id: 'sess-1' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-otp',
      payload: { mobile, otp: '123456', userType: 'user' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.isNewUser).toBe(true);
    expect(body.data.accessToken).toBeDefined();
  });

  it('POST /refresh — Success', async () => {
    const session = makeUserSession('user-1');
    (db.userSession.findUnique as jest.Mock).mockResolvedValue(session);
    (db.userSession.create as jest.Mock).mockResolvedValue({ id: 'sess-2' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: session.refreshToken },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.accessToken).toBeDefined();
  });

  it('GET /me — Success', async () => {
    const userId = 'user-123';
    const token = generateUserToken(userId);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: bearerHeader(token),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(userId);
  });
});
