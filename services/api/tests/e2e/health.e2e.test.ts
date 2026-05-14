// ═══════════════════════════════════════════════════════════
// E2E TESTS — Health check & 404 handler
// ═══════════════════════════════════════════════════════════

jest.mock('../../src/infrastructure/database', () => require('../mocks/database.mock'));
jest.mock('../../src/infrastructure/redis', () => require('../mocks/redis.mock'));
jest.mock('../../src/infrastructure/kafka', () => require('../mocks/kafka.mock'));

import { buildApp } from '../helpers/app.helper';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('returns 200 with status ok and service checks', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBe('1.0.0');
    expect(body.services).toMatchObject({
      database: true,
      redis: true,
    });
  });

  it('includes uptime in the response', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = res.json();
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });
});

describe('404 handler', () => {
  it('returns 404 with NOT_FOUND code for unknown routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/nonexistent' });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for unknown POST routes', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v99/bogus' });
    expect(res.statusCode).toBe(404);
  });
});
