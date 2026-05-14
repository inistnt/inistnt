import { db } from '../../infrastructure/database';

export const supportRepo = {

  // ─── LIVE DASHBOARD ───────────────────────────────────────────────────
  getLiveDashboard: async () => {
    const [activeBookings, searchingBookings, activeWorkers, openDisputes, activeSos, avgResponseTime] = await Promise.all([
      db.booking.count({
        where: { status: { in: ['ASSIGNED', 'WORKER_ACCEPTED', 'WORKER_ARRIVED', 'WORK_STARTED'] } },
      }),
      db.booking.count({ where: { status: 'SEARCHING' } }),
      db.worker.count({ where: { isOnline: true } }),
      db.dispute.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
      db.sosIncident.count({ where: { status: 'ACTIVE' } }),
      // Average resolution time in seconds (last 100 resolved disputes)
      db.dispute.findMany({
        where: { status: 'RESOLVED', resolvedAt: { not: null } },
        select: { createdAt: true, resolvedAt: true },
        orderBy: { resolvedAt: 'desc' },
        take: 100,
      }),
    ]);

    const avgSec = avgResponseTime.length
      ? Math.round(
          avgResponseTime.reduce((sum, d) => {
            return sum + (d.resolvedAt!.getTime() - d.createdAt.getTime()) / 1000;
          }, 0) / avgResponseTime.length
        )
      : 0;

    return { activeBookings, searchingBookings, activeWorkers, openDisputes, activeSos, avgResponseTimeSec: avgSec };
  },

  // ─── BOOKINGS ─────────────────────────────────────────────────────────
  getBookings: async (params: { status?: string; cityId?: string; search?: string; page?: number; limit?: number }) => {
    const { status, cityId, search, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;
    if (cityId) where.cityId = cityId;
    if (search) where.bookingNumber = { contains: search };

    const [items, total] = await Promise.all([
      db.booking.findMany({
        where,
        include: {
          user:    { select: { id: true, name: true, mobile: true } },
          worker:  { select: { id: true, name: true, mobile: true } },
          service: { select: { nameEn: true } },
          payment: { select: { status: true, amount: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.booking.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  getBookingDetails: async (bookingId: string) => {
    return db.booking.findUnique({
      where: { id: bookingId },
      include: {
        user:    { select: { id: true, name: true, mobile: true, email: true } },
        worker:  { select: { id: true, name: true, mobile: true, tier: true, rating: true } },
        service: { select: { nameEn: true, nameHi: true } },
        payment: true,
        timeline: { orderBy: { createdAt: 'asc' } },
        dispute:  { include: { notes: { orderBy: { createdAt: 'desc' } } } },
        sosIncidents: { orderBy: { createdAt: 'desc' } },
        review:   true,
      },
    });
  },

  getBookingInternalNotes: async (bookingId: string) => {
    return db.internalNote.findMany({
      where: { entityType: 'booking', entityId: bookingId },
      orderBy: { createdAt: 'desc' },
    });
  },

  // ─── WORKER REASSIGN ──────────────────────────────────────────────────
  reassignWorker: async (bookingId: string, newWorkerId: string, reason: string, staffId: string) => {
    const booking = await db.booking.findUnique({ where: { id: bookingId }, select: { workerId: true } });

    await db.auditLog.create({
      data: {
        action:     'booking.worker_reassign',
        entityType: 'booking',
        entityId:   bookingId,
        actorId:    staffId,
        actorRole:  'support',
        before:     { workerId: booking?.workerId },
        after:      { workerId: newWorkerId },
        reason,
      },
    });

    return db.booking.update({
      where: { id: bookingId },
      data:  { workerId: newWorkerId, assignedAt: new Date() },
    });
  },

  // ─── INTERNAL NOTES ───────────────────────────────────────────────────
  addNote: async (entityType: string, entityId: string, note: string, isUrgent: boolean, addedById: string) => {
    return db.internalNote.create({
      data: { entityType, entityId, note, isUrgent, addedById },
    });
  },

  getNotes: async (entityType: string, entityId: string) => {
    return db.internalNote.findMany({
      where:   { entityType, entityId },
      orderBy: { createdAt: 'desc' },
    });
  },

  // ─── FLAG FOR QA / FRAUD ──────────────────────────────────────────────
  createFraudFlag: async (data: {
    type: string;
    severity: string;
    description: string;
    userId?: string;
    workerId?: string;
    bookingId?: string;
    detectedById: string;
  }) => {
    return db.fraudFlag.create({
      data: {
        type:           data.type as any,
        severity:       data.severity as any,
        description:    data.description,
        userId:         data.userId,
        workerId:       data.workerId,
        bookingId:      data.bookingId,
        detectedById:   data.detectedById,
        isAutoDetected: false,
      },
    });
  },

  // ─── DISPUTES ─────────────────────────────────────────────────────────
  getDisputes: async (params: { status?: string; cityId?: string; page?: number; limit?: number }) => {
    const { status, cityId, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;
    if (cityId) where.booking = { cityId };

    const [items, total] = await Promise.all([
      db.dispute.findMany({
        where,
        include: {
          booking: { select: { bookingNumber: true, cityId: true } },
          user:    { select: { name: true, mobile: true } },
          worker:  { select: { name: true, mobile: true } },
          notes:   { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        skip,
        take: limit,
      }),
      db.dispute.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  assignDispute: async (disputeId: string, staffId: string) => {
    return db.dispute.update({
      where: { id: disputeId },
      data:  { status: 'UNDER_REVIEW', assignedToId: staffId, assignedAt: new Date() },
    });
  },

  // ─── SOS ──────────────────────────────────────────────────────────────
  getSosIncidents: async (params: { status?: string; cityId?: string; page?: number; limit?: number }) => {
    const { status, cityId, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;
    if (cityId) where.booking = { cityId };

    const [items, total] = await Promise.all([
      db.sosIncident.findMany({
        where,
        include: {
          booking: { select: { bookingNumber: true } },
          user:    { select: { name: true, mobile: true } },
          worker:  { select: { name: true, mobile: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.sosIncident.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  // ─── SUPPORT TICKETS / CHATS ──────────────────────────────────────────
  getTickets: async (params: { status?: string; assignedToId?: string; page?: number; limit?: number }) => {
    const { status, assignedToId, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status)       where.status       = status;
    if (assignedToId) where.assignedToId = assignedToId;

    const [items, total] = await Promise.all([
      db.supportTicket.findMany({
        where,
        include: {
          user:   { select: { name: true, mobile: true } },
          worker: { select: { name: true, mobile: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      db.supportTicket.count({ where }),
    ]);

    // Attach unread count per ticket
    const ticketIds = items.map(t => t.id);
    const unreadCounts = await db.supportMessage.groupBy({
      by:    ['ticketId'],
      where: { ticketId: { in: ticketIds }, isRead: false, senderType: { in: ['user', 'worker'] } },
      _count: { id: true },
    });
    const unreadMap = Object.fromEntries(unreadCounts.map(u => [u.ticketId, u._count.id]));

    return {
      items: items.map(t => ({ ...t, unreadCount: unreadMap[t.id] ?? 0 })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  getTicketById: async (ticketId: string) => {
    return db.supportTicket.findUnique({
      where:   { id: ticketId },
      include: {
        user:   { select: { name: true, mobile: true } },
        worker: { select: { name: true, mobile: true } },
      },
    });
  },

  createTicket: async (data: {
    subject: string;
    userType: string;
    userId?: string;
    workerId?: string;
    bookingId?: string;
  }) => {
    return db.supportTicket.create({ data });
  },

  getMessages: async (ticketId: string, params: { page?: number; limit?: number }) => {
    const { page = 1, limit = 50 } = params;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      db.supportMessage.findMany({
        where:   { ticketId },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      db.supportMessage.count({ where: { ticketId } }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  sendMessage: async (ticketId: string, content: string, senderType: string, senderId: string) => {
    const [msg] = await db.$transaction([
      db.supportMessage.create({
        data: { ticketId, content, senderType, senderId },
      }),
      db.supportTicket.update({
        where: { id: ticketId },
        data:  { status: 'in_progress', updatedAt: new Date() },
      }),
    ]);
    return msg;
  },

  markMessagesRead: async (ticketId: string) => {
    return db.supportMessage.updateMany({
      where: { ticketId, isRead: false, senderType: { in: ['user', 'worker'] } },
      data:  { isRead: true },
    });
  },

  resolveTicket: async (ticketId: string) => {
    return db.supportTicket.update({
      where: { id: ticketId },
      data:  { status: 'resolved', resolvedAt: new Date() },
    });
  },

  assignTicket: async (ticketId: string, staffId: string) => {
    return db.supportTicket.update({
      where: { id: ticketId },
      data:  { assignedToId: staffId, status: 'in_progress' },
    });
  },
};
