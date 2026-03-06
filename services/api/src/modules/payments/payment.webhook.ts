import type { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { db }    from '../../infrastructure/database';
import { kafka, KafkaTopics } from '../../infrastructure/kafka';
import { config } from '../../config';

// ─────────────────────────────────────────────────────────────
// RAZORPAY WEBHOOK HANDLER
//
// Flow:
//   Razorpay → POST /api/v1/payments/webhook
//       ↓
//   Verify HMAC signature
//       ↓
//   payment.captured  → mark booking PAID, publish events
//   payment.failed    → mark booking PAYMENT_FAILED
//   refund.processed  → update refund record
// ─────────────────────────────────────────────────────────────

export async function handleRazorpayWebhook(
  req: FastifyRequest,
  rep: FastifyReply,
) {
  // 1. Verify webhook signature ──────────────────────────────
  const signature = req.headers['x-razorpay-signature'] as string;
  if (!signature) {
    return rep.status(400).send({ error: 'Missing signature' });
  }

  const rawBody = JSON.stringify(req.body); // Fastify parses JSON — need raw
  const expected = crypto
    .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    req.log.warn({ signature }, '⚠️ Invalid Razorpay webhook signature');
    return rep.status(400).send({ error: 'Invalid signature' });
  }

  const event = req.body as RazorpayWebhookEvent;
  req.log.info({ event: event.event, paymentId: event.payload?.payment?.entity?.id }, '📩 Razorpay webhook received');

  try {
    switch (event.event) {

      // ─── PAYMENT CAPTURED ────────────────────────────────
      case 'payment.captured':
        await handlePaymentCaptured(event.payload.payment.entity);
        break;

      // ─── PAYMENT FAILED ──────────────────────────────────
      case 'payment.failed':
        await handlePaymentFailed(event.payload.payment.entity);
        break;

      // ─── REFUND PROCESSED ────────────────────────────────
      case 'refund.processed':
        await handleRefundProcessed(event.payload.refund.entity);
        break;

      default:
        req.log.debug({ event: event.event }, 'Unhandled webhook event, ignoring');
    }
  } catch (err) {
    req.log.error({ err, event: event.event }, '❌ Webhook handler error');
    // Return 200 anyway — Razorpay retries on non-2xx
  }

  return rep.status(200).send({ received: true });
}

// ─── PAYMENT CAPTURED ─────────────────────────────────────────

async function handlePaymentCaptured(payment: RazorpayPayment) {
  // Find payment record by razorpay order id
  const paymentRecord = await db.payment.findFirst({
    where: { razorpayOrderId: payment.order_id },
    include: {
      booking: {
        include: {
          user:    { select: { id: true, name: true, fcmToken: true, mobile: true, email: true } },
          worker:  { select: { id: true, name: true, fcmToken: true } },
          service: { select: { nameEn: true } },
          city:    { select: { nameEn: true } },
        },
      },
    },
  });

  if (!paymentRecord) {
    console.error(`[webhook] Payment not found for order: ${payment.order_id}`);
    return;
  }

  if (paymentRecord.status === 'CAPTURED') {
    console.log(`[webhook] Payment already captured: ${paymentRecord.id}`);
    return; // Idempotent
  }

  const booking = paymentRecord.booking;

  // Update payment + booking in transaction
  await db.$transaction([
    db.payment.update({
      where: { id: paymentRecord.id },
      data: {
        status:              'CAPTURED',
        razorpayPaymentId:   payment.id,
        capturedAt:          new Date(payment.created_at * 1000),
        method:              payment.method,
      },
    }),
    db.booking.update({
      where: { id: booking.id },
      data:  { paymentStatus: 'PAID' },
    }),
    db.transaction.create({
      data: {
        bookingId:   booking.id,
        userId:      booking.userId,
        type:        'PAYMENT',
        amount:      payment.amount,
        currency:    'INR',
        status:      'SUCCESS',
        reference:   payment.id,
        description: `Payment for booking ${booking.bookingNumber}`,
      },
    }),
  ]);

  // Publish events
  await kafka.publish(KafkaTopics.PAYMENT_CAPTURED, {
    paymentId:  paymentRecord.id,
    bookingId:  booking.id,
    userId:     booking.userId,
    workerId:   booking.workerId,
    amount:     payment.amount,
    method:     payment.method,
  }, booking.id);

  // Notify user
  await kafka.publish(KafkaTopics.NOTIFICATION_SEND, {
    recipientType: 'user',
    recipientId:   booking.userId,
    channels:      ['push', 'email'],
    title:         '💳 Payment Successful!',
    body:          `₹${payment.amount / 100} payment successful. Booking #${booking.bookingNumber} confirmed.`,
    deepLink:      `inistnt://booking/${booking.id}`,
    bookingId:     booking.id,
  }, booking.id);

  console.log(`[webhook] ✅ Payment captured: ${payment.id} for booking: ${booking.bookingNumber}`);
}

