// ═══════════════════════════════════════════════════════════════════
// INISTNT — WebRTC Signaling Server
//
// Covers TWO features:
//   1. Walky-Talky (PTT — Push-to-Talk)
//   2. Voice Calls (WhatsApp-style, number masked)
//
// Architecture:
//   - Both user and worker connect via WebSocket
//   - This server relays WebRTC signaling (offer/answer/ICE)
//   - Actual audio/video is P2P (WebRTC) — server never sees media
//   - Real phone numbers never shared — only bookingId used as identity
//
// WS Route:
//   /ws/call/:sessionId?token=<jwt>&type=ptt|voice
//
// Session stored in Redis: call:session:{sessionId}
//
// Message Types (client → server):
//   { type: 'OFFER',        sdp }         — WebRTC offer (caller)
//   { type: 'ANSWER',       sdp }         — WebRTC answer (callee)
//   { type: 'ICE_CANDIDATE', candidate }  — ICE candidate exchange
//   { type: 'PTT_START' }                 — Push-to-talk button held
//   { type: 'PTT_STOP' }                  — Push-to-talk button released
//   { type: 'HANGUP' }                    — End call
//   { type: 'DECLINE' }                   — Reject incoming call
//
// Message Types (server → client):
//   { type: 'RINGING' }                   — Callee notified
//   { type: 'ACCEPTED' }                  — Callee answered
//   { type: 'OFFER',        sdp }         — Relayed offer
//   { type: 'ANSWER',       sdp }         — Relayed answer
//   { type: 'ICE_CANDIDATE', candidate }  — Relayed ICE
//   { type: 'PTT_SPEAKING', speakerId }   — Someone is speaking (PTT)
//   { type: 'PTT_SILENT' }                — PTT released
//   { type: 'CALL_ENDED',   reason }      — Call terminated
//   { type: 'ERROR',        message }     — Error
// ═══════════════════════════════════════════════════════════════════

import type { FastifyInstance } from 'fastify';
import type { WebSocket }       from '@fastify/websocket';
import { verify }               from 'jsonwebtoken';
import { config }               from '../../config';
import { db }                   from '../../infrastructure/database';
import { redis }                from '../../infrastructure/redis';
import { kafka, KafkaTopics }   from '../../infrastructure/kafka';
import { logger }               from '../../config/logger';

interface Participant {
  socket:    WebSocket;
  userId:    string;
  role:      'user' | 'worker';
  joinedAt:  Date;
}

// In-memory session map: sessionId → participants
// (Redis used for persistence; this is for fast relay)
const sessions = new Map<string, Map<string, Participant>>();

const SESSION_TTL_SECONDS = 3600; // 1 hour

// ─── Create a call session (REST — called before WS connect) ──────
export async function createCallSession(params: {
  bookingId:     string;
  callType:      'ptt' | 'voice';
  initiatorId:   string;
  initiatorType: 'user' | 'worker';
}): Promise<string> {
  const booking = await db.booking.findUnique({
    where:  { id: params.bookingId },
    select: { userId: true, workerId: true, status: true },
  });
  if (!booking) throw { statusCode: 404, message: 'Booking nahi mili.' };
  if (!booking.workerId) throw { statusCode: 400, message: 'Worker assign nahi hua.' };

  const cancellableCheck = ['CANCELLED_BY_USER', 'CANCELLED_BY_WORKER', 'CANCELLED_BY_ADMIN', 'COMPLETED', 'NO_WORKER_FOUND'];
  if (cancellableCheck.includes(booking.status)) {
    throw { statusCode: 400, code: 'BOOKING_CLOSED', message: 'Yeh booking active nahi hai.' };
  }

  const receiverId   = params.initiatorType === 'user' ? booking.workerId : booking.userId;
  const receiverType = params.initiatorType === 'user' ? 'worker' : 'user';

  // Create session record in DB
  const session = await (db as any).callSession.create({
    data: {
      bookingId:     params.bookingId,
      callType:      params.callType,
      initiatorId:   params.initiatorId,
      initiatorType: params.initiatorType,
      receiverId,
      receiverType,
      status:        'RINGING',
    },
  });

  // Store in Redis for fast WS lookup
  await redis.setex(
    `call:session:${session.id}`,
    SESSION_TTL_SECONDS,
    JSON.stringify({
      sessionId:     session.id,
      bookingId:     params.bookingId,
      callType:      params.callType,
      initiatorId:   params.initiatorId,
      initiatorType: params.initiatorType,
      receiverId,
      receiverType,
      status:        'RINGING',
      createdAt:     new Date().toISOString(),
    }),
  );

  // Notify receiver via Kafka → notification service
  await kafka.publish(KafkaTopics.CALL_INITIATED, {
    sessionId:     session.id,
    bookingId:     params.bookingId,
    callType:      params.callType,
    initiatorId:   params.initiatorId,
    initiatorType: params.initiatorType,
    receiverId,
    receiverType,
  }, params.bookingId).catch(() => {});

  return session.id;
}

