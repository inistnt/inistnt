// ═══════════════════════════════════════════════════════════
// E2E TESTS — Bookings
// ═══════════════════════════════════════════════════════════

jest.mock('../../src/infrastructure/database', () => require('../mocks/database.mock'));
jest.mock('../../src/infrastructure/redis', () => require('../mocks/redis.mock'));
jest.mock('../../src/infrastructure/kafka', () => require('../mocks/kafka.mock'));

import { buildApp } from '../helpers/app.helper';
import { db, resetDbMocks } from '../mocks/database.mock';
import { generateUserToken, bearerHeader } from '../helpers/auth.helper';
import { makeBooking, makeService, makeServicePricing } from '../fixtures';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => {
  resetDbMocks();
  jest.clearAllMocks();
});

describe('Booking Lifecycle E2E', () => {
  const userId = 'user-123';
  const token = generateUserToken(userId);

  it('POST /api/v1/bookings — Create Success', async () => {
    (db.booking.findFirst as jest.Mock).mockResolvedValue(null); // No active booking
    (db.service.findUnique as jest.Mock).mockResolvedValue(makeService({ id: 'svc-1' }));
    (db.servicePricing.findFirst as jest.Mock).mockResolvedValue(makeServicePricing('svc-1', 'city-1', { basePrice: 50000 }));
    (db.commissionRule.findFirst as jest.Mock).mockResolvedValue({ value: 12.0 });
    (db.booking.create as jest.Mock).mockResolvedValue(makeBooking(userId, { id: 'bk-1', finalAmount: 50000 }));
    (db.booking.update as jest.Mock).mockResolvedValue({});

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/bookings',
      headers: bearerHeader(token),
      payload: {
        serviceId: 'svc-1',
        cityId: 'city-1',
        addressId: 'addr-1',
        lat: 12.9716,
        lng: 77.5946,
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.id).toBe('bk-1');
  });

  it('GET /api/v1/bookings/active — Success', async () => {
    (db.booking.findFirst as jest.Mock).mockResolvedValue(makeBooking(userId, { status: 'SEARCHING' }));

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/bookings/active',
      headers: bearerHeader(token),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('SEARCHING');
  });
});
