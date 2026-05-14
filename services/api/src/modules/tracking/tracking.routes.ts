// ═══════════════════════════════════════════════════════════════════
// INISTNT — Real-Time GPS Tracking
//
// Architecture:
//   Worker App → POST /tracking/update  (every 5 seconds)
//     → Redis SET worker:{id}:location
//     → DB upsert WorkerLiveLocation
//     → Redis PUBLISH to channel
//
//   User App   → GET  /tracking/booking/:bookingId  (SSE stream)
//     → Subscribe Redis channel
//     → Push location updates to client via SSE
//
// SSE stays alive max 10 minutes (battery/data saver)
// Redis TTL: 60 seconds (if no update, worker considered offline)
// ═══════════════════════════════════════════════════════════════════

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireUser, requireWorker } from '../../plugins/auth.middleware';
import { db }     from '../../infrastructure/database';
import { redis }  from '../../infrastructure/redis';
import { logger } from '../../config/logger';

const LOCATION_TTL_SEC  = 60;   // Redis key expires in 60s if no new update
const SSE_MAX_DURATION  = 10 * 60 * 1000; // 10 min max SSE connection
const UPDATE_INTERVAL   = 5000; // Poll Redis every 5 seconds for SSE

function wrap(fn: Function) {
  return async (req: any, rep: any) => {
    try { return await fn(req, rep); }
    catch (err: any) {
      if (err.statusCode) return rep.status(err.statusCode).send({ success: false, error: { code: err.code ?? 'ERROR', message: err.message } });
      req.log?.error(err);
      return rep.status(500).send({ success: false, error: { code: 'SERVER_ERROR', message: err.message ?? 'Kuch gadbad ho gayi.' } });
    }
  };
}

// ─── Redis location key helpers ────────────────────────────────────
const locationKey = (workerId: string) => `worker:${workerId}:location`;

interface LocationPayload {
  lat:       number;
  lng:       number;
  accuracy?: number;
  speed?:    number;
  bearing?:  number;
  ts:        number;
  workerId:  string;
}

// ─── WORKER: Push location update ─────────────────────────────────
async function updateWorkerLocation(req: FastifyRequest, rep: FastifyReply) {
  const workerId = (req as any).currentUser.id;
  const { lat, lng, accuracy, speed, bearing, bookingId } = req.body as any;

  if (!lat || !lng) {
    return rep.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'lat, lng required' } });
  }

  const payload: LocationPayload = {
    lat, lng, accuracy, speed, bearing,
    ts: Date.now(),
    workerId,
  };

  // Write to Redis (hot path — fast)
  await redis.setex(locationKey(workerId), LOCATION_TTL_SEC, JSON.stringify(payload));

  // Publish to active SSE subscribers
  await redis.publish(`location:${workerId}`, JSON.stringify(payload));

  // Persist to DB asynchronously (don't await — non-blocking)
  db.workerLiveLocation.upsert({
    where:  { workerId },
    create: { workerId, lat, lng, accuracy, speed, bearing, bookingId },
    update: { lat, lng, accuracy, speed, bearing, bookingId, updatedAt: new Date() },
  }).catch(err => logger.warn({ err: err.message }, '[Tracking] DB upsert failed'));

  return rep.send({ success: true, data: { received: true, ts: payload.ts } });
}

// ─── WORKER: Go offline ────────────────────────────────────────────
async function workerGoOffline(req: FastifyRequest, rep: FastifyReply) {
  const workerId = (req as any).currentUser.id;
  await redis.del(locationKey(workerId));
  await redis.publish(`location:${workerId}`, JSON.stringify({ offline: true, workerId, ts: Date.now() }));

  logger.info({ workerId }, '[Tracking] Worker went offline');
  return rep.send({ success: true });
}

