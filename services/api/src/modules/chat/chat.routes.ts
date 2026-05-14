// ═══════════════════════════════════════════════════════════════════
// INISTNT — In-App Chat Routes + WebSocket
//
// REST Endpoints:
//   GET  /api/v1/chat/:bookingId/messages    — history
//   POST /api/v1/chat/:bookingId/messages    — send (REST fallback)
//   POST /api/v1/chat/:bookingId/read        — mark read
//
// WebSocket:
//   GET  /ws/booking/:bookingId/chat?token=<jwt>
//
// Flow:
//   1. Client connects to WS
//   2. Server subscribes to Redis channel chat:{bookingId}
//   3. When any party sends a message → chatService.sendMessage()
//     → persisted to DB
//     → Redis pub/sub broadcast
//     → all WS subscribers receive it instantly
// ═══════════════════════════════════════════════════════════════════

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verify }       from 'jsonwebtoken';
import { Redis }        from 'ioredis';
import { config }       from '../../config';
import { chatService }  from './chat.service';
import { chatRepo }     from './chat.repository';
import { redis }        from '../../infrastructure/redis';
import { requireUser, requireWorker } from '../../plugins/auth.middleware';
import { logger }       from '../../config/logger';

function wrap(fn: Function) {
  return async (req: any, rep: any) => {
    try { return await fn(req, rep); }
    catch (err: any) {
      if (err.statusCode) return rep.status(err.statusCode).send({ success: false, error: { code: err.code ?? 'ERROR', message: err.message } });
      throw err;
    }
  };
}

// ─── REST Routes ───────────────────────────────────────────────────
export async function chatRoutes(server: FastifyInstance) {

  // ── User routes ──
  server.register(async (s) => {
    s.addHook('preHandler', requireUser);

    // GET /api/v1/chat/:bookingId/messages
    s.get('/:bookingId/messages', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
      const { bookingId } = req.params as { bookingId: string };
      const { before, limit = 50 } = req.query as any;
      const messages = await chatService.getHistory(bookingId, req.currentUser.id, { before, limit: +limit });
      return rep.send({ success: true, data: messages });
    }));

    // POST /api/v1/chat/:bookingId/messages  (REST fallback — WS preferred)
    s.post('/:bookingId/messages', {
      schema: {
        body: {
          type: 'object',
          properties: {
            content:   { type: 'string', maxLength: 1000 },
            mediaUrl:  { type: 'string', format: 'uri' },
            mediaType: { type: 'string', enum: ['image', 'audio'] },
          },
        },
      },
    }, wrap(async (req: FastifyRequest, rep: FastifyReply) => {
      const { bookingId } = req.params as { bookingId: string };
      const { content, mediaUrl, mediaType } = req.body as any;
      const message = await chatService.sendMessage({
        bookingId,
        senderId:   req.currentUser.id,
        senderType: 'user',
        content,
        mediaUrl,
        mediaType,
      });
      return rep.status(201).send({ success: true, data: message });
    }));

    // POST /api/v1/chat/:bookingId/read
    s.post('/:bookingId/read', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
      const { bookingId } = req.params as { bookingId: string };
      await chatService.markRead(bookingId, req.currentUser.id);
      return rep.send({ success: true, data: null });
    }));
  });

  // ── Worker routes ──
  server.register(async (s) => {
    s.addHook('preHandler', requireWorker);

    s.get('/worker/:bookingId/messages', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
      const { bookingId } = req.params as { bookingId: string };
      const { before, limit = 50 } = req.query as any;
      const messages = await chatService.getHistory(bookingId, req.currentUser.id, { before, limit: +limit });
      return rep.send({ success: true, data: messages });
    }));

    s.post('/worker/:bookingId/messages', {
      schema: {
        body: {
          type: 'object',
          properties: {
            content:   { type: 'string', maxLength: 1000 },
            mediaUrl:  { type: 'string', format: 'uri' },
            mediaType: { type: 'string', enum: ['image', 'audio'] },
          },
        },
      },
    }, wrap(async (req: FastifyRequest, rep: FastifyReply) => {
      const { bookingId } = req.params as { bookingId: string };
      const { content, mediaUrl, mediaType } = req.body as any;
      const message = await chatService.sendMessage({
        bookingId,
        senderId:   req.currentUser.id,
        senderType: 'worker',
        content,
        mediaUrl,
        mediaType,
      });
      return rep.status(201).send({ success: true, data: message });
    }));

    s.post('/worker/:bookingId/read', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
      const { bookingId } = req.params as { bookingId: string };
      await chatService.markRead(bookingId, req.currentUser.id);
      return rep.send({ success: true, data: null });
    }));
  });
}

