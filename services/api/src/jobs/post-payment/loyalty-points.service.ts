// ═══════════════════════════════════════════════════════════════════
// INISTNT — Loyalty Points Service
// Triggered by: BOOKING_COMPLETED
//
// Flow:
//   finalAmount (paise) × POINTS_PER_RUPEE → points
//   → User.loyaltyPoints += points
//   → LoyaltyHistory.create (earned)
//   → Update booking.loyaltyPointsEarned
//   → Notify user
//
// Also exports: redeemPoints() — used by checkout flow
// ═══════════════════════════════════════════════════════════════════

import { db }    from '../../infrastructure/database';
import { kafka, KafkaTopics } from '../../infrastructure/kafka';
import { logger } from '../../config/logger';

const LOYALTY = {
  POINTS_PER_RUPEE:   0.1,    // ₹1 spent = 0.1 points (₹100 booking = 10 points)
  MIN_REDEEM_POINTS:  100,    // Minimum to redeem
  POINTS_TO_RUPEE:    1.0,    // 1 point = ₹1 at checkout
  MAX_REDEEM_PERCENT: 20,     // Max 20% of booking value can be paid via coins
  EXPIRY_DAYS:        365,
};

export async function earnLoyaltyPoints(bookingId: string): Promise<number> {
  const booking = await db.booking.findUnique({
    where:  { id: bookingId },
    select: {
      id:                  true,
      userId:              true,
      finalAmount:         true,
      bookingNumber:       true,
      loyaltyPointsEarned: true,
    },
  });

  if (!booking) return 0;

  // Idempotency — points already earned for this booking?
  if (booking.loyaltyPointsEarned > 0) {
    logger.info({ bookingId }, '[Loyalty] Points already earned, skipping');
    return booking.loyaltyPointsEarned;
  }

  const rupees     = booking.finalAmount / 100;
  const points     = Math.floor(rupees * LOYALTY.POINTS_PER_RUPEE);
  if (points <= 0) return 0;

  const expiresAt  = new Date(Date.now() + LOYALTY.EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await db.$transaction(async (tx) => {
    // Credit points to user
    await tx.user.update({
      where: { id: booking.userId },
      data:  { loyaltyPoints: { increment: points } },
    });

    // Record in history
    await tx.loyaltyHistory.create({
      data: {
        userId:      booking.userId,
        type:        'earned',
        points,
        bookingId:   booking.id,
        description: `Booking #${booking.bookingNumber} pe ${points} coins earned`,
        expiresAt,
      },
    });

    // Mark on booking so we don't double-credit (schema addition required)
    await tx.booking.update({
      where: { id: bookingId },
      data:  { loyaltyPointsEarned: points },
    });
  });

  // Notify user
  await kafka.publish(KafkaTopics.NOTIFICATION_SEND, {
    recipientType: 'user',
    recipientId:   booking.userId,
    channels:      ['push'],
    title:         '🪙 Coins Mile!',
    body:          `Booking #${booking.bookingNumber} pe aapko ${points} Inistnt Coins mile!`,
    deepLink:      `inistnt://coins`,
    bookingId:     booking.id,
  }, booking.id);

  logger.info({ bookingId, userId: booking.userId, points }, '[Loyalty] ✅ Points earned');
  return points;
}

// ─── Redeem points at checkout ───────────────────────────────────────────────
export async function redeemPoints(
  userId:    string,
  bookingId: string,
  points:    number,
): Promise<{ discount: number; remaining: number }> {
  const user = await db.user.findUnique({
    where:  { id: userId },
    select: { loyaltyPoints: true },
  });
  if (!user) throw new Error('User not found');

  if (user.loyaltyPoints < LOYALTY.MIN_REDEEM_POINTS) {
    throw new Error(`Minimum ${LOYALTY.MIN_REDEEM_POINTS} coins chahiye redeem karne ke liye`);
  }

  const booking = await db.booking.findUnique({
    where:  { id: bookingId },
    select: { finalAmount: true, loyaltyDiscount: true },
  });
  if (!booking) throw new Error('Booking not found');

  // Cap: max 20% of booking value
  const maxDiscount     = Math.floor(booking.finalAmount * LOYALTY.MAX_REDEEM_PERCENT / 100);
  const pointsToRedeem  = Math.min(points, user.loyaltyPoints, maxDiscount);
  const discountPaise   = pointsToRedeem * LOYALTY.POINTS_TO_RUPEE * 100; // 1 pt = ₹1

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data:  { loyaltyPoints: { decrement: pointsToRedeem } },
    });
    await tx.loyaltyHistory.create({
      data: {
        userId,
        type:        'redeemed',
        points:      -pointsToRedeem,
        bookingId,
        description: `${pointsToRedeem} coins redeemed at checkout`,
      },
    });
    await tx.booking.update({
      where: { id: bookingId },
      data:  { loyaltyDiscount: discountPaise },
    });
  });

  return {
    discount:  discountPaise,
    remaining: user.loyaltyPoints - pointsToRedeem,
  };
}
