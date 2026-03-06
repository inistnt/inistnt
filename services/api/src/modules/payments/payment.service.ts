import crypto from 'crypto';
import { db } from '../../infrastructure/database';
import { kafka, KafkaTopics } from '../../infrastructure/kafka';
import { config } from '../../config';

// ──────────────────────────────────────────────────────────
// RAZORPAY HELPER — No SDK needed, direct HTTP calls
// ──────────────────────────────────────────────────────────

async function razorpayRequest(method: string, path: string, body?: object) {
  const auth = Buffer.from(`${config.RAZORPAY_KEY_ID}:${config.RAZORPAY_KEY_SECRET}`).toString('base64');

  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json() as any;
    throw { statusCode: response.status, code: 'RAZORPAY_ERROR', message: error?.error?.description ?? 'Payment error.' };
  }

  return response.json();
}

// ──────────────────────────────────────────────────────────
// PAYMENT SERVICE
// ──────────────────────────────────────────────────────────

export const paymentService = {

  // ─── CREATE ORDER ────────────────────────────────────────
  createOrder: async (bookingId: string, userId: string) => {
    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      include: { user: true },
    });

    if (!booking) throw { statusCode: 404, message: 'Booking nahi mili.' };
    if (booking.userId !== userId) throw { statusCode: 403, message: 'Access denied.' };
    if (booking.status !== 'WORK_COMPLETED') throw { statusCode: 400, code: 'NOT_READY', message: 'Kaam complete hone ke baad payment karo.' };

    // Existing payment check
    const existing = await db.payment.findUnique({ where: { bookingId } });
    if (existing?.status === 'CAPTURED') throw { statusCode: 400, code: 'ALREADY_PAID', message: 'Payment ho chuki hai.' };

    // Razorpay order create karo
    const rzpOrder = await razorpayRequest('POST', '/orders', {
      amount: booking.finalAmount, // Already in paise
      currency: 'INR',
      receipt: booking.bookingNumber,
      notes: {
        bookingId: booking.id,
        userId: booking.userId,
        bookingNumber: booking.bookingNumber,
      },
    }) as any;

    // Payment record save karo
    const payment = await db.payment.upsert({
      where: { bookingId },
      create: {
        bookingId,
        userId,
        amount: booking.finalAmount,
        status: 'INITIATED',
        razorpayOrderId: rzpOrder.id,
      },
      update: {
        status: 'INITIATED',
        razorpayOrderId: rzpOrder.id,
      },
    });

    return {
      orderId:    rzpOrder.id,
      amount:     rzpOrder.amount,
      currency:   rzpOrder.currency,
      keyId:      config.RAZORPAY_KEY_ID,
      bookingNumber: booking.bookingNumber,
      prefill: {
        name:    booking.user.name ?? '',
        contact: booking.user.mobile,
        email:   booking.user.email ?? '',
      },
    };
  },

  // ─── VERIFY PAYMENT ──────────────────────────────────────
  verifyPayment: async (data: {
    razorpayOrderId:   string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }) => {
    // Signature verify karo
    const expectedSignature = crypto
      .createHmac('sha256', config.RAZORPAY_KEY_SECRET)
      .update(`${data.razorpayOrderId}|${data.razorpayPaymentId}`)
      .digest('hex');

    if (expectedSignature !== data.razorpaySignature) {
      throw { statusCode: 400, code: 'INVALID_SIGNATURE', message: 'Payment signature galat hai.' };
    }

    // Payment record update karo
    const payment = await db.payment.findFirst({
      where: { razorpayOrderId: data.razorpayOrderId },
      include: { booking: true },
    });

    if (!payment) throw { statusCode: 404, message: 'Payment record nahi mila.' };

    const updatedPayment = await db.payment.update({
      where: { id: payment.id },
      data: {
        status:            'CAPTURED',
        razorpayPaymentId: data.razorpayPaymentId,
        razorpaySignature: data.razorpaySignature,
        capturedAt:        new Date(),
      },
    });

    // Booking COMPLETED karo
    await db.booking.update({
      where: { id: payment.bookingId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    // Worker wallet update karo
    if (payment.booking.workerId) {
      await db.worker.update({
        where: { id: payment.booking.workerId },
        data: {
          walletBalance:  { increment: payment.booking.workerEarning },
          pendingPayout:  { increment: payment.booking.workerEarning },
          totalEarned:    { increment: payment.booking.workerEarning },
          completedJobs:  { increment: 1 },
          totalJobs:      { increment: 1 },
        },
      });

      // Worker earning record
      await db.workerEarning.create({
        data: {
          workerId:     payment.booking.workerId,
          bookingId:    payment.bookingId,
          grossAmount:  payment.booking.finalAmount,
          commission:   payment.booking.commissionAmount,
          netAmount:    payment.booking.workerEarning,
          finalAmount:  payment.booking.workerEarning,
        },
      });
    }

    // User totalBookings + totalSpend update
    await db.user.update({
      where: { id: payment.booking.userId },
      data: {
        totalBookings: { increment: 1 },
        totalSpend:    { increment: payment.amount },
      },
    });

    // Kafka event
    await kafka.publish(KafkaTopics.PAYMENT_CAPTURED, {
      paymentId:  updatedPayment.id,
      bookingId:  payment.bookingId,
      userId:     payment.booking.userId,
      workerId:   payment.booking.workerId,
      amount:     payment.amount,
      method:     'razorpay',
    }, payment.bookingId);

    return updatedPayment;
  },

  // ─── WEBHOOK ─────────────────────────────────────────────
  handleWebhook: async (body: string, signature: string) => {
    const expectedSignature = crypto
      .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== signature) {
      throw { statusCode: 400, message: 'Invalid webhook signature.' };
    }

    const event = JSON.parse(body) as any;

    if (event.event === 'payment.captured') {
      const payment = event.payload.payment.entity;
      const existing = await db.payment.findFirst({
        where: { razorpayOrderId: payment.order_id },
      });

      if (existing && existing.status !== 'CAPTURED') {
        await db.payment.update({
          where: { id: existing.id },
          data: {
            status:            'CAPTURED',
            razorpayPaymentId: payment.id,
            capturedAt:        new Date(),
            method:            payment.method?.toUpperCase() as any,
          },
        });
      }
    }

    if (event.event === 'payment.failed') {
      const payment = event.payload.payment.entity;
      await db.payment.updateMany({
        where: { razorpayOrderId: payment.order_id },
        data: {
          status:        'FAILED',
          failureReason: payment.error_description ?? 'Payment failed',
        },
      });
    }

    return { received: true };
  },

  // ─── REFUND ──────────────────────────────────────────────
  refund: async (bookingId: string, amount?: number, reason?: string, refundedById?: string) => {
    const payment = await db.payment.findUnique({ where: { bookingId } });
    if (!payment) throw { statusCode: 404, message: 'Payment nahi mili.' };
    if (payment.status !== 'CAPTURED') throw { statusCode: 400, message: 'Sirf captured payments refund ho sakti hain.' };
    if (!payment.razorpayPaymentId) throw { statusCode: 400, message: 'Razorpay payment ID nahi hai.' };

    const refundAmount = amount ?? payment.amount;

    const rzpRefund = await razorpayRequest('POST', `/payments/${payment.razorpayPaymentId}/refund`, {
      amount: refundAmount,
      notes: { reason: reason ?? 'Customer request', bookingId },
    }) as any;

    const updatedPayment = await db.payment.update({
      where: { bookingId },
      data: {
        status:          refundAmount >= payment.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        refundAmount,
        refundReason:    reason,
        refundedAt:      new Date(),
        refundedById,
        razorpayRefundId: rzpRefund.id,
      },
    });

    await kafka.publish(KafkaTopics.REFUND_PROCESSED, {
      bookingId,
      paymentId:    payment.id,
      refundAmount,
      reason,
    }, bookingId);

    return updatedPayment;
  },

  // ─── GET PAYMENT ─────────────────────────────────────────
  getByBookingId: async (bookingId: string) => {
    return db.payment.findUnique({ where: { bookingId } });
  },
};