// ─── WebSocket Chat Handler ────────────────────────────────────────
// Register via: server.register(chatWebSocket)
export async function chatWebSocket(server: FastifyInstance) {

  server.get('/ws/booking/:bookingId/chat', {
    websocket: true,
    schema: {
      querystring: {
        type: 'object',
        required: ['token'],
        properties: { token: { type: 'string' } },
      },
    },
  }, async (socket, req) => {
    const { bookingId } = req.params as { bookingId: string };
    const { token } = req.query as { token: string };

    // ── Auth ──────────────────────────────────────────────────
    let currentUser: { id: string; role: 'user' | 'worker' };
    try {
      const decoded = verify(token, config.JWT_ACCESS_SECRET) as any;
      currentUser = { id: decoded.id, role: decoded.role };
    } catch {
      socket.send(JSON.stringify({ type: 'ERROR', code: 'UNAUTHORIZED', message: 'Invalid token.' }));
      socket.close();
      return;
    }

    const senderType = currentUser.role === 'user' ? 'user' : 'worker';

    logger.info({ bookingId, userId: currentUser.id, role: currentUser.role }, '[Chat WS] Client connected');

    // ── Subscribe to Redis pub/sub for this booking's chat ────
    const subscriber = new Redis(config.REDIS_URL ?? `redis://:${config.REDIS_PASSWORD}@${config.REDIS_HOST}:${config.REDIS_PORT}`);
    const channel = `chat:${bookingId}`;
    await subscriber.subscribe(channel);

    // ── Forward Redis messages to WebSocket client ─────────────
    subscriber.on('message', (_chan: string, message: string) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(message);
      }
    });

    // ── Handle incoming WS messages ────────────────────────────
    socket.on('message', async (rawMsg) => {
      try {
        const msg = JSON.parse(rawMsg.toString());

        if (msg.type === 'MESSAGE') {
          // Send message through service (persists + broadcasts)
          const saved = await chatService.sendMessage({
            bookingId,
            senderId:   currentUser.id,
            senderType,
            content:    msg.content,
            mediaUrl:   msg.mediaUrl,
            mediaType:  msg.mediaType,
          });
          // Confirm back to sender
          socket.send(JSON.stringify({ type: 'MESSAGE_SENT', messageId: saved.id }));

        } else if (msg.type === 'READ') {
          await chatService.markRead(bookingId, currentUser.id);

        } else if (msg.type === 'TYPING') {
          // Broadcast typing indicator (ephemeral, not persisted)
          await redis.publish(channel, JSON.stringify({
            type:       'TYPING',
            senderId:   currentUser.id,
            senderType,
            isTyping:   msg.isTyping ?? true,
            bookingId,
          }));
        }
      } catch (err: any) {
        logger.warn({ err, bookingId }, '[Chat WS] Message error');
        socket.send(JSON.stringify({ type: 'ERROR', message: err.message ?? 'Message process nahi hua.' }));
      }
    });

    // ── Heartbeat ──────────────────────────────────────────────
    const pingInterval = setInterval(() => {
      if (socket.readyState === socket.OPEN) socket.ping();
    }, 25_000);

    // ── Cleanup on disconnect ──────────────────────────────────
    socket.on('close', async () => {
      clearInterval(pingInterval);
      await subscriber.unsubscribe(channel);
      subscriber.disconnect();
      logger.info({ bookingId, userId: currentUser.id }, '[Chat WS] Client disconnected');
    });

    socket.on('error', (err) => {
      logger.warn({ err, bookingId }, '[Chat WS] Socket error');
    });

    // ── Send last 20 messages on connect ──────────────────────
    try {
      const history = await chatRepo.getMessages(bookingId, { limit: 20 });
      socket.send(JSON.stringify({ type: 'HISTORY', messages: history }));
      // Mark as read on connect
      await chatService.markRead(bookingId, currentUser.id);
    } catch {}
  });
}
