// ═══════════════════════════════════════════════════════════════════
// INISTNT — Referral Reward Service
// Triggered by: BOOKING_COMPLETED (only on referee's FIRST booking)
//
// Flow:
//   Check if booking.user used a referral code
//   Check if this is their first completed booking
//   → Credit referrer:  loyaltyPoints += REFERRER_REWARD (50 coins)
//   → Credit referee:   loyaltyPoints += REFEREE_REWARD  (100 coins) [already given at registration]
//   → Mark Referral.referrerBonusPaid = true
//   → Notify both
// ═══════════════════════════════════════════════════════════════════

import { db }    from '../../infrastructure/database';
import { kafka, KafkaTopics } from '../../infrastructure/kafka';
import { logger } from '../../config/logger';

// Constants (should ideally come from DB feature flags)
const REFERRAL = {
  REFERRER_REWARD:  50,   // coins credited to referrer
  REFEREE_REWARD:   100,  // coins credited to referee (already given on signup; this is extra on 1st booking)
  MIN_BOOKING_AMOUNT: 10000, // ₹100 minimum booking for referral to count (paise)
};

export async function processReferralReward(bookingId: string): Promise<void> {
  const booking = await db.booking.findUnique({
    where:   { id: bookingId },
    include: { user: { include: { referralUsed: true } } },
  });

  if (!booking) return;

  // Only process on first completed booking
  const completedCount = await db.booking.count({
    where: {
      userId: booking.userId,
      status: 'COMPLETED',
      id:     { not: bookingId },
    },
  });
  if (completedCount > 0) return;  // Not their first booking

  // Minimum booking amount check
  if (booking.finalAmount < REFERRAL.MIN_BOOKING_AMOUNT) {
    logger.debug({ bookingId, amount: booking.finalAmount }, '[Referral] Amount too low, skipping');
    return;
  }

  const referral = booking.user?.referralUsed;
  if (!referral) return;  // User didn't use a referral code

  // Idempotency
  if (referral.referrerBonusPaid) {
    logger.info({ referralId: referral.id }, '[Referral] Already paid, skipping');
    return;
  }

  await db.$transaction(async (tx) => {
    // Mark referral as paid
    await tx.referral.update({
      where: { id: referral.id },
      data: {
        referrerBonusPaid:   true,
        referrerBonusAmount: REFERRAL.REFERRER_REWARD,
        referredBonusPaid:   true,
        referredBonusAmount: REFERRAL.REFEREE_REWARD,
        completedAt:         new Date(),
      },
    });

    // Credit referrer (user)
    if (referral.referrerUserId) {
      await tx.user.update({
        where: { id: referral.referrerUserId },
        data:  { loyaltyPoints: { increment: REFERRAL.REFERRER_REWARD } },
      });
      await tx.loyaltyHistory.create({
        data: {
          userId:      referral.referrerUserId,
          type:        'earned',
          points:      REFERRAL.REFERRER_REWARD,
          bookingId:   booking.id,
          description: `Referral bonus — aapke code se ${booking.user.name} ne pehli booking ki!`,
          expiresAt:   new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        },
      });
      await tx.user.update({
        where: { id: referral.referrerUserId },
        data:  { totalReferred: { increment: 1 } },
      });
    }

    // Credit referee (extra bonus on first booking)
    await tx.user.update({
      where: { id: booking.userId },
      data:  { loyaltyPoints: { increment: REFERRAL.REFEREE_REWARD } },
    });
    await tx.loyaltyHistory.create({
      data: {
        userId:      booking.userId,
        type:        'earned',
        points:      REFERRAL.REFEREE_REWARD,
        bookingId:   booking.id,
        description: `Pehli booking bonus — welcome gift!`,
        expiresAt:   new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });
  });

  // Notify referrer
  if (referral.referrerUserId) {
    await kafka.publish(KafkaTopics.NOTIFICATION_SEND, {
      recipientType: 'user',
      recipientId:   referral.referrerUserId,
      channels:      ['push'],
      title:         '🎉 Referral Bonus Mila!',
      body:          `${booking.user.name} ne pehli booking ki! Aapko ${REFERRAL.REFERRER_REWARD} coins mile.`,
      deepLink:      `inistnt://coins`,
    }, bookingId);
  }

  // Notify referee
  await kafka.publish(KafkaTopics.NOTIFICATION_SEND, {
    recipientType: 'user',
    recipientId:   booking.userId,
    channels:      ['push'],
    title:         '🪙 First Booking Bonus!',
    body:          `${REFERRAL.REFEREE_REWARD} coins aapke wallet mein add ho gaye!`,
    deepLink:      `inistnt://coins`,
  }, bookingId);

  logger.info({
    bookingId,
    referralId:  referral.id,
    referrerId:  referral.referrerUserId,
    refereeId:   booking.userId,
  }, '[Referral] ✅ Rewards credited');
}
