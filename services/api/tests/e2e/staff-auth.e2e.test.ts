// ═══════════════════════════════════════════════════════════
// E2E TESTS — Staff Auth (Email/Password)
// ═══════════════════════════════════════════════════════════

jest.mock('../../src/infrastructure/database', () => require('../mocks/database.mock'));
jest.mock('../../src/infrastructure/redis', () => require('../mocks/redis.mock'));
jest.mock('../../src/infrastructure/kafka', () => require('../mocks/kafka.mock'));

import { buildApp } from '../helpers/app.helper';
import { db, resetDbMocks } from '../mocks/database.mock';
import { makeStaff } from '../fixtures';
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';

let app: FastifyInstance;

beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => {
  resetDbMocks();
  jest.clearAllMocks();
});

describe('Staff Auth Flow', () => {
  const email = 'admin@inistnt.in';
  const password = 'SecurePassword123';

  it('POST /staff/login — Success', async () => {
    const hash = await bcrypt.hash(password, 10);
    const staff = makeStaff({ email, passwordHash: hash, isActive: true });
    (db.staff.findUnique as jest.Mock).mockResolvedValue(staff);
    (db.staffSession.create as jest.Mock).mockResolvedValue({ id: 'sess-staff-1' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/staff/login',
      payload: { email, password },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.accessToken).toBeDefined();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('POST /staff/login — Invalid Password', async () => {
    const hash = await bcrypt.hash(password, 10);
    const staff = makeStaff({ email, passwordHash: hash, isActive: true });
    (db.staff.findUnique as jest.Mock).mockResolvedValue(staff);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/staff/login',
      payload: { email, password: 'WrongPassword' },
    });

    expect(res.statusCode).toBe(401);
  });
});
