import { Kafka, Consumer, logLevel } from 'kafkajs';
import { config }  from '../config';
import { logger }  from '../logger';
import {
  handleNotificationSend,
  handleBookingAssigned,
  handleBookingCompleted,
  handleBookingCancelled,
  handleWorkerVerified,
  handleSosTriggered,
} from '../handlers/notification.handler';

// ─── TOPICS ──────────────────────────────────────────────────────────────────

const TOPICS = {
  NOTIFICATION_SEND:  'notification.send',
  BOOKING_ASSIGNED:   'booking.assigned',
  BOOKING_COMPLETED:  'booking.completed',
  BOOKING_CANCELLED:  'booking.cancelled',
  WORKER_VERIFIED:    'worker.verified',
  SOS_TRIGGERED:      'sos.triggered',
} as const;

// ─── KAFKA CLIENT ─────────────────────────────────────────────────────────────

const kafka = new Kafka({
  clientId: config.KAFKA_CLIENT_ID,
  brokers:  config.KAFKA_BROKERS,
  logLevel: logLevel.ERROR,
  retry: {
    initialRetryTime: 1000,
    retries:          15,
    factor:           1.5,
    maxRetryTime:     30_000,
  },
});

let consumer: Consumer;

// ─── START ───────────────────────────────────────────────────────────────────

export async function startConsumer(): Promise<void> {
  consumer = kafka.consumer({
    groupId:           config.KAFKA_GROUP_ID,
    sessionTimeout:    30_000,
    heartbeatInterval: 3_000,
    retry:             { retries: 10 },
  });

  // Retry connect loop — Kafka might not be ready immediately
  let connected = false;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await consumer.connect();
      connected = true;
      break;
    } catch (err: any) {
      logger.warn(`Kafka connect attempt ${attempt}/10 failed: ${err.message}. Retrying in 3s...`);
      await sleep(3000);
    }
  }

  if (!connected) {
    throw new Error('Could not connect to Kafka after 10 attempts');
  }

  logger.info('✅ Kafka consumer connected', { groupId: config.KAFKA_GROUP_ID });

  // Create topics first (admin API)
  const admin = kafka.admin();
  try {
    await admin.connect();
    await admin.createTopics({
      waitForLeaders: true,
      topics: Object.values(TOPICS).map(topic => ({
        topic,
        numPartitions:     3,
        replicationFactor: 1,
      })),
    });
    logger.info('✅ Kafka topics ready');
  } catch (err: any) {
    // Topics may already exist — that's fine
    logger.debug(`Topics init: ${err.message}`);
  } finally {
    await admin.disconnect();
  }

  await consumer.subscribe({
    topics:        Object.values(TOPICS),
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return;

      let payload: any;
      try {
        payload = JSON.parse(message.value.toString());
      } catch {
        logger.error({ topic }, 'Failed to parse Kafka message');
        return;
      }

      logger.debug({ topic, key: message.key?.toString() }, '📩 Message received');

      try {
        switch (topic) {
          case TOPICS.NOTIFICATION_SEND:
            await handleNotificationSend(payload);
            break;
          case TOPICS.BOOKING_ASSIGNED:
            await handleBookingAssigned(payload);
            break;
          case TOPICS.BOOKING_COMPLETED:
            await handleBookingCompleted(payload);
            break;
          case TOPICS.BOOKING_CANCELLED:
            await handleBookingCancelled(payload);
            break;
          case TOPICS.WORKER_VERIFIED:
            await handleWorkerVerified(payload);
            break;
          case TOPICS.SOS_TRIGGERED:
            await handleSosTriggered(payload);
            break;
          default:
            logger.debug({ topic }, 'Unknown topic, skipping');
        }
      } catch (err) {
        logger.error({ err, topic, bookingId: payload?.bookingId }, '❌ Handler error');
        // Don't throw — commit offset to avoid infinite retry loop
      }
    },
  });
}

// ─── STOP ────────────────────────────────────────────────────────────────────

export async function stopConsumer(): Promise<void> {
  if (consumer) {
    await consumer.disconnect();
    logger.info('Kafka consumer disconnected');
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
