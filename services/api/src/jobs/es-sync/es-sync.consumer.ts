import { Kafka, logLevel } from 'kafkajs';
import {
  upsertWorker,
  updateWorkerLocation,
  updateWorkerStatus,
  createWorkerIndex,
} from '../../infrastructure/elasticsearch';
import { db }     from '../../infrastructure/database';
import { logger } from '../../config/logger';
import { config } from '../../config';
import { kafka, KafkaTopics } from '../../infrastructure/kafka';

const CONSUMER_GROUP = 'es-sync-service';

const TOPICS = [
  KafkaTopics.WORKER_REGISTERED,
  KafkaTopics.WORKER_VERIFIED,
  KafkaTopics.WORKER_ONLINE,
  KafkaTopics.WORKER_OFFLINE,
  KafkaTopics.WORKER_LOCATION,
  KafkaTopics.WORKER_SUSPENDED,
  KafkaTopics.WORKER_TIER_CHANGED,
  KafkaTopics.REVIEW_CREATED,
];

export async function startEsSyncConsumer() {
  await createWorkerIndex();

  // Create topics via admin first
  const kafkaClient = new Kafka({
    clientId: config.KAFKA_CLIENT_ID + '-es-admin',
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
    logger.info('[ES] Kafka topics ready');
  } catch (err: any) {
    logger.debug(`[ES] Topics init: ${err.message}`);
  } finally {
    await admin.disconnect();
  }

  const consumer = kafka.createConsumer(CONSUMER_GROUP);
  await consumer.connect();
  logger.info('✅ ES Sync Consumer connected');

  await consumer.subscribe({ topics: TOPICS, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return;

      let payload: any;
      try { payload = JSON.parse(message.value.toString()); }
      catch { return; }

      try {
        switch (topic) {
          case KafkaTopics.WORKER_REGISTERED:
          case KafkaTopics.WORKER_VERIFIED:
          case KafkaTopics.WORKER_TIER_CHANGED:
            await syncFullWorker(payload.workerId);
            break;

          case KafkaTopics.WORKER_ONLINE:
            await updateWorkerStatus(payload.workerId, true);
            break;

          case KafkaTopics.WORKER_OFFLINE:
            await updateWorkerStatus(payload.workerId, false);
            break;

          case KafkaTopics.WORKER_SUSPENDED:
            await updateWorkerStatus(payload.workerId, false, 'SUSPENDED');
            break;

          case KafkaTopics.WORKER_LOCATION:
            await updateWorkerLocation(payload.workerId, payload.lat, payload.lng);
            break;

          case KafkaTopics.REVIEW_CREATED:
            if (payload.workerId) await syncFullWorker(payload.workerId);
            break;
        }
      } catch (err) {
        logger.error({ err, topic }, '[ES] Sync error');
      }
    },
  });

  const shutdown = async () => { await consumer.disconnect(); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT',  shutdown);
}

async function syncFullWorker(workerId: string) {
  const w = await db.worker.findUnique({
    where:   { id: workerId },
    include: {
      city:   { select: { nameEn: true } },
      skills: { include: { serviceCategory: { select: { nameEn: true } } } },
    },
  });
  if (!w) return;

  await upsertWorker({
    id:                     w.id,
    name:                   w.name,
    mobile:                 w.mobile,
    cityId:                 w.cityId,
    cityName:               w.city?.nameEn ?? '',
    tier:                   w.tier,
    status:                 w.status,
    isOnline:               w.isOnline,
    rating:                 w.rating,
    totalBookings:          w.totalBookings,
    acceptanceRate:         w.acceptanceRate,
    uniformComplianceScore: w.uniformComplianceScore,
    skillCategoryIds:       w.skills.map((s: any) => s.serviceCategoryId),
    skillCategoryNames:     w.skills.map((s: any) => s.serviceCategory.nameEn),
    lastLocationAt:         w.lastLocationAt?.toISOString(),
    updatedAt:              w.updatedAt.toISOString(),
    ...(w.currentLat && w.currentLng && {
      location: { lat: w.currentLat, lon: w.currentLng },
    }),
  });
  logger.debug({ workerId }, '[ES] Worker synced');
}
