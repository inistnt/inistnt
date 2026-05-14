// ═══════════════════════════════════════════════════════════════════
// INISTNT — Support Routes
//
// Ye module SUPPORT_AGENT aur upar ke roles ke liye hai.
// Admin panel ka "Support" tab isi se chalta hai.
// ═══════════════════════════════════════════════════════════════════

import type { FastifyInstance } from 'fastify';
import { requireStaff, requirePermission } from '../../plugins/auth.middleware';
import {
  getLiveDashboard,
  getSupportBookings,
  getSupportBookingDetails,
  reassignWorker,
  addInternalNote,
  getInternalNotes,
  flagForQa,
  getSupportDisputes,
  assignDispute,
  getSupportSos,
  getSupportChats,
  createSupportTicket,
  getChatMessages,
  sendChatMessage,
  resolveChat,
  assignChat,
} from './support.controller';

function wrap(fn: Function) {
  return async (req: any, rep: any) => {
    try {
      return await fn(req, rep);
    } catch (err: any) {
      if (err.statusCode) {
        return rep.status(err.statusCode).send({
          success: false,
          error: { code: err.code ?? 'ERROR', message: err.message },
        });
      }
      req.log?.error(err);
      return rep.status(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Kuch gadbad ho gayi.' },
      });
    }
  };
}

const auth = [requireStaff];
const perm = (p: string) => [...auth, requirePermission(p as any)];

export async function supportRoutes(server: FastifyInstance) {

  // ─── LIVE DASHBOARD ────────────────────────────────────────────
  server.get('/dashboard/live', { preHandler: perm('view:analytics') }, wrap(getLiveDashboard));

  // ─── BOOKINGS ──────────────────────────────────────────────────
  server.get('/bookings',              { preHandler: perm('view:bookings')  }, wrap(getSupportBookings));
  server.get('/bookings/:bookingId',   { preHandler: perm('view:bookings')  }, wrap(getSupportBookingDetails));
  server.post('/bookings/reassign',    { preHandler: perm('manage:bookings') }, wrap(reassignWorker));

  // ─── INTERNAL NOTES ────────────────────────────────────────────
  // POST /support/notes         → add note to any entity
  // GET  /support/notes         → get notes for entity (?entityType=booking&entityId=xyz)
  server.post('/notes', { preHandler: perm('manage:bookings') }, wrap(addInternalNote));
  server.get('/notes',  { preHandler: perm('view:bookings')   }, wrap(getInternalNotes));

  // ─── FLAG FOR QA / FRAUD ───────────────────────────────────────
  server.post('/flag', { preHandler: perm('manage:users') }, wrap(flagForQa));

  // ─── DISPUTES ──────────────────────────────────────────────────
  server.get('/disputes',                          { preHandler: perm('view:disputes')   }, wrap(getSupportDisputes));
  server.post('/disputes/:disputeId/assign',       { preHandler: perm('manage:disputes') }, wrap(assignDispute));

  // ─── SOS ───────────────────────────────────────────────────────
  server.get('/sos', { preHandler: perm('manage:sos') }, wrap(getSupportSos));

  // ─── SUPPORT TICKETS / CHATS ───────────────────────────────────
  server.get('/chats',                             { preHandler: perm('view:bookings')   }, wrap(getSupportChats));
  server.post('/chats',                            { preHandler: perm('manage:bookings') }, wrap(createSupportTicket));
  server.get('/chats/:chatId/messages',            { preHandler: perm('view:bookings')   }, wrap(getChatMessages));
  server.post('/chats/:chatId/messages',           { preHandler: perm('manage:bookings') }, wrap(sendChatMessage));
  server.patch('/chats/:chatId/resolve',           { preHandler: perm('manage:bookings') }, wrap(resolveChat));
  server.patch('/chats/:chatId/assign',            { preHandler: perm('manage:bookings') }, wrap(assignChat));
}
