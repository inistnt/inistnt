// ═══════════════════════════════════════════════════════════
// E2E TESTS — Payments (Razorpay Webhooks & Verification)
// ═══════════════════════════════════════════════════════════

jest.mock('../../src/infrastructure/database', () => require('../mocks/database.mock'));
jest.mock('../../src/infrastructure/redis', () => require('../mocks/redis.mock'));
jest.mock('../../src/infrastructure/kafka', () => require('../mocks/kafka.mock'));

import { buildApp } from '../helpers/app.helper';
import { db, resetDbMocks } from '../mocks/database.mock';
import { generateUserToken, bearerHeader } from '../helpers/auth.helper';
import { makePayment, makeBooking } from '../fixtures';
import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';

let app: FastifyInstance;

beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => {
  resetDbMocks();
  jest.clearAllMocks();
});

describe('Payments E2E', () => {
  const userId = 'user-123';
  const token = generateUserToken(userId);

  it('POST /api/v1/payments/verify — Success', async () => {
    const orderId = 'order_123';
    const paymentId = 'pay_123';
    const secret = process.env.RAZORPAY_KEY_SECRET || 'rzp_test_secret';
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const booking = makeBooking(userId, { id: 'bk-1', status: 'ASSIGNED', workerId: 'w-1', workerEarning: 44000 });
    const payment = makePayment('bk-1', userId, { razorpayOrderId: orderId, status: 'INITIATED', booking });

    (db.payment.findFirst as jest.Mock).mockResolvedValue(payment);
    (db.payment.update as jest.Mock).mockResolvedValue({ ...payment, status: 'CAPTURED' });
    (db.booking.update as jest.Mock).mockResolvedValue({});
    (db.worker.update as jest.Mock).mockResolvedValue({});
    (db.workerEarning.create as jest.Mock).mockResolvedValue({});
    (db.user.update as jest.Mock).mockResolvedValue({});

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/verify',
      headers: bearerHeader(token),
      payload: {
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('CAPTURED');
  });

  it('POST /api/v1/payments/webhook — Success (payment.captured)', async () => {
    const event = {
      event: 'payment.captured',
      payload: {
        payment: { entity: { order_id: 'order_wh_1', id: 'pay_wh_1', method: 'upi' } }
      }
    };
    const body = JSON.stringify(event);
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_test_webhook_secret';
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

    (db.payment.findFirst as jest.Mock).mockResolvedValue(makePayment('bk-wh', userId, { razorpayOrderId: 'order_wh_1', status: 'INITIATED' }));
    (db.payment.update as jest.Mock).mockResolvedValue({ status: 'CAPTURED' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/webhook',
      headers: { 'x-razorpay-signature': signature },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true });
  });
});