// ─── WebRTC Signaling WebSocket Handler ───────────────────────────
export async function webrtcSignaling(server: FastifyInstance) {

  server.get('/ws/call/:sessionId', {
    websocket: true,
    schema: {
      querystring: {
        type:     'object',
        required: ['token'],
        properties: {
          token: { type: 'string' },
          type:  { type: 'string', enum: ['ptt', 'voice'] },
        },
      },
    },
  }, async (socket, req) => {
    const { sessionId } = req.params as { sessionId: string };
    const { token }     = req.query as { token: string };

    // ── Auth ──────────────────────────────────────────────────
    let currentUser: { id: string; role: 'user' | 'worker' };
    try {
      const decoded  = verify(token, config.JWT_ACCESS_SECRET) as any;
      currentUser    = { id: decoded.id, role: decoded.role };
    } catch {
      socket.send(JSON.stringify({ type: 'ERROR', code: 'UNAUTHORIZED', message: 'Invalid token.' }));
      socket.close();
      return;
    }

    // ── Load session from Redis ───────────────────────────────
    const rawSession = await redis.get(`call:session:${sessionId}`);
    if (!rawSession) {
      socket.send(JSON.stringify({ type: 'ERROR', code: 'SESSION_NOT_FOUND', message: 'Call session nahi mili ya expire ho gayi.' }));
      socket.close();
      return;
    }
    const session = JSON.parse(rawSession);

    // ── Verify participant belongs to this session ─────────────
    const isInitiator = session.initiatorId === currentUser.id;
    const isReceiver  = session.receiverId   === currentUser.id;
    if (!isInitiator && !isReceiver) {
      socket.send(JSON.stringify({ type: 'ERROR', code: 'FORBIDDEN', message: 'Yeh call aapki nahi hai.' }));
      socket.close();
      return;
    }

    // ── Register participant ───────────────────────────────────
    if (!sessions.has(sessionId)) sessions.set(sessionId, new Map());
    const room = sessions.get(sessionId)!;

    room.set(currentUser.id, {
      socket,
      userId:   currentUser.id,
      role:     currentUser.role,
      joinedAt: new Date(),
    });

    logger.info({ sessionId, userId: currentUser.id, role: currentUser.role }, '[WebRTC] Participant joined');

    // ── Notify other participant that someone joined ───────────
    const other = [...room.values()].find(p => p.userId !== currentUser.id);
    if (other?.socket.readyState === other?.socket.OPEN) {
      if (isReceiver) {
        // Receiver joined → tell initiator callee is ready
        other.socket.send(JSON.stringify({ type: 'ACCEPTED', callType: session.callType }));
      } else {
        // Initiator joined first → tell them we're ringing
        socket.send(JSON.stringify({ type: 'RINGING', callType: session.callType }));
      }
    } else {
      socket.send(JSON.stringify({ type: 'RINGING', callType: session.callType }));
    }

    // ── Handle signaling messages ──────────────────────────────
    socket.on('message', async (rawMsg) => {
      try {
        const msg    = JSON.parse(rawMsg.toString());
        const target = [...room.values()].find(p => p.userId !== currentUser.id);

        switch (msg.type) {

          case 'OFFER':
          case 'ANSWER':
          case 'ICE_CANDIDATE':
            // Pure relay — server never interprets WebRTC SDP
            if (target?.socket.readyState === target?.socket.OPEN) {
              target.socket.send(JSON.stringify({ type: msg.type, ...msg }));
            }
            break;

          case 'PTT_START':
            // Tell the other party someone is speaking
            if (target?.socket.readyState === target?.socket.OPEN) {
              target.socket.send(JSON.stringify({ type: 'PTT_SPEAKING', speakerId: currentUser.id }));
            }
            break;

          case 'PTT_STOP':
            if (target?.socket.readyState === target?.socket.OPEN) {
              target.socket.send(JSON.stringify({ type: 'PTT_SILENT', speakerId: currentUser.id }));
            }
            break;

          case 'HANGUP':
          case 'DECLINE':
            await endSession(sessionId, currentUser.id, msg.type.toLowerCase());
            // Notify both parties
            for (const p of room.values()) {
              if (p.socket.readyState === p.socket.OPEN) {
                p.socket.send(JSON.stringify({
                  type:      'CALL_ENDED',
                  reason:    msg.type.toLowerCase(),
                  endedById: currentUser.id,
                }));
              }
            }
            break;
        }
      } catch (err: any) {
        logger.warn({ err: err.message, sessionId }, '[WebRTC] Message error');
      }
    });

    // ── Heartbeat ──────────────────────────────────────────────
    const pingInterval = setInterval(() => {
      if (socket.readyState === socket.OPEN) socket.ping();
    }, 25_000);

    // ── Cleanup on disconnect ──────────────────────────────────
    socket.on('close', async () => {
      clearInterval(pingInterval);
      room.delete(currentUser.id);

      // If room empty → session ended by disconnect
      if (room.size === 0) {
        sessions.delete(sessionId);
        await endSession(sessionId, currentUser.id, 'disconnect');
      } else {
        // Notify remaining participant
        const remaining = [...room.values()][0];
        if (remaining?.socket.readyState === remaining?.socket.OPEN) {
          remaining.socket.send(JSON.stringify({ type: 'CALL_ENDED', reason: 'disconnect' }));
        }
      }

      logger.info({ sessionId, userId: currentUser.id }, '[WebRTC] Participant disconnected');
    });

    socket.on('error', (err) => logger.warn({ err, sessionId }, '[WebRTC] Socket error'));
  });
}

