import type { FastifyRequest, FastifyReply } from 'fastify';
import { supportRepo } from './support.repository';

// ─── LIVE DASHBOARD ───────────────────────────────────────────────────────────
export async function getLiveDashboard(_req: FastifyRequest, rep: FastifyReply) {
  const data = await supportRepo.getLiveDashboard();
  return rep.send({ success: true, data });
}

// ─── BOOKINGS ─────────────────────────────────────────────────────────────────
export async function getSupportBookings(req: FastifyRequest, rep: FastifyReply) {
  const q = req.query as any;
  const data = await supportRepo.getBookings({
    status:  q.status,
    cityId:  q.cityId,
    search:  q.search,
    page:    q.page  ? parseInt(q.page)  : 1,
    limit:   q.limit ? parseInt(q.limit) : 20,
  });
  return rep.send({ success: true, ...data });
}

export async function getSupportBookingDetails(req: FastifyRequest, rep: FastifyReply) {
  const { bookingId } = req.params as any;
  const booking = await supportRepo.getBookingDetails(bookingId);
  if (!booking) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Booking nahi mila' } });

  const internalNotes = await supportRepo.getBookingInternalNotes(bookingId);
  return rep.send({ success: true, data: { ...booking, internalNotes } });
}

export async function reassignWorker(req: FastifyRequest, rep: FastifyReply) {
  const { bookingId, newWorkerId, reason } = req.body as any;
  if (!bookingId || !newWorkerId || !reason) {
    return rep.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'bookingId, newWorkerId, reason required' } });
  }

  const staffId = (req as any).currentUser.id;
  const data = await supportRepo.reassignWorker(bookingId, newWorkerId, reason, staffId);
  return rep.send({ success: true, data });
}

// ─── INTERNAL NOTES ───────────────────────────────────────────────────────────
export async function addInternalNote(req: FastifyRequest, rep: FastifyReply) {
  const { entityType, entityId, note, isUrgent } = req.body as any;
  if (!entityType || !entityId || !note) {
    return rep.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'entityType, entityId, note required' } });
  }

  const staffId = (req as any).currentUser.id;
  const data = await supportRepo.addNote(entityType, entityId, note, isUrgent ?? false, staffId);
  return rep.send({ success: true, data });
}

export async function getInternalNotes(req: FastifyRequest, rep: FastifyReply) {
  const q = req.query as any;
  if (!q.entityType || !q.entityId) {
    return rep.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'entityType, entityId required' } });
  }
  const data = await supportRepo.getNotes(q.entityType, q.entityId);
  return rep.send({ success: true, data });
}

// ─── QA / FRAUD FLAG ──────────────────────────────────────────────────────────
export async function flagForQa(req: FastifyRequest, rep: FastifyReply) {
  const { entityType, entityId, flagType, severity, description } = req.body as any;
  if (!entityType || !entityId || !flagType || !severity || !description) {
    return rep.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Sab fields required hain' } });
  }

  const staffId = (req as any).currentUser.id;
  const flagData: any = { type: flagType, severity, description, detectedById: staffId };
  if (entityType === 'user')    flagData.userId    = entityId;
  if (entityType === 'worker')  flagData.workerId  = entityId;
  if (entityType === 'booking') flagData.bookingId = entityId;

  const data = await supportRepo.createFraudFlag(flagData);
  return rep.status(201).send({ success: true, data });
}

// ─── DISPUTES ─────────────────────────────────────────────────────────────────
export async function getSupportDisputes(req: FastifyRequest, rep: FastifyReply) {
  const q = req.query as any;
  const data = await supportRepo.getDisputes({
    status:  q.status,
    cityId:  q.cityId,
    page:    q.page  ? parseInt(q.page)  : 1,
    limit:   q.limit ? parseInt(q.limit) : 20,
  });
  return rep.send({ success: true, ...data });
}

export async function assignDispute(req: FastifyRequest, rep: FastifyReply) {
  const { disputeId } = req.params as any;
  const staffId = (req as any).currentUser.id;
  const data = await supportRepo.assignDispute(disputeId, staffId);
  return rep.send({ success: true, data });
}

// ─── SOS ──────────────────────────────────────────────────────────────────────
export async function getSupportSos(req: FastifyRequest, rep: FastifyReply) {
  const q = req.query as any;
  const data = await supportRepo.getSosIncidents({
    status:  q.status,
    cityId:  q.cityId,
    page:    q.page  ? parseInt(q.page)  : 1,
    limit:   q.limit ? parseInt(q.limit) : 20,
  });
  return rep.send({ success: true, ...data });
}

// ─── SUPPORT TICKETS ──────────────────────────────────────────────────────────
export async function getSupportChats(req: FastifyRequest, rep: FastifyReply) {
  const q = req.query as any;
  const staffId = (req as any).currentUser.id;

  const data = await supportRepo.getTickets({
    status:       q.status,
    assignedToId: q.mine === 'true' ? staffId : undefined,
    page:         q.page  ? parseInt(q.page)  : 1,
    limit:        q.limit ? parseInt(q.limit) : 20,
  });
  return rep.send({ success: true, ...data });
}

export async function createSupportTicket(req: FastifyRequest, rep: FastifyReply) {
  const { subject, userType, userId, workerId, bookingId } = req.body as any;
  if (!subject || !userType) {
    return rep.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'subject, userType required' } });
  }
  const data = await supportRepo.createTicket({ subject, userType, userId, workerId, bookingId });
  return rep.status(201).send({ success: true, data });
}

export async function getChatMessages(req: FastifyRequest, rep: FastifyReply) {
  const { chatId } = req.params as any;
  const q = req.query as any;

  const ticket = await supportRepo.getTicketById(chatId);
  if (!ticket) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Ticket nahi mila' } });

  // Mark user/worker messages as read
  await supportRepo.markMessagesRead(chatId);

  const data = await supportRepo.getMessages(chatId, {
    page:  q.page  ? parseInt(q.page)  : 1,
    limit: q.limit ? parseInt(q.limit) : 50,
  });
  return rep.send({ success: true, ...data });
}

export async function sendChatMessage(req: FastifyRequest, rep: FastifyReply) {
  const { chatId } = req.params as any;
  const { content } = req.body as any;
  if (!content?.trim()) {
    return rep.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Content required' } });
  }

  const ticket = await supportRepo.getTicketById(chatId);
  if (!ticket) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Ticket nahi mila' } });

  const staffId = (req as any).currentUser.id;
  const data = await supportRepo.sendMessage(chatId, content, 'staff', staffId);
  return rep.status(201).send({ success: true, data });
}

export async function resolveChat(req: FastifyRequest, rep: FastifyReply) {
  const { chatId } = req.params as any;
  const data = await supportRepo.resolveTicket(chatId);
  return rep.send({ success: true, data });
}

export async function assignChat(req: FastifyRequest, rep: FastifyReply) {
  const { chatId } = req.params as any;
  const staffId = (req as any).currentUser.id;
  const data = await supportRepo.assignTicket(chatId, staffId);
  return rep.send({ success: true, data });
}
