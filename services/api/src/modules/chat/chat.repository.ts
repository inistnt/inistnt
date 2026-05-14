import { db } from '../../infrastructure/database';

export const chatRepo = {

  // ─── Send message ──────────────────────────────────────────
  createMessage: async (data: {
    bookingId:  string;
    senderId:   string;
    senderType: string;   // 'user' | 'worker' | 'support'
    content?:   string;
    mediaUrl?:  string;
    mediaType?: string;   // 'image' | 'audio'
  }) => {
    return db.chatMessage.create({ data });
  },

  // ─── Get messages for booking ──────────────────────────────
  getMessages: async (bookingId: string, params?: {
    before?: string;  // cursor (messageId)
    limit?:  number;
  }) => {
    const limit = params?.limit ?? 50;
    const where: any = { bookingId, deletedAt: null };

    if (params?.before) {
      const cursor = await db.chatMessage.findUnique({
        where: { id: params.before },
        select: { createdAt: true },
      });
      if (cursor) where.createdAt = { lt: cursor.createdAt };
    }

    const messages = await db.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take:    limit,
    });

    return messages.reverse(); // oldest first
  },

  // ─── Mark messages as read ─────────────────────────────────
  markRead: async (bookingId: string, readerId: string) => {
    return db.chatMessage.updateMany({
      where: {
        bookingId,
        senderId:  { not: readerId },
        isRead:    false,
        deletedAt: null,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  },

  // ─── Unread count ──────────────────────────────────────────
  getUnreadCount: async (bookingId: string, readerId: string) => {
    return db.chatMessage.count({
      where: {
        bookingId,
        senderId:  { not: readerId },
        isRead:    false,
        deletedAt: null,
      },
    });
  },

  // ─── Soft delete ───────────────────────────────────────────
  deleteMessage: async (messageId: string, requesterId: string) => {
    const msg = await db.chatMessage.findUnique({ where: { id: messageId } });
    if (!msg || msg.senderId !== requesterId) {
      throw { statusCode: 403, message: 'Yeh message delete nahi kar sakte.' };
    }
    return db.chatMessage.update({
      where: { id: messageId },
      data:  { deletedAt: new Date(), content: null },
    });
  },

  // ─── Find single message ───────────────────────────────────
  findById: async (id: string) => db.chatMessage.findUnique({ where: { id } }),
};
