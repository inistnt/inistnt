// ═══════════════════════════════════════════════════════════════════
// INISTNT — Uniform Check Reward/Penalty Handler
// Subscribes to: UNIFORM_CHECK_DONE Kafka topic
//
// Decision tree:
//   COMPLIANT   → +₹10 bonus (₹1000 paise) to worker earning
//   NON_COMPLIANT → -₹50 penalty (₹5000 paise), update compliance score
//   UNSURE/SKIPPED → no action, compliance score unchanged
//
// Updates:
//   WorkerEarning.uniformDeduction / bonusAmount / finalAmount
//   Worker.uniformComplianceScore (rolling average)
//   Worker.walletBalance
//   Transaction record
//   Notify worker
// ═══════════════════════════════════════════════════════════════════

import { db }    from '../../infrastructure/database';
import { kafka, KafkaTopics } from '../../infrastructure/kafka';
import { logger } from '../../config/logger';
import { applyUniformDeductionToEarning } from '../post-payment/wallet-credit.service';
import { Kafka, logLevel }    from 'kafkajs';
import { config }             from '../../config';
import { runFaceMatchForBooking } from '../../infrastructure/ai.service';

const UNIFORM = {
  BONUS_PAISE:       1_000,   // ₹10 bonus for compliant
  PENALTY_PAISE:     5_000,   // ₹50 penalty for non-compliant
  SCORE_WINDOW:      20,      // Rolling average over last N checks
};

export async function startUniformCheckHandler(): Promise<void> {
  const kafkaAdmin = new Kafka({
    clientId: config.KAFKA_CLIENT_ID + '-uniform-admin',
    brokers:  config.KAFKA_BROKERS,
    logLevel: logLevel.ERROR,
  }).admin();
  try {
    await kafkaAdmin.connect();
    await kafkaAdmin.createTopics({
      waitForLeaders: true,
      topics: [{ topic: KafkaTopics.UNIFORM_CHECK_DONE, numPartitions: 3, replicationFactor: 1 }],
    });
  } catch { /* already exists */ }
  finally { await kafkaAdmin.disconnect(); }

  const consumer = kafka.createConsumer('uniform-check-handler');
  await consumer.connect();
  await consumer.subscribe({ topic: KafkaTopics.UNIFORM_CHECK_DONE, fromBeginning: false });
  logger.info('✅ Uniform Check Handler started');

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      let payload: { checkId?: string; bookingId?: string };
      try { payload = JSON.parse(message.value.toString()); }
      catch { return; }

      const { checkId, bookingId } = payload;
      if (!checkId && !bookingId) return;

      try {
        await processUniformCheck(checkId, bookingId);
      } catch (err) {
        logger.error({ err, checkId, bookingId }, '[Uniform] Handler error');
      }
    },
  });

  const shutdown = async () => { await consumer.disconnect(); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT',  shutdown);
}

async function processUniformCheck(checkId?: string, bookingId?: string): Promise<void> {
  const check = await db.uniformCheck.findUnique({
    where: checkId ? { id: checkId } : { bookingId: bookingId! },
  });
  if (!check) return;

  // Already processed (amountDeducted or bonus set)
  if (check.amountDeducted > 0 || check.deductionNote?.startsWith('PROCESSED')) return;

  // ── Face Match Check (runs in parallel with uniform check) ──────
  // Compare booking selfie with worker's stored ID photo
  const faceMatch = await runFaceMatchForBooking(check.workerId, check.selfieUrl).catch(err => {
    logger.warn({ err: err.message, checkId: check.id }, '[Uniform] Face match failed — skipping');
    return null;
  });

  // Store face match result in uniform check record
  if (faceMatch) {
    await db.uniformCheck.update({
      where: { id: check.id },
      data:  {
        metadata: {
          faceMatch: {
            result:      faceMatch.result,
            confidence:  faceMatch.confidence,
            reason:      faceMatch.reason,
          },
        },
      } as any,
    }).catch(() => {}); // Don't fail if metadata column doesn't exist
  }

  // If NO_MATCH with high confidence → flag as fraud (potential impersonation)
  if (faceMatch?.result === 'NO_MATCH' && faceMatch.confidence > 0.80) {
    await db.fraudFlag.create({
      data: {
        type:           'IDENTITY_FRAUD' as any,
        severity:       'CRITICAL' as any,
        description:    `Face mismatch detected at booking start. Selfie aur ID photo match nahi karte. Confidence: ${(faceMatch.confidence * 100).toFixed(0)}%`,
        workerId:       check.workerId,
        bookingId:      check.bookingId,
        isAutoDetected: true,
      },
    }).catch(() => {});

    // Notify support
    await kafka.publish(KafkaTopics.NOTIFICATION_SEND, {
      recipientType: 'staff',
      channels:      ['push'],
      title:         '🚨 Face Mismatch Alert',
      body:          `Worker identity mismatch detected! Booking ${check.bookingId} — immediate review required.`,
      deepLink:      `/support/fraud-flags`,
    }, check.bookingId).catch(() => {});

    logger.warn({ checkId: check.id, workerId: check.workerId, confidence: faceMatch.confidence }, '[Uniform] ⚠️ Face mismatch — fraud flag created');
  }

  const finalResult = check.finalResult;

  if (finalResult === 'COMPLIANT') {
    await handleCompliant(check);
  } else if (finalResult === 'NON_COMPLIANT') {
    await handleNonCompliant(check);
  } else {
    // UNSURE or SKIPPED — just update compliance score slightly negative
    await updateComplianceScore(check.workerId, 0.8);
    logger.info({ checkId: check.id }, '[Uniform] Unsure/Skipped — score slightly reduced');
  }
}

