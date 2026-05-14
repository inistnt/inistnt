import { db }    from '../../infrastructure/database';
import { kafka, KafkaTopics } from '../../infrastructure/kafka';
import { logger } from '../../config/logger';

// ─── STALE BOOKING AUTO-CANCEL ────────────────────────────────
// Every 5 minutes:
//   SEARCHING bookings > 10 min old   → NO_WORKER_FOUND
//   ASSIGNED  bookings > 30 min (worker never accepted) → cancel

export function startStaleBookingsCron() {
  logger.info('✅ Stale bookings cron started (every 5 min)');

  const run = async () => {
    try {
      const now = new Date();

      // 1. SEARCHING > 10 min → no worker found
      const searchingCutoff = new Date(now.getTime() - 10 * 60 * 1000);
      const staleSearching = await db.booking.findMany({
        where: {
          status:    'SEARCHING',
          createdAt: { lt: searchingCutoff },
        },
        select: { id: true, userId: true, cityId: true },
      });

      for (const b of staleSearching) {
        await db.booking.update({
          where: { id: b.id },
          data:  { status: 'NO_WORKER_FOUND', updatedAt: now },
        });
        await kafka.publish(KafkaTopics.BOOKING_NO_WORKER, {
          bookingId: b.id, userId: b.userId,
        }, b.id);
        logger.info({ bookingId: b.id }, '[Cron] Stale SEARCHING booking → NO_WORKER_FOUND');
      }

      // 2. ASSIGNED > 30 min (worker never accepted) → cancel
      const assignedCutoff = new Date(now.getTime() - 30 * 60 * 1000);
      const staleAssigned = await db.booking.findMany({
        where: {
          status:     'ASSIGNED',
          assignedAt: { lt: assignedCutoff },
        },
        select: { id: true, userId: true, workerId: true },
      });

      for (const b of staleAssigned) {
        await db.booking.update({
          where: { id: b.id },
          data: {
            status:             'CANCELLED_BY_ADMIN',  // Valid BookingStatus enum value
            cancelledByRole:    'system',               // Schema field: cancelledByRole
            cancellationReason: 'Worker ne time par accept nahi kiya.',  // Schema field: cancellationReason
            cancelledAt:        now,
          },
        });
        await kafka.publish(KafkaTopics.BOOKING_CANCELLED, {
          bookingId: b.id, userId: b.userId, workerId: b.workerId,
          cancelledBy: 'system', reason: 'Worker timeout',
        }, b.id);
        logger.info({ bookingId: b.id }, '[Cron] Stale ASSIGNED booking → CANCELLED');
      }

      if (staleSearching.length > 0 || staleAssigned.length > 0) {
        logger.info({ searching: staleSearching.length, assigned: staleAssigned.length }, '[Cron] Stale bookings cleaned');
      }
    } catch (err) {
      logger.error({ err }, '[Cron] Stale bookings error');
    }
  };

  // Run immediately, then every 5 minutes
  run();
  const interval = setInterval(run, 5 * 60 * 1000);

  // Cleanup on shutdown
  process.on('SIGTERM', () => clearInterval(interval));
  process.on('SIGINT',  () => clearInterval(interval));
}
