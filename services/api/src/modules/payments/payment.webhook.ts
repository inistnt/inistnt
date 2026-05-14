import type { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { db }    from '../../infrastructure/database';
import { kafka, KafkaTopics } from '../../infrastructure/kafka';
import { config } from '../../config';

// ─────────────────────────────────────────────────────────────
// BUG 8 FIX: Razorpay method strings → PaymentMethod enum
// Razorpay sends: 'upi', 'card', 'netbanking', 'wallet', 'emi'
// Our enum:        UPI,   CARD,  NET_BANKING,   WALLET,  CARD
// ─────────────────────────────────────────────────────────────
function toPaymentMethod(raw?: string): string {
  const map: Record<string, string> = {
    upi:        'UPI',
    card:       'CARD',
    netbanking: 'NET_BANKING',   // toUpperCase() gives 'NETBANKING' — wrong!
    wallet:     'WALLET',
    emi:        'CARD',
    cash:       'CASH',
  };
  return map[raw?.toLowerCase() ?? ''] ?? 'UPI';
}

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
  const signature = req.headers['x-razorpay-signature'] as string;
  if (!signature) {
    return rep.status(400).send({ error: 'Missing signature' });
  }

  const raw = (req as any).rawBody as string | Buffer | undefined;
  if (!raw) {
    req.log.error('rawBody not available. Enable raw body for webhook route.');
    return rep.status(400).send({ error: 'Invalid webhook payload' });
  }

  const rawBody = typeof raw === 'string' ? raw : raw.toString('utf8');

  const expected = crypto
    .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    req.log.warn({ signature }, 'Invalid Razorpay webhook signature');
    return rep.status(400).send({ error: 'Invalid signature' });
  }

  const event = req.body as RazorpayWebhookEvent;
  if (!event?.event || !event?.payload) {
    return rep.status(400).send({ error: 'Malformed event' });
  }

  req.log.info({ event: event.event, paymentId: event.payload?.payment?.entity?.id }, 'Razorpay webhook received');

  try {
    switch (event.event) {

      // ─── PAYMENT CAPTURED ────────────────────────────────
      case 'payment.captured':
        if (event.payload.payment) {
          await handlePaymentCaptured(event.payload.payment.entity);
        }
        break;

      // ─── PAYMENT FAILED ──────────────────────────────────
      case 'payment.failed':
        if (event.payload.payment) {
          await handlePaymentFailed(event.payload.payment.entity);
        }
        break;

      // ─── REFUND PROCESSED ────────────────────────────────
      case 'refund.processed':
        if (event.payload.refund) {
          await handleRefundProcessed(event.payload.refund.entity);
        }
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
          user:    { select: { id: true, name: true, mobile: true, email: true } },
          worker:  { select: { id: true, name: true } },
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
        method:              toPaymentMethod(payment.method) as any, // BUG 8 FIX: proper enum mapping
      },
    }),
    db.booking.update({
      where: { id: booking.id },
      data:  { status: 'COMPLETED' },  // BUG 1 FIX: paymentStatus doesn't exist → update booking status to COMPLETED
    }),
    db.transaction.create({
      data: {
        bookingId:    booking.id,
        userId:       booking.userId,
        type:         'BOOKING_PAYMENT',  // BUG 2 FIX: 'PAYMENT_CAPTURED' not in TransactionType enum
        amount:       payment.amount,
        // BUG 6 FIX: currency field doesn't exist in Transaction model
        // BUG 7 FIX: status field doesn't exist in Transaction model
        // BUG 5 FIX: reference field doesn't exist — stored in metadata instead
        balanceBefore: 0,   // BUG 4 FIX: required field — not tracked at webhook layer
        balanceAfter:  0,   // BUG 4 FIX: required field — not tracked at webhook layer
        description:  `Payment for booking ${booking.bookingNumber}`,
        metadata:     { razorpayPaymentId: payment.id, razorpayOrderId: payment.order_id },
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

  // idempotency: repeated webhook retry
  if (paymentRecord.status === 'FAILED') return;

  await db.$transaction([
    db.payment.update({
      where: { id: paymentRecord.id },
      data: {
        status:            'FAILED',
        razorpayPaymentId: payment.id,
        failureReason:     payment.error_description ?? 'Payment failed',
      },
    }),
    // BUG 1 FIX: paymentStatus field doesn't exist in Booking model
    // Booking status stays PAYMENT_PENDING — no booking update needed here
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

  // robust idempotency: refund already processed?
  const existingRefundTxn = await db.transaction.findFirst({
    where: { 
      bookingId: paymentRecord.bookingId,
      type: 'BOOKING_REFUND',
      metadata: { path: ['razorpayRefundId'], equals: refund.id },
    },
    select: { id: true },
  });
  if (existingRefundTxn) return;

  await db.$transaction([
    db.payment.update({
      where: { id: paymentRecord.id },
      data: {
        refundAmount:    refund.amount,
        refundedAt:      new Date(refund.created_at * 1000),
        status:          'REFUNDED',
        razorpayRefundId: refund.id,  // store refund id on payment record
      },
    }),
    // BUG 1 FIX: paymentStatus field doesn't exist in Booking
    // Booking status is already CANCELLED at refund time — no update needed
    db.transaction.create({
      data: {
        bookingId:    paymentRecord.bookingId,
        userId:       paymentRecord.booking.userId,
        type:         'BOOKING_REFUND',   // BUG 3 FIX: 'REFUND' not in TransactionType enum
        amount:       refund.amount,
        // BUG 6 FIX: currency doesn't exist in Transaction model
        // BUG 7 FIX: status doesn't exist in Transaction model
        // BUG 5 FIX: reference doesn't exist — stored in metadata
        balanceBefore: 0,   // BUG 4 FIX: required field
        balanceAfter:  0,   // BUG 4 FIX: required field
        description:  `Refund for booking ${paymentRecord.booking.bookingNumber}`,
        metadata:     { razorpayRefundId: refund.id, razorpayPaymentId: refund.payment_id },
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
