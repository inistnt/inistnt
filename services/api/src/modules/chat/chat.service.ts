import { chatRepo } from './chat.repository';
import { db }       from '../../infrastructure/database';
import { kafka, KafkaTopics, ChatMessageEvent } from '../../infrastructure/kafka';
import { redis }    from '../../infrastructure/redis';
import { logger }   from '../../config/logger';

// Redis channel pattern: chat:{bookingId}
const chatChannel = (bookingId: string) => `chat:${bookingId}`;

export const chatService = {

  // ─── Send message + broadcast via Redis pub/sub ────────────
  sendMessage: async (params: {
    bookingId:  string;
    senderId:   string;
    senderType: 'user' | 'worker' | 'support';
    content?:   string;
    mediaUrl?:  string;
    mediaType?: string;
  }) => {
    if (!params.content && !params.mediaUrl) {
      throw { statusCode: 400, code: 'EMPTY_MESSAGE', message: 'Message ya media zaroor bhejein.' };
    }
    if (params.content && params.content.length > 1000) {
      throw { statusCode: 400, code: 'MSG_TOO_LONG', message: 'Message 1000 characters se zyada nahi ho sakta.' };
    }

    // Verify booking exists + sender belongs to it
    const booking = await db.booking.findUnique({
      where: { id: params.bookingId },
      select: { userId: true, workerId: true, status: true },
    });
    if (!booking) throw { statusCode: 404, message: 'Booking nahi mili.' };

    const isCancelled = ['CANCELLED_BY_USER', 'CANCELLED_BY_WORKER', 'CANCELLED_BY_ADMIN'].includes(booking.status);
    if (isCancelled) throw { statusCode: 400, code: 'BOOKING_CLOSED', message: 'Cancelled booking mein chat nahi kar sakte.' };

    const isAuthorized =
      (params.senderType === 'user'   && booking.userId    === params.senderId) ||
      (params.senderType === 'worker' && booking.workerId  === params.senderId) ||
      params.senderType === 'support';
    if (!isAuthorized) throw { statusCode: 403, message: 'Access denied.' };

    const message = await chatRepo.createMessage(params);

    // ── Broadcast to WebSocket subscribers via Redis pub/sub ──
    const payload: ChatMessageEvent = {
      messageId:  message.id,
      bookingId:  params.bookingId,
      senderId:   params.senderId,
      senderType: params.senderType,
      content:    params.content,
      mediaUrl:   params.mediaUrl,
      mediaType:  params.mediaType,
      sentAt:     message.createdAt.toISOString(),
    };
    await redis.publish(chatChannel(params.bookingId), JSON.stringify(payload));

    // ── Kafka event for analytics / push notification ──────────
    await kafka.publish<ChatMessageEvent>(KafkaTopics.CHAT_MESSAGE_SENT, payload, params.bookingId)
      .catch((err: Error) => logger.warn({ err }, '[Chat] Kafka publish failed'));

    return message;
  },

  // ─── Get message history ───────────────────────────────────
  getHistory: async (bookingId: string, requesterId: string, params?: {
    before?: string;
    limit?:  number;
  }) => {
    // Verify requester belongs to booking
    const booking = await db.booking.findUnique({
      where:  { id: bookingId },
      select: { userId: true, workerId: true },
    });
    if (!booking) throw { statusCode: 404, message: 'Booking nahi mili.' };
    if (booking.userId !== requesterId && booking.workerId !== requesterId) {
      throw { statusCode: 403, message: 'Access denied.' };
    }

    const messages = await chatRepo.getMessages(bookingId, params);

    // Auto mark as read for receiver
    await chatRepo.markRead(bookingId, requesterId).catch(() => {});

    return messages;
  },

  // ─── Mark read ─────────────────────────────────────────────
  markRead: async (bookingId: string, readerId: string) => {
    const count = await chatRepo.markRead(bookingId, readerId);
    if (count.count > 0) {
      await redis.publish(
        chatChannel(bookingId),
        JSON.stringify({ type: 'READ_RECEIPT', readerId, bookingId, readAt: new Date().toISOString() }),
      ).catch(() => {});
    }
    return count;
  },
};
