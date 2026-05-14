// ═══════════════════════════════════════════════════════════
// UNIT TESTS — paymentService.verifyPayment
// Tests HMAC signature validation, idempotency, DB updates
// ═══════════════════════════════════════════════════════════

jest.mock('../../../src/infrastructure/database', () => require('../../mocks/database.mock'));
jest.mock('../../../src/infrastructure/redis', () => require('../../mocks/redis.mock'));
jest.mock('../../../src/infrastructure/kafka', () => require('../../mocks/kafka.mock'));

import crypto from 'crypto';
import { paymentService } from '../../../src/modules/payments/payment.service';
import { db } from '../../mocks/database.mock';
import { mockKafka } from '../../mocks/kafka.mock';
import { makePayment, makeBooking } from '../../fixtures';

const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? 'rzp_test_secret';

function makeValidSignature(orderId: string, paymentId: string): string {
  return crypto
    .createHmac('sha256', RZP_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockKafka.clear();
});

describe('paymentService.verifyPayment', () => {
  const orderId   = 'order_test123';
  const paymentId = 'pay_test456';

  it('throws 400 INVALID_SIGNATURE for tampered signature', async () => {
    await expect(
      paymentService.verifyPayment({
        razorpayOrderId:   orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: 'tampered_signature_here',
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_SIGNATURE',
    });
  });

  it('throws 404 when payment record not found', async () => {
    const validSig = makeValidSignature(orderId, paymentId);
    (db.payment.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      paymentService.verifyPayment({
        razorpayOrderId:   orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSig,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns existing record idempotently if already CAPTURED', async () => {
    const validSig = makeValidSignature(orderId, paymentId);
    const existing = makePayment('bk-1', 'user-1', {
      razorpayOrderId: orderId,
      status: 'CAPTURED',
    });
    (db.payment.findFirst as jest.Mock).mockResolvedValue(existing);

    const result = await paymentService.verifyPayment({
      razorpayOrderId:   orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: validSig,
    });

    // Should NOT call update again
    expect(db.payment.update).not.toHaveBeenCalled();
    expect(result.status).toBe('CAPTURED');
  });

  it('updates payment to CAPTURED and booking to COMPLETED on success', async () => {
    const validSig = makeValidSignature(orderId, paymentId);

    const booking = makeBooking('user-1', {
      id: 'bk-pay-1',
      workerId: 'worker-1',
      finalAmount: 50000,
      workerEarning: 44000,
      commissionAmount: 6000,
    });
    const payment = makePayment('bk-pay-1', 'user-1', {
      razorpayOrderId: orderId,
      status: 'INITIATED',
      amount: 50000,
      booking,
    });

    (db.payment.findFirst as jest.Mock).mockResolvedValue(payment);
    (db.payment.update as jest.Mock).mockResolvedValue({ ...payment, status: 'CAPTURED' });
    (db.booking.update as jest.Mock).mockResolvedValue({ ...booking, status: 'COMPLETED' });
    (db.worker.update as jest.Mock).mockResolvedValue({});
    (db.workerEarning.create as jest.Mock).mockResolvedValue({});
    (db.user.update as jest.Mock).mockResolvedValue({});

    const result = await paymentService.verifyPayment({
      razorpayOrderId:   orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: validSig,
    });

    expect(result.status).toBe('CAPTURED');
    expect(db.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bk-pay-1' },
        data:  expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });

  it('increments worker walletBalance and totalEarned', async () => {
    const validSig = makeValidSignature(orderId, paymentId);
    const booking = makeBooking('user-1', {
      id: 'bk-w', workerId: 'worker-88', workerEarning: 44000,
    });
    const payment = makePayment('bk-w', 'user-1', {
      razorpayOrderId: orderId,
      status: 'INITIATED',
      amount: 50000,
      booking,
    });

    (db.payment.findFirst as jest.Mock).mockResolvedValue(payment);
    (db.payment.update as jest.Mock).mockResolvedValue({ ...payment, status: 'CAPTURED' });
    (db.booking.update as jest.Mock).mockResolvedValue({});
    (db.worker.update as jest.Mock).mockResolvedValue({});
    (db.workerEarning.create as jest.Mock).mockResolvedValue({});
    (db.user.update as jest.Mock).mockResolvedValue({});

    await paymentService.verifyPayment({
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: validSig,
    });

    expect(db.worker.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'worker-88' },
        data:  expect.objectContaining({
          walletBalance: { increment: 44000 },
          totalEarned:   { increment: 44000 },
        }),
      }),
    );
  });

  it('publishes PAYMENT_CAPTURED Kafka event', async () => {
    const validSig = makeValidSignature(orderId, paymentId);
    const booking = makeBooking('user-1', { id: 'bk-k', workerId: 'wk-1', workerEarning: 40000 });
    const payment = makePayment('bk-k', 'user-1', {
      razorpayOrderId: orderId,
      status: 'INITIATED',
      amount: 50000,
      booking,
    });

    (db.payment.findFirst as jest.Mock).mockResolvedValue(payment);
    (db.payment.update as jest.Mock).mockResolvedValue({ ...payment, status: 'CAPTURED', id: 'pmt-99' });
    (db.booking.update as jest.Mock).mockResolvedValue({});
    (db.worker.update as jest.Mock).mockResolvedValue({});
    (db.workerEarning.create as jest.Mock).mockResolvedValue({});
    (db.user.update as jest.Mock).mockResolvedValue({});

    await paymentService.verifyPayment({
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: validSig,
    });

    const events = mockKafka.getPublishedByTopic('payment.captured');
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ amount: 50000 });
  });
});
