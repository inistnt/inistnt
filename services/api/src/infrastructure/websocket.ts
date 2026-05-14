// ═══════════════════════════════════════════════════════════════════
// INISTNT — WebSocket Server (Live Worker Location)
// Plugin: @fastify/websocket
//
// Route:  GET /ws/booking/:bookingId/location
//         User connects → server streams worker GPS every 5s
//
// Flow:
//   1. User connects to WS with JWT token (query param)
//   2. Auth check + booking ownership check
//   3. Subscribe to Redis pub/sub channel: location:{bookingId}
//   4. When worker sends location → WORKER_LOCATION Kafka event
//      → location-publisher subscribes & pushes to Redis channel
//      → WS server receives from Redis → sends to user socket
//
// INSTALL:  pnpm add @fastify/websocket ioredis
//
// REGISTER in server.ts:
//   await app.register(import('@fastify/websocket'))
//   await app.register(locationWebSocket)
// ═══════════════════════════════════════════════════════════════════

import type { FastifyInstance, FastifyRequest } from 'fastify';
import '@fastify/websocket';
import { verify }   from 'jsonwebtoken';
import { Redis }    from 'ioredis';
import { db }       from './database';
import { config }   from '../config';
import { logger }   from '../config/logger';
import { kafka, KafkaTopics } from './kafka';
import { Kafka, logLevel }    from 'kafkajs';

// ─── Redis pub/sub clients ────────────────────────────────────────────────────
// Separate subscriber client required (cannot share with main redis client)
const redisPub = new Redis(config.REDIS_URL);
const redisSub = new Redis(config.REDIS_URL);

const LOCATION_CHANNEL = (bookingId: string) => `loc:${bookingId}`;
const WS_HEARTBEAT_MS  = 25_000;

// ─── In-memory map: bookingId → Set of active WS connections ─────────────────
const rooms = new Map<string, Set<any>>();

// ─── Location Kafka Consumer → Redis pub ──────────────────────────────────────
export async function startLocationPublisher(): Promise<void> {
  const kafkaAdmin = new Kafka({
    clientId: config.KAFKA_CLIENT_ID + '-ws-admin',
    brokers:  config.KAFKA_BROKERS,
    logLevel: logLevel.ERROR,
  }).admin();
  try {
    await kafkaAdmin.connect();
    await kafkaAdmin.createTopics({
      waitForLeaders: true,
      topics: [{ topic: KafkaTopics.WORKER_LOCATION, numPartitions: 3, replicationFactor: 1 }],
    });
  } catch { /* already exists */ }
  finally { await kafkaAdmin.disconnect(); }

  const consumer = kafka.createConsumer('ws-location-publisher');
  await consumer.connect();
  await consumer.subscribe({ topic: KafkaTopics.WORKER_LOCATION, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      let payload: any;
      try { payload = JSON.parse(message.value.toString()); }
      catch { return; }

      const { workerId, lat, lng, bookingId } = payload;
      if (!bookingId || !lat || !lng) return;

      // Push to Redis pub/sub channel for this booking
      const locationMsg = JSON.stringify({
        type:      'WORKER_LOCATION',
        workerId,
        lat,
        lng,
        timestamp: Date.now(),
      });

      await redisPub.publish(LOCATION_CHANNEL(bookingId), locationMsg);
    },
  });

  logger.info('✅ Location Publisher (Kafka → Redis) started');
}

// ─── Redis subscriber: forward to WebSocket rooms ─────────────────────────────
redisSub.on('message', (channel: string, message: string) => {
  // channel = 'loc:{bookingId}'
  const bookingId = channel.replace('loc:', '');
  const sockets   = rooms.get(bookingId);
  if (!sockets || sockets.size === 0) return;

  sockets.forEach((socket) => {
    try {
      if (socket.readyState === 1 /* OPEN */) {
        socket.send(message);
      }
    } catch (err) {
      logger.debug({ err }, '[WS] Failed to send to socket');
    }
  });
});

// ─── Fastify WebSocket Plugin ──────────────────────────────────────────────────
export async function locationWebSocket(app: FastifyInstance) {
  // GET /ws/booking/:bookingId/location?token=<jwt>
  app.get(
    '/ws/booking/:bookingId/location',
    { websocket: true },
    async (socket: any, req: FastifyRequest<{ Params: { bookingId: string }; Querystring: { token?: string } }>) => {
      const { bookingId } = req.params;
      const token         = (req.query as any).token as string | undefined;

      // ── Auth ──────────────────────────────────────────────────────
      if (!token) {
        socket.send(JSON.stringify({ type: 'ERROR', code: 'MISSING_TOKEN' }));
        socket.close();
        return;
      }

      let userId: string;
      try {
        const decoded = verify(token, config.JWT_ACCESS_SECRET) as any;
        userId = decoded.userId;
      } catch {
        socket.send(JSON.stringify({ type: 'ERROR', code: 'INVALID_TOKEN' }));
        socket.close();
        return;
      }

      // ── Booking ownership check ───────────────────────────────────
      const booking = await db.booking.findUnique({
        where:  { id: bookingId },
        select: { userId: true, workerId: true, status: true },
      });

      if (!booking || booking.userId !== userId) {
        socket.send(JSON.stringify({ type: 'ERROR', code: 'FORBIDDEN' }));
        socket.close();
        return;
      }

      // Only stream for active bookings
      const activeStatuses = ['ASSIGNED', 'WORKER_ACCEPTED', 'WORKER_ON_WAY', 'WORKER_ARRIVED', 'OTP_VERIFIED', 'WORK_STARTED'];
      if (!activeStatuses.includes(booking.status)) {
        socket.send(JSON.stringify({ type: 'ERROR', code: 'BOOKING_NOT_ACTIVE' }));
        socket.close();
        return;
      }

      // ── Join room ─────────────────────────────────────────────────
      if (!rooms.has(bookingId)) rooms.set(bookingId, new Set());
      rooms.get(bookingId)!.add(socket);

      // Subscribe to Redis channel for this booking
      await redisSub.subscribe(LOCATION_CHANNEL(bookingId));

      logger.info({ bookingId, userId }, '[WS] Client connected');

      // Send connection confirmation
      socket.send(JSON.stringify({
        type:      'CONNECTED',
        bookingId,
        workerId:  booking.workerId,
        message:   'Location stream shuru ho gaya',
      }));

      // Heartbeat — keep connection alive
      const heartbeat = setInterval(() => {
        try {
          if (socket.readyState === 1) {
            socket.send(JSON.stringify({ type: 'PING', ts: Date.now() }));
          }
        } catch { clearInterval(heartbeat); }
      }, WS_HEARTBEAT_MS);

      // ── Cleanup on disconnect ─────────────────────────────────────
      socket.on('close', async () => {
        clearInterval(heartbeat);
        rooms.get(bookingId)?.delete(socket);

        if (rooms.get(bookingId)?.size === 0) {
          rooms.delete(bookingId);
          await redisSub.unsubscribe(LOCATION_CHANNEL(bookingId));
        }
        logger.info({ bookingId, userId }, '[WS] Client disconnected');
      });

      socket.on('error', (err: Error) => {
        logger.debug({ err, bookingId }, '[WS] Socket error');
      });
    },
  );
}
