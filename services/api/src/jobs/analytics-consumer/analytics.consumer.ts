import { Kafka, logLevel } from 'kafkajs';
import { kafka, KafkaTopics } from '../../infrastructure/kafka';
import { config } from '../../config';
import {
  createAnalyticsTables,
  insertBookingEvent,
  insertPaymentEvent,
  insertWorkerLocation,
  insertSosEvent,
} from '../../infrastructure/clickhouse';
import { db }     from '../../infrastructure/database';
import { logger } from '../../config/logger';

const CONSUMER_GROUP = 'analytics-clickhouse';

const TOPICS = [
  KafkaTopics.BOOKING_CREATED,
  KafkaTopics.BOOKING_ASSIGNED,
  KafkaTopics.BOOKING_ACCEPTED,
  KafkaTopics.BOOKING_STARTED,
  KafkaTopics.BOOKING_COMPLETED,
  KafkaTopics.BOOKING_CANCELLED,
  KafkaTopics.BOOKING_NO_WORKER,
  KafkaTopics.PAYMENT_CAPTURED,
  KafkaTopics.PAYMENT_FAILED,
  KafkaTopics.REFUND_PROCESSED,
  KafkaTopics.WORKER_LOCATION,
  KafkaTopics.WORKER_ONLINE,
  KafkaTopics.WORKER_OFFLINE,
  KafkaTopics.SOS_TRIGGERED,
  KafkaTopics.REVIEW_CREATED,
];

const chTs = (d = new Date()) => d.toISOString().replace('T', ' ').slice(0, 19);

