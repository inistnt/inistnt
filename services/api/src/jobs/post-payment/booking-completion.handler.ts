// ═══════════════════════════════════════════════════════════════════
// INISTNT — Booking Completion Handler
// Subscribes to: BOOKING_COMPLETED Kafka topic
//
// Runs in parallel (Promise.allSettled):
//   1. creditWorkerWallet()   — Worker ko earning credit
//   2. earnLoyaltyPoints()    — User ko loyalty coins
//   3. processReferralReward() — Referral bonus (only on first booking)
//
// USAGE: import { startBookingCompletionHandler } from './booking-completion.handler'
//        Call in server.ts startup
// ═══════════════════════════════════════════════════════════════════

import { Kafka, logLevel }    from 'kafkajs';
import { kafka, KafkaTopics } from '../../infrastructure/kafka';
import { config }             from '../../config';
import { logger }             from '../../config/logger';
import { creditWorkerWallet } from './wallet-credit.service';
import { earnLoyaltyPoints }  from './loyalty-points.service';
import { processReferralReward } from './referral-reward.service';
import { loanRepo }           from '../../modules/workers/worker-loan.routes';
import { handleBookingCompletedForFraud } from '../fraud/fraud-detection.service';
import { db }                 from '../../infrastructure/database';

const CONSUMER_GROUP = 'booking-completion-handler';

export async function startBookingCompletionHandler(): Promise<void> {
  // Ensure topic exists
  const kafkaAdmin = new Kafka({
    clientId: config.KAFKA_CLIENT_ID + '-completion-admin',
    brokers:  config.KAFKA_BROKERS,
    logLevel: logLevel.ERROR,
  }).admin();

  try {
    await kafkaAdmin.connect();
    await kafkaAdmin.createTopics({
      waitForLeaders: true,
      topics: [{ topic: KafkaTopics.BOOKING_COMPLETED, numPartitions: 3, replicationFactor: 1 }],
    });
  } catch { /* topics already exist */ }
  finally { await kafkaAdmin.disconnect(); }

  const consumer = kafka.createConsumer(CONSUMER_GROUP);
  await consumer.connect();
  await consumer.subscribe({ topic: KafkaTopics.BOOKING_COMPLETED, fromBeginning: false });

  logger.info('✅ Booking Completion Handler started');

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;

      let payload: { bookingId?: string };
      try { payload = JSON.parse(message.value.toString()); }
      catch { return; }

      const { bookingId } = payload;
      if (!bookingId) return;

      logger.info({ bookingId }, '[CompletionHandler] Processing...');

      // Worker + userId fetch for fraud detection
      const booking = await db.booking.findUnique({
        where:  { id: bookingId },
        select: { workerId: true, userId: true },
      });

      // Run all post-completion jobs in parallel — one failure doesn't block others
      const jobs: Promise<any>[] = [
        creditWorkerWallet(bookingId),
        earnLoyaltyPoints(bookingId),
        processReferralReward(bookingId),
      ];

      // Loan EMI deduction (if worker has active loan)
      if (booking?.workerId) {
        jobs.push(loanRepo.deductEmi(booking.workerId, bookingId));
      }

      // Fraud detection check
      if (booking?.workerId && booking?.userId) {
        jobs.push(handleBookingCompletedForFraud({
          bookingId,
          userId:   booking.userId,
          workerId: booking.workerId,
        }));
      }

      const results = await Promise.allSettled(jobs);

      const names = ['WalletCredit', 'LoyaltyPoints', 'ReferralReward', 'LoanEmi', 'FraudCheck'];
      results.forEach((result, idx) => {
        if (result.status === 'rejected') {
          logger.error({ bookingId, job: names[idx] ?? `Job${idx}`, err: result.reason },
            '[CompletionHandler] Job failed');
        } else {
          logger.debug({ bookingId, job: names[idx] ?? `Job${idx}` }, '[CompletionHandler] Job ok');
        }
      });
    },
  });

  const shutdown = async () => { await consumer.disconnect(); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT',  shutdown);
}