// ─── COMPLIANT: Bonus ─────────────────────────────────────────────────────────
async function handleCompliant(check: any): Promise<void> {
  const earning = await db.workerEarning.findUnique({ where: { bookingId: check.bookingId } });
  if (!earning) return;

  await db.$transaction(async (tx) => {
    // Add bonus to earning
    await tx.workerEarning.update({
      where: { bookingId: check.bookingId },
      data: {
        bonusAmount: { increment: UNIFORM.BONUS_PAISE },
        finalAmount: { increment: UNIFORM.BONUS_PAISE },
      },
    });

    // Credit wallet
    const updated = await tx.worker.update({
      where: { id: check.workerId },
      data: {
        walletBalance: { increment: UNIFORM.BONUS_PAISE },
        pendingPayout: { increment: UNIFORM.BONUS_PAISE },
      },
    });

    await tx.transaction.create({
      data: {
        workerId:      check.workerId,
        bookingId:     check.bookingId,
        type:          'WORKER_BONUS',
        amount:        UNIFORM.BONUS_PAISE,
        balanceBefore: updated.walletBalance - UNIFORM.BONUS_PAISE,
        balanceAfter:  updated.walletBalance,
        description:   'Uniform compliance bonus — Sahi uniform pehna!',
        metadata:      { checkId: check.id, result: 'COMPLIANT' },
      },
    });

    // Mark check as processed
    await tx.uniformCheck.update({
      where: { id: check.id },
      data:  { deductionNote: 'PROCESSED:BONUS' },
    });
  });

  // Update compliance score (towards 1.0)
  await updateComplianceScore(check.workerId, 1.0);

  // Notify worker
  await kafka.publish(KafkaTopics.NOTIFICATION_SEND, {
    recipientType: 'worker',
    recipientId:   check.workerId,
    channels:      ['push'],
    title:         '✅ Uniform Bonus Mila!',
    body:          `₹${UNIFORM.BONUS_PAISE / 100} uniform compliance bonus aapke wallet mein add ho gaya!`,
    deepLink:      `inistnt-worker://earnings`,
    bookingId:     check.bookingId,
  }, check.bookingId);

  logger.info({ checkId: check.id, workerId: check.workerId }, '[Uniform] ✅ Bonus credited');
}

// ─── NON_COMPLIANT: Penalty ───────────────────────────────────────────────────
async function handleNonCompliant(check: any): Promise<void> {
  // Apply deduction via wallet-credit service (clamps to wallet balance)
  await applyUniformDeductionToEarning(
    check.bookingId,
    UNIFORM.PENALTY_PAISE,
    `Uniform penalty — Galat ya missing uniform. ₹${UNIFORM.PENALTY_PAISE / 100} kat gaye.`,
  );

  // Record on uniform_check table
  await db.uniformCheck.update({
    where: { id: check.id },
    data: {
      amountDeducted: UNIFORM.PENALTY_PAISE,
      deductionNote:  'PROCESSED:PENALTY',
    },
  });

  // Update compliance score (towards 0)
  await updateComplianceScore(check.workerId, 0.0);

  // Notify worker
  await kafka.publish(KafkaTopics.NOTIFICATION_SEND, {
    recipientType: 'worker',
    recipientId:   check.workerId,
    channels:      ['push'],
    title:         '⚠️ Uniform Penalty Laga',
    body:          `₹${UNIFORM.PENALTY_PAISE / 100} uniform non-compliance ki wajah se kat gaye. Kripya apni uniform sahi rakhein.`,
    deepLink:      `inistnt-worker://uniform-guide`,
    bookingId:     check.bookingId,
  }, check.bookingId);

  logger.info({ checkId: check.id, workerId: check.workerId }, '[Uniform] ❌ Penalty applied');
}

// ─── Rolling compliance score update ─────────────────────────────────────────
async function updateComplianceScore(workerId: string, thisCheck: number): Promise<void> {
  const worker = await db.worker.findUnique({
    where:  { id: workerId },
    select: { uniformComplianceScore: true },
  });
  if (!worker) return;

  // Exponential moving average with window = SCORE_WINDOW
  const alpha    = 1 / UNIFORM.SCORE_WINDOW;
  const newScore = worker.uniformComplianceScore * (1 - alpha) + thisCheck * alpha;

  await db.worker.update({
    where: { id: workerId },
    data:  { uniformComplianceScore: Math.max(0, Math.min(1, newScore)) },
  });
}