export async function startAnalyticsConsumer() {
  await createAnalyticsTables();

  const kafkaClient = new Kafka({
    clientId: config.KAFKA_CLIENT_ID + '-analytics-admin',
    brokers:  config.KAFKA_BROKERS,
    logLevel: logLevel.ERROR,
  });

  const admin = kafkaClient.admin();
  try {
    await admin.connect();
    await admin.createTopics({
      waitForLeaders: true,
      topics: TOPICS.map(topic => ({ topic, numPartitions: 3, replicationFactor: 1 })),
    });
    logger.info('[Analytics] Kafka topics ready');
  } catch (err: any) {
    logger.debug(`[Analytics] Topics init: ${err.message}`);
  } finally {
    await admin.disconnect();
  }

  const consumer = kafka.createConsumer(CONSUMER_GROUP);
  await consumer.connect();
  logger.info('Analytics (ClickHouse) Consumer connected');

  // KafkaJS-safe subscribe (one by one)
  for (const topic of TOPICS) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return;

      let payload: any;
      try { payload = JSON.parse(message.value.toString()); }
      catch { return; }

      try {
        switch (topic) {
          case KafkaTopics.BOOKING_ASSIGNED: {
            // Worker assigned — log as status event (no DB fetch needed, payload has all we need)
            await insertBookingEvent({
              event_type:  'assigned',
              booking_id:  payload.bookingId ?? '',
              user_id:     payload.userId    ?? '',
              worker_id:   payload.workerId  ?? null,
              service_id:  payload.serviceId ?? '',
              category_id: payload.categoryId ?? '',
              city_id:     payload.cityId    ?? '',
              amount:      0,
              discount:    0,
              platform_fee: 0,
              worker_earning: 0,
              created_at:  chTs(),
            });
            break;
          }

          case KafkaTopics.BOOKING_ACCEPTED: {
            await insertBookingEvent({
              event_type:  'accepted',
              booking_id:  payload.bookingId ?? '',
              user_id:     payload.userId    ?? '',
              worker_id:   payload.workerId  ?? null,
              service_id:  payload.serviceId ?? '',
              category_id: payload.categoryId ?? '',
              city_id:     payload.cityId    ?? '',
              amount:      0,
              discount:    0,
              platform_fee: 0,
              worker_earning: 0,
              created_at:  chTs(),
            });
            break;
          }

          case KafkaTopics.BOOKING_STARTED: {
            await insertBookingEvent({
              event_type:  'started',
              booking_id:  payload.bookingId ?? '',
              user_id:     payload.userId    ?? '',
              worker_id:   payload.workerId  ?? null,
              service_id:  payload.serviceId ?? '',
              category_id: payload.categoryId ?? '',
              city_id:     payload.cityId    ?? '',
              amount:      0,
              discount:    0,
              platform_fee: 0,
              worker_earning: 0,
              created_at:  chTs(),
            });
            break;
          }

          case KafkaTopics.BOOKING_CREATED: {
            if (!payload.bookingId) break;
            const b = await db.booking.findUnique({
              where: { id: payload.bookingId },
              include: { service: { select: { categoryId: true } } },
            });
            if (!b) break;

            await insertBookingEvent({
              event_type:     'created',
              booking_id:     b.id,
              booking_number: b.bookingNumber,
              user_id:        b.userId,
              service_id:     b.serviceId,
              category_id:    b.service?.categoryId ?? '',
              city_id:        b.cityId,
              area_id:        b.areaId ?? null,
              amount:         b.finalAmount,
              discount:       b.discountAmount,
              platform_fee:   b.commissionAmount,  // schema mein platformFee nahi — commissionAmount hai
              worker_earning: 0,
              lat:            b.lat,   // Float — non-null
              lng:            b.lng,   // Float — non-null
              created_at:     chTs(b.createdAt),
            });
            break;
          }

          case KafkaTopics.BOOKING_COMPLETED: {
            if (!payload.bookingId) break;
            const b = await db.booking.findUnique({
              where: { id: payload.bookingId },
              select: {
                id: true,
                bookingNumber: true,
                userId: true,
                workerId: true,
                serviceId: true,
                cityId: true,
                areaId: true,                // ✅ added — needed for area_id in insertBookingEvent
                finalAmount: true,
                discountAmount: true,
                commissionAmount: true,      // platform commission = platform_fee in ClickHouse
                createdAt: true,
                workStartedAt: true,         // ✅ FIXED: was 'startedAt' — schema field is 'workStartedAt'
                workCompletedAt: true,       // ✅ using workCompletedAt for duration calc
                completedAt: true,
                service: { select: { categoryId: true } },
              },
            });
            if (!b) break;

            // Duration: work actually started → work completed
            const durationMin = b.workStartedAt && b.workCompletedAt
              ? Math.round((b.workCompletedAt.getTime() - b.workStartedAt.getTime()) / 60000)
              : null;

            await insertBookingEvent({
              event_type:     'completed',
              booking_id:     b.id,
              booking_number: b.bookingNumber,
              user_id:        b.userId,
              worker_id:      b.workerId ?? null,
              service_id:     b.serviceId,
              category_id:    b.service?.categoryId ?? '',
              city_id:        b.cityId,
              area_id:        b.areaId ?? null,   // ✅ added
              amount:         b.finalAmount,
              discount:       b.discountAmount,
              platform_fee:   b.commissionAmount,  // schema mein platformFee nahi — commissionAmount hai
              worker_earning: payload.workerEarning ?? 0,
              duration_min:   durationMin,
              created_at:     chTs(b.createdAt),
            });
            break;
          }

          case KafkaTopics.BOOKING_CANCELLED: {
            await insertBookingEvent({
              event_type: 'cancelled',
              booking_id: payload.bookingId,
              user_id: payload.userId,
              worker_id: payload.workerId ?? null,
              service_id: payload.serviceId ?? '',
              category_id: payload.categoryId ?? '',
              city_id: payload.cityId ?? '',
              amount: payload.amount ?? 0,
              discount: 0,
              platform_fee: 0,
              worker_earning: 0,
              cancel_reason: payload.reason ?? null,
              cancelled_by: payload.cancelledBy ?? null,
              created_at: chTs(),
            });
            break;
          }

          case KafkaTopics.BOOKING_NO_WORKER: {
            await insertBookingEvent({
              event_type: 'no_worker',
              booking_id: payload.bookingId,
              user_id: payload.userId,
              service_id: '',
              category_id: '',
              city_id: payload.cityId ?? '',
              amount: 0,
              discount: 0,
              platform_fee: 0,
              worker_earning: 0,
              created_at: chTs(),
            });
            break;
          }

          case KafkaTopics.PAYMENT_CAPTURED: {
            const b = payload.bookingId
              ? await db.booking.findUnique({ where: { id: payload.bookingId }, select: { cityId: true } })
              : null;

            await insertPaymentEvent({
              event_type: 'captured',
              payment_id: payload.paymentId,
              booking_id: payload.bookingId,
              user_id: payload.userId,
              worker_id: payload.workerId ?? null,
              amount: payload.amount ?? 0,
              method: payload.method ?? null,
              city_id: b?.cityId ?? null,
              created_at: chTs(),
            });
            break;
          }

          case KafkaTopics.PAYMENT_FAILED: {
            await insertPaymentEvent({
              event_type: 'failed',
              payment_id: payload.paymentId ?? '',
              booking_id: payload.bookingId,
              user_id: payload.userId,
              amount: payload.amount ?? 0,
              created_at: chTs(),
            });
            break;
          }

          case KafkaTopics.REFUND_PROCESSED: {
            await insertPaymentEvent({
              event_type: 'refund',
              payment_id: payload.paymentId,
              booking_id: payload.bookingId,
              user_id: payload.userId,
              amount: payload.amount ?? 0,
              created_at: chTs(),
            });
            break;
          }

          case KafkaTopics.WORKER_LOCATION: {
            if (payload.workerId && typeof payload.lat === 'number' && typeof payload.lng === 'number' && Math.random() < 0.1) {
              await insertWorkerLocation({
                worker_id: payload.workerId,
                city_id: payload.cityId ?? '',
                lat: payload.lat,
                lng: payload.lng,
                is_online: 1,
              });
            }
            break;
          }

          case KafkaTopics.WORKER_ONLINE: {
            if (payload.workerId && typeof payload.lat === 'number' && typeof payload.lng === 'number') {
              await insertWorkerLocation({
                worker_id: payload.workerId,
                city_id: payload.cityId ?? '',
                lat: payload.lat,
                lng: payload.lng,
                is_online: 1,
              });
            }
            break;
          }

          case KafkaTopics.WORKER_OFFLINE: {
            if (payload.workerId && typeof payload.lat === 'number' && typeof payload.lng === 'number') {
              await insertWorkerLocation({
                worker_id: payload.workerId,
                city_id: payload.cityId ?? '',
                lat: payload.lat,
                lng: payload.lng,
                is_online: 0,
              });
            }
            break;
          }

          case KafkaTopics.SOS_TRIGGERED: {
            const booking = payload.bookingId
              ? await db.booking.findUnique({ where: { id: payload.bookingId }, select: { cityId: true } })
              : null;

            await insertSosEvent({
              sos_id: payload.sosId,
              booking_id: payload.bookingId,
              triggered_by: payload.triggeredBy ?? 'unknown',
              city_id: booking?.cityId ?? '',
              lat: payload.lat ?? null,
              lng: payload.lng ?? null,
              created_at: chTs(),
            });
            break;
          }

          case KafkaTopics.REVIEW_CREATED: {
            await insertBookingEvent({
              event_type: 'reviewed',
              booking_id: payload.bookingId,
              user_id: payload.userId,
              worker_id: payload.workerId,
              service_id: '',
              category_id: '',
              city_id: payload.cityId ?? '',
              amount: 0,
              discount: 0,
              platform_fee: 0,
              worker_earning: 0,
              rating: payload.rating,
              created_at: chTs(),
            });
            break;
          }
        }
      } catch (err) {
        logger.error({ err, topic }, '[Analytics] Insert error');
      }
    },
  });

  const shutdown = async () => {
    await consumer.disconnect();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