// ─── End Session ──────────────────────────────────────────────────
async function endSession(sessionId: string, endedBy: string, reason: string) {
  try {
    await (db as any).callSession.update({
      where: { id: sessionId },
      data: {
        status:     reason === 'decline' ? 'DECLINED' : 'ENDED',
        endedAt:    new Date(),
        endedBy,
        endReason:  reason,
        durationSec: 0, // TODO: calculate from startedAt
      },
    }).catch(() => {});

    await redis.del(`call:session:${sessionId}`);

    await kafka.publish(KafkaTopics.CALL_ENDED, { sessionId, endedBy, reason }, sessionId).catch(() => {});
  } catch {}
}

// ─── Call REST Routes ──────────────────────────────────────────────
export async function callRoutes(server: FastifyInstance) {
  const { requireUser, requireWorker } = await import('../../plugins/auth.middleware');

  function wrap(fn: Function) {
    return async (req: any, rep: any) => {
      try { return await fn(req, rep); }
      catch (err: any) {
        if (err.statusCode) return rep.status(err.statusCode).send({ success: false, error: { code: err.code ?? 'ERROR', message: err.message } });
        throw err;
      }
    };
  }

  // ── User initiates call ────────────────────────────────────
  server.register(async (s) => {
    s.addHook('preHandler', requireUser);

    // POST /api/v1/calls/initiate
    s.post('/initiate', {
      schema: {
        body: {
          type:     'object',
          required: ['bookingId', 'callType'],
          properties: {
            bookingId: { type: 'string' },
            callType:  { type: 'string', enum: ['ptt', 'voice'] },
          },
        },
      },
    }, wrap(async (req: any, rep: any) => {
      const { bookingId, callType } = req.body;
      const sessionId = await createCallSession({
        bookingId,
        callType,
        initiatorId:   req.currentUser.id,
        initiatorType: 'user',
      });
      return rep.status(201).send({
        success: true,
        data: {
          sessionId,
          wsUrl: `/ws/call/${sessionId}`,
          message: `${callType === 'ptt' ? 'Walky-talky' : 'Call'} session shuru. WS se connect karein.`,
        },
      });
    }));

    // GET /api/v1/calls/:sessionId — check session status
    s.get('/:sessionId', wrap(async (req: any, rep: any) => {
      const { sessionId } = req.params;
      const raw = await redis.get(`call:session:${sessionId}`);
      if (!raw) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Session nahi mili.' } });
      return rep.send({ success: true, data: JSON.parse(raw) });
    }));
  });

  // ── Worker initiates call ──────────────────────────────────
  server.register(async (s) => {
    s.addHook('preHandler', requireWorker);

    s.post('/worker/initiate', {
      schema: {
        body: {
          type:     'object',
          required: ['bookingId', 'callType'],
          properties: {
            bookingId: { type: 'string' },
            callType:  { type: 'string', enum: ['ptt', 'voice'] },
          },
        },
      },
    }, wrap(async (req: any, rep: any) => {
      const { bookingId, callType } = req.body;
      const sessionId = await createCallSession({
        bookingId,
        callType,
        initiatorId:   req.currentUser.id,
        initiatorType: 'worker',
      });
      return rep.status(201).send({
        success: true,
        data: {
          sessionId,
          wsUrl: `/ws/call/${sessionId}`,
          message: `${callType === 'ptt' ? 'Walky-talky' : 'Call'} session shuru. WS se connect karein.`,
        },
      });
    }));
  });
}