// ─── PAYMENT FAILED ───────────────────────────────────────────

async function handlePaymentFailed(payment: RazorpayPayment) {
  const paymentRecord = await db.payment.findFirst({
    where: { razorpayOrderId: payment.order_id },
    include: { booking: true },
  });

  if (!paymentRecord) return;

  await db.$transaction([
    db.payment.update({
      where: { id: paymentRecord.id },
      data: {
        status:            'FAILED',
        razorpayPaymentId: payment.id,
        failureReason:     payment.error_description ?? 'Payment failed',
      },
    }),
    db.booking.update({
      where: { id: paymentRecord.bookingId },
      data:  { paymentStatus: 'FAILED' },
    }),
  ]);

  await kafka.publish(KafkaTopics.PAYMENT_FAILED, {
    paymentId: paymentRecord.id,
    bookingId: paymentRecord.bookingId,
    userId:    paymentRecord.booking.userId,
    reason:    payment.error_description,
  }, paymentRecord.bookingId);

  // Notify user
  await kafka.publish(KafkaTopics.NOTIFICATION_SEND, {
    recipientType: 'user',
    recipientId:   paymentRecord.booking.userId,
    channels:      ['push'],
    title:         '❌ Payment Failed',
    body:          'Aapka payment fail ho gaya. Dobara try karein.',
    deepLink:      `inistnt://booking/${paymentRecord.bookingId}/pay`,
    bookingId:     paymentRecord.bookingId,
  }, paymentRecord.bookingId);

  console.log(`[webhook] ❌ Payment failed: ${payment.id}`);
}

// ─── REFUND PROCESSED ─────────────────────────────────────────

async function handleRefundProcessed(refund: RazorpayRefund) {
  const paymentRecord = await db.payment.findFirst({
    where: { razorpayPaymentId: refund.payment_id },
    include: { booking: true },
  });

  if (!paymentRecord) return;

  await db.$transaction([
    db.payment.update({
      where: { id: paymentRecord.id },
      data: {
        refundId:     refund.id,
        refundAmount: refund.amount,
        refundedAt:   new Date(refund.created_at * 1000),
        status:       'REFUNDED',
      },
    }),
    db.transaction.create({
      data: {
        bookingId:   paymentRecord.bookingId,
        userId:      paymentRecord.booking.userId,
        type:        'REFUND',
        amount:      refund.amount,
        currency:    'INR',
        status:      'SUCCESS',
        reference:   refund.id,
        description: `Refund for booking ${paymentRecord.booking.bookingNumber}`,
      },
    }),
  ]);

  await kafka.publish(KafkaTopics.REFUND_PROCESSED, {
    refundId:  refund.id,
    paymentId: paymentRecord.id,
    bookingId: paymentRecord.bookingId,
    userId:    paymentRecord.booking.userId,
    amount:    refund.amount,
  }, paymentRecord.bookingId);

  // Notify user
  await kafka.publish(KafkaTopics.NOTIFICATION_SEND, {
    recipientType: 'user',
    recipientId:   paymentRecord.booking.userId,
    channels:      ['push', 'sms'],
    title:         '💸 Refund Processed!',
    body:          `₹${refund.amount / 100} refund 5-7 business days mein aapke account mein aayega.`,
    bookingId:     paymentRecord.bookingId,
  }, paymentRecord.bookingId);

  console.log(`[webhook] ✅ Refund processed: ${refund.id}`);
}

// ─── RAZORPAY TYPES ───────────────────────────────────────────

interface RazorpayWebhookEvent {
  event:   string;
  payload: {
    payment?: { entity: RazorpayPayment };
    refund?:  { entity: RazorpayRefund };
  };
}

interface RazorpayPayment {
  id:                string;
  order_id:          string;
  amount:            number;
  method:            string;
  status:            string;
  created_at:        number;
  error_description?: string;
}

interface RazorpayRefund {
  id:         string;
  payment_id: string;
  amount:     number;
  created_at: number;
}
