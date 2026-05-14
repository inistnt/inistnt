// ═══════════════════════════════════════════════════════════════════
// INISTNT — Worker Wallet Credit Service
// Triggered by: BOOKING_COMPLETED Kafka event
//
// Flow:
//   BOOKING_COMPLETED → creditWorkerWallet()
//     → WorkerEarning.create (grossAmount, commission, netAmount)
//     → Worker.walletBalance += netAmount
//     → Worker.totalEarned  += netAmount
//     → Worker.completedJobs += 1
//     → Transaction.create (WORKER_EARNING)
//     → Notify worker via Kafka
// ═══════════════════════════════════════════════════════════════════

import { db }    from '../../infrastructure/database';
import { kafka, KafkaTopics } from '../../infrastructure/kafka';
import { logger } from '../../config/logger';

// Subscription plan → commission reduction (percentage points off platform rate)
const SUBSCRIPTION_COMMISSION_DISCOUNT: Record<string, number> = {
  FREE:     0,
  SILVER:   2,   // 2% off commission
  GOLD:     4,
  PLATINUM: 6,
};

export interface WalletCreditResult {
  earningId:   string;
  grossAmount: number;   // Booking finalAmount (paise)
  commission:  number;   // Platform cut (paise)
  netAmount:   number;   // Worker gets (paise)
  newBalance:  number;   // Worker wallet after credit
}

export async function creditWorkerWallet(bookingId: string): Promise<WalletCreditResult | null> {
  const booking = await db.booking.findUnique({
    where:   { id: bookingId },
    include: {
      worker: {
        include: { subscription: true },
      },
      earning: true,
    },
  });

  if (!booking || !booking.workerId || !booking.worker) {
    logger.warn({ bookingId }, '[WalletCredit] Booking or worker not found');
    return null;
  }

  // Idempotency — already credited?
  if (booking.earning) {
    logger.info({ bookingId }, '[WalletCredit] Already credited, skipping');
    return null;
  }

  const worker           = booking.worker;
  const grossAmount      = booking.finalAmount;                    // What user paid
  const subscriptionPlan = worker.subscription?.plan ?? 'FREE';

  // Effective commission rate (reduced by subscription plan)
  const commissionDiscount = SUBSCRIPTION_COMMISSION_DISCOUNT[subscriptionPlan] ?? 0;
  const effectiveRate      = Math.max(0, booking.commissionRate - commissionDiscount);
  const commission         = Math.round(grossAmount * effectiveRate / 100);
  const netAmount          = grossAmount - commission;

  // WorkerEarning finalAmount = netAmount (no deductions yet — uniform handled separately)
  const result = await db.$transaction(async (tx) => {
    // 1. Create earning record
    const earning = await tx.workerEarning.create({
      data: {
        workerId:         booking.workerId!,
        bookingId:        booking.id,
        grossAmount,
        commission,
        netAmount,
        bonusAmount:      0,
        penaltyAmount:    0,
        uniformDeduction: 0,
        finalAmount:      netAmount,  // Updated if uniform penalty applied later
      },
    });

    // 2. Credit worker wallet
    const updatedWorker = await tx.worker.update({
      where: { id: booking.workerId! },
      data: {
        walletBalance:  { increment: netAmount },
        pendingPayout:  { increment: netAmount },
        totalEarned:    { increment: netAmount },
        completedJobs:  { increment: 1 },
        totalJobs:      { increment: 1 },
      },
    });

    // 3. Create transaction record
    await tx.transaction.create({
      data: {
        workerId:     booking.workerId!,
        bookingId:    booking.id,
        type:         'WORKER_EARNING',
        amount:       netAmount,
        balanceBefore: updatedWorker.walletBalance - netAmount,
        balanceAfter:  updatedWorker.walletBalance,
        description:  `Earning for booking ${booking.bookingNumber} (${effectiveRate}% commission)`,
        metadata: {
          grossAmount,
          commission,
          commissionRate: effectiveRate,
          subscriptionPlan,
        },
      },
    });

    return { earning, newBalance: updatedWorker.walletBalance };
  });

  // 4. Notify worker about earning
  await kafka.publish(KafkaTopics.NOTIFICATION_SEND, {
    recipientType: 'worker',
    recipientId:   booking.workerId,
    channels:      ['push'],
    title:         '💰 Paisa Wallet Mein Aaya!',
    body:          `₹${(netAmount / 100).toFixed(0)} booking #${booking.bookingNumber} ke liye credit ho gaye.`,
    deepLink:      `inistnt-worker://earnings`,
    bookingId:     booking.id,
  }, booking.id);

  logger.info({
    bookingId,
    workerId: booking.workerId,
    grossAmount,
    commission,
    netAmount,
    newBalance: result.newBalance,
  }, '[WalletCredit] ✅ Worker wallet credited');

  return {
    earningId: result.earning.id,
    grossAmount,
    commission,
    netAmount,
    newBalance: result.newBalance,
  };
}

// ─── Called when uniform penalty is later applied ────────────────────────────
export async function applyUniformDeductionToEarning(
  bookingId:   string,
  deduction:   number,  // paise
  note:        string,
): Promise<void> {
  const earning = await db.workerEarning.findUnique({ where: { bookingId } });
  if (!earning) {
    logger.warn({ bookingId }, '[WalletCredit] No earning to deduct from');
    return;
  }

  const newFinalAmount = Math.max(0, earning.finalAmount - deduction);

  await db.$transaction(async (tx) => {
    await tx.workerEarning.update({
      where: { bookingId },
      data: {
        uniformDeduction: { increment: deduction },
        penaltyAmount:    { increment: deduction },
        finalAmount:      newFinalAmount,
      },
    });

    // Deduct from wallet (clamp to 0 — never go negative)
    const worker = await tx.worker.findUnique({
      where:  { id: earning.workerId },
      select: { walletBalance: true, pendingPayout: true },
    });
    const actualDeduction = Math.min(deduction, worker?.walletBalance ?? 0);

    const updated = await tx.worker.update({
      where: { id: earning.workerId },
      data: {
        walletBalance: { decrement: actualDeduction },
        pendingPayout: { decrement: actualDeduction },
      },
    });

    await tx.transaction.create({
      data: {
        workerId:      earning.workerId,
        bookingId,
        type:          'UNIFORM_DEDUCTION',
        amount:        -actualDeduction,   // Negative = debit
        balanceBefore: updated.walletBalance + actualDeduction,
        balanceAfter:  updated.walletBalance,
        description:   note,
        metadata:      { originalDeduction: deduction, actualDeduction },
      },
    });
  });

  logger.info({ bookingId, deduction, newFinalAmount }, '[WalletCredit] Uniform deduction applied');
}
