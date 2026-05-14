// ═══════════════════════════════════════════════════════════
// E2E TESTS — Workers
// ═══════════════════════════════════════════════════════════

jest.mock('../../src/infrastructure/database', () => require('../mocks/database.mock'));
jest.mock('../../src/infrastructure/redis', () => require('../mocks/redis.mock'));
jest.mock('../../src/infrastructure/kafka', () => require('../mocks/kafka.mock'));

import { buildApp } from '../helpers/app.helper';
import { db, resetDbMocks } from '../mocks/database.mock';
import { generateWorkerToken, bearerHeader } from '../helpers/auth.helper';
import { makeWorker } from '../fixtures';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => {
  resetDbMocks();
  jest.clearAllMocks();
});

describe('Worker E2E Flow', () => {
  const workerId = 'worker-123';
  const token = generateWorkerToken(workerId);

  it('GET /api/v1/workers/me — Success', async () => {
    (db.worker.findUnique as jest.Mock).mockResolvedValue(makeWorker({ id: workerId }));

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/workers/me',
      headers: bearerHeader(token),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(workerId);
  });

  it('PATCH /api/v1/workers/me/status — Success', async () => {
    (db.worker.update as jest.Mock).mockResolvedValue(makeWorker({ id: workerId, isOnline: true }));

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/workers/me/status',
      headers: bearerHeader(token),
      payload: { status: 'online' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});
