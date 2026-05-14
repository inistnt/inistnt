// ═══════════════════════════════════════════════════════════
// UNIT TESTS — paymentService webhook & refund
// ═══════════════════════════════════════════════════════════

jest.mock('../../../src/infrastructure/database', () => require('../../mocks/database.mock'));
jest.mock('../../../src/infrastructure/redis', () => require('../../mocks/redis.mock'));
jest.mock('../../../src/infrastructure/kafka', () => require('../../mocks/kafka.mock'));

import crypto from 'crypto';
import { paymentService } from '../../../src/modules/payments/payment.service';
import { db } from '../../mocks/database.mock';
import { mockKafka } from '../../mocks/kafka.mock';
import { makePayment, makeBooking } from '../../fixtures';

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? 'rzp_test_webhook_secret';

function makeWebhookSignature(body: string): string {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockKafka.clear();
});

// ─── WEBHOOK ───────────────────────────────────────────────

describe('paymentService.handleWebhook', () => {
  it('throws 400 for invalid webhook signature', async () => {
    const body = JSON.stringify({ event: 'payment.captured' });

    await expect(
      paymentService.handleWebhook(body, 'invalid_signature'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('handles payment.captured event and updates payment status', async () => {
    const event = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: { id: 'pay_webhook1', order_id: 'order_wh1', method: 'upi' },
        },
      },
    };
    const body = JSON.stringify(event);
    const sig  = makeWebhookSignature(body);

    const existingPayment = makePayment('bk-wh', 'user-1', {
      razorpayOrderId: 'order_wh1',
      status: 'INITIATED',
    });
    (db.payment.findFirst as jest.Mock).mockResolvedValue(existingPayment);
    (db.payment.update as jest.Mock).mockResolvedValue({ ...existingPayment, status: 'CAPTURED' });

    const result = await paymentService.handleWebhook(body, sig);

    expect(result).toEqual({ received: true });
    expect(db.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CAPTURED' }),
      }),
    );
  });

  it('does NOT update already-captured payment on webhook', async () => {
    const event = {
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_dup', order_id: 'order_dup' } } },
    };
    const body = JSON.stringify(event);
    const sig  = makeWebhookSignature(body);

    (db.payment.findFirst as jest.Mock).mockResolvedValue(
      makePayment('bk-dup', 'user-1', { razorpayOrderId: 'order_dup', status: 'CAPTURED' }),
    );

    await paymentService.handleWebhook(body, sig);
    expect(db.payment.update).not.toHaveBeenCalled();
  });

  it('handles payment.failed event and marks payment as FAILED', async () => {
    const event = {
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_fail1',
            order_id: 'order_fail1',
            error_description: 'Insufficient funds',
          },
        },
      },
    };
    const body = JSON.stringify(event);
    const sig  = makeWebhookSignature(body);

    (db.payment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await paymentService.handleWebhook(body, sig);

    expect(db.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { razorpayOrderId: 'order_fail1' },
        data:  expect.objectContaining({
          status: 'FAILED',
          failureReason: 'Insufficient funds',
        }),
      }),
    );
  });

  it('is a no-op for unknown event types', async () => {
    const event = { event: 'refund.speed_changed', payload: {} };
    const body  = JSON.stringify(event);
    const sig   = makeWebhookSignature(body);

    const result = await paymentService.handleWebhook(body, sig);
    expect(result).toEqual({ received: true });
    expect(db.payment.update).not.toHaveBeenCalled();
    expect(db.payment.updateMany).not.toHaveBeenCalled();
  });
});

// ─── REFUND ────────────────────────────────────────────────

describe('paymentService.refund', () => {
  // Mock fetch for Razorpay API calls
  global.fetch = jest.fn();

  it('throws 404 when payment not found', async () => {
    (db.payment.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      paymentService.refund('bk-none'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 400 when payment is not CAPTURED', async () => {
    (db.payment.findUnique as jest.Mock).mockResolvedValue(
      makePayment('bk-1', 'user-1', { status: 'INITIATED' }),
    );

    await expect(
      paymentService.refund('bk-1'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when razorpayPaymentId is missing', async () => {
    (db.payment.findUnique as jest.Mock).mockResolvedValue(
      makePayment('bk-1', 'user-1', { status: 'CAPTURED', razorpayPaymentId: null }),
    );

    await expect(
      paymentService.refund('bk-1'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('processes full refund and sets status REFUNDED', async () => {
    const payment = makePayment('bk-ref', 'user-1', {
      status: 'CAPTURED',
      amount: 50000,
      razorpayPaymentId: 'pay_captured_1',
    });
    (db.payment.findUnique as jest.Mock).mockResolvedValue(payment);

    // Mock Razorpay API response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'rfnd_1', amount: 50000 }),
    });

    (db.payment.update as jest.Mock).mockResolvedValue({
      ...payment,
      status: 'REFUNDED',
      refundAmount: 50000,
    });

    const result = await paymentService.refund('bk-ref');
    expect(result.status).toBe('REFUNDED');
  });

  it('sets status PARTIALLY_REFUNDED for partial refund', async () => {
    const payment = makePayment('bk-pref', 'user-1', {
      status: 'CAPTURED',
      amount: 50000,
      razorpayPaymentId: 'pay_cap_2',
    });
    (db.payment.findUnique as jest.Mock).mockResolvedValue(payment);

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'rfnd_2', amount: 20000 }),
    });

    (db.payment.update as jest.Mock).mockResolvedValue({
      ...payment,
      status: 'PARTIALLY_REFUNDED',
      refundAmount: 20000,
    });

    const result = await paymentService.refund('bk-pref', 20000, 'partial request');
    expect(result.status).toBe('PARTIALLY_REFUNDED');
  });

  it('publishes REFUND_PROCESSED Kafka event', async () => {
    const payment = makePayment('bk-kref', 'user-1', {
      status: 'CAPTURED',
      amount: 50000,
      razorpayPaymentId: 'pay_cap_3',
    });
    (db.payment.findUnique as jest.Mock).mockResolvedValue(payment);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'rfnd_k', amount: 50000 }),
    });
    (db.payment.update as jest.Mock).mockResolvedValue({ ...payment, status: 'REFUNDED' });

    await paymentService.refund('bk-kref');

    const events = mockKafka.getPublishedByTopic('refund.processed');
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ bookingId: 'bk-kref' });
  });
});