// ─── USER: Get current worker location (one-shot) ─────────────────
async function getWorkerLocationSnapshot(req: FastifyRequest, rep: FastifyReply) {
  const { bookingId } = req.params as any;

  const booking = await db.booking.findUnique({
    where:  { id: bookingId },
    select: { workerId: true, userId: true, status: true },
  });

  if (!booking) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } });

  // Only the booking's user can track
  const userId = (req as any).currentUser.id;
  if (booking.userId !== userId) return rep.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Aap sirf apni booking track kar sakte hain' } });

  // Only track for active bookings
  const trackableStatuses = ['ASSIGNED', 'WORKER_ACCEPTED', 'WORKER_ARRIVED', 'WORK_STARTED'];
  if (!trackableStatuses.includes(booking.status)) {
    return rep.status(400).send({ success: false, error: { code: 'NOT_TRACKABLE', message: 'Booking active nahi hai' } });
  }

  if (!booking.workerId) return rep.status(404).send({ success: false, error: { code: 'NO_WORKER', message: 'Worker assign nahi hua' } });

  const raw = await redis.get(locationKey(booking.workerId));
  if (!raw) {
    return rep.send({ success: true, data: { online: false, location: null, message: 'Worker offline hai' } });
  }

  const location = JSON.parse(raw) as LocationPayload;
  return rep.send({
    success: true,
    data: {
      online:    true,
      location:  { lat: location.lat, lng: location.lng, accuracy: location.accuracy, speed: location.speed, bearing: location.bearing },
      updatedAt: new Date(location.ts).toISOString(),
    },
  });
}

// ─── USER: SSE stream — live location ─────────────────────────────
async function streamWorkerLocation(req: FastifyRequest, rep: FastifyReply) {
  const { bookingId } = req.params as any;
  const userId = (req as any).currentUser.id;

  const booking = await db.booking.findUnique({
    where:  { id: bookingId },
    select: { workerId: true, userId: true, status: true },
  });

  if (!booking || booking.userId !== userId) {
    return rep.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
  }

  if (!booking.workerId) {
    return rep.status(400).send({ success: false, error: { code: 'NO_WORKER', message: 'Worker assign nahi hua' } });
  }

  const workerId = booking.workerId;

  // ── Set SSE headers ───────────────────────────────────────────
  rep.raw.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no', // Nginx: disable buffering
  });

  const write = (event: string, data: any) => {
    try {
      rep.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch { /* client disconnected */ }
  };

  // Send initial location
  const initial = await redis.get(locationKey(workerId));
  if (initial) {
    const loc = JSON.parse(initial) as LocationPayload;
    write('location', { lat: loc.lat, lng: loc.lng, bearing: loc.bearing, speed: loc.speed, ts: loc.ts });
  } else {
    write('status', { online: false });
  }

  // ── Subscribe to Redis pub/sub ─────────────────────────────────
  const sub = redis.duplicate();
  await sub.subscribe(`location:${workerId}`);

  sub.on('message', (_channel: string, message: string) => {
    try {
      const payload = JSON.parse(message);
      if (payload.offline) {
        write('status', { online: false });
        return;
      }
      write('location', {
        lat:     payload.lat,
        lng:     payload.lng,
        bearing: payload.bearing,
        speed:   payload.speed,
        ts:      payload.ts,
      });
    } catch { /* parse error */ }
  });

  // ── Heartbeat — keep connection alive ─────────────────────────
  const heartbeat = setInterval(() => {
    try { rep.raw.write(': heartbeat\n\n'); }
    catch { clearInterval(heartbeat); }
  }, 30_000);

  // ── Cleanup on disconnect ─────────────────────────────────────
  const cleanup = () => {
    clearInterval(heartbeat);
    sub.unsubscribe().catch(() => {});
    sub.quit().catch(() => {});
  };

  req.raw.on('close', cleanup);
  req.raw.on('error', cleanup);

  // ── Auto-close after max duration ─────────────────────────────
  setTimeout(() => {
    write('status', { timeout: true, message: 'Reconnect karein' });
    cleanup();
    rep.raw.end();
  }, SSE_MAX_DURATION);
}

// ─── ROUTE REGISTRATION ───────────────────────────────────────────

export async function trackingWorkerRoutes(server: FastifyInstance) {
  server.post('/update',      { preHandler: [requireWorker] }, wrap(updateWorkerLocation));
  server.post('/go-offline',  { preHandler: [requireWorker] }, wrap(workerGoOffline));
}

export async function trackingUserRoutes(server: FastifyInstance) {
  // Snapshot (one-shot HTTP)
  server.get('/booking/:bookingId',          { preHandler: [requireUser] }, wrap(getWorkerLocationSnapshot));
  // Live stream (SSE)
  server.get('/booking/:bookingId/stream',   { preHandler: [requireUser] }, streamWorkerLocation);
}
