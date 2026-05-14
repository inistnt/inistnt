// ═══════════════════════════════════════════════════════════
// KAFKA MOCK — records all published events for assertion
// Drop-in for src/infrastructure/kafka.ts
// ═══════════════════════════════════════════════════════════

export const KafkaTopics = {
  BOOKING_CREATED:    'booking.created',
  BOOKING_CANCELLED:  'booking.cancelled',
  BOOKING_COMPLETED:  'booking.completed',
  WORKER_ASSIGNED:    'worker.assigned',
  WORKER_REGISTERED:  'worker.registered',
  USER_REGISTERED:    'user.registered',
  PAYMENT_CAPTURED:   'payment.captured',
  REFUND_PROCESSED:   'refund.processed',
  REVIEW_CREATED:     'review.created',
  SMS_SEND:           'sms.send',
  EMAIL_SEND:         'email.send',
  PUSH_SEND:          'push.send',
  WORKER_LOCATION:    'worker.location',
  ANALYTICS_EVENT:    'analytics.event',
  FRAUD_DETECTED:     'fraud.detected',
} as const;

export type KafkaTopic = typeof KafkaTopics[keyof typeof KafkaTopics];

// Internal store — access via mockKafka.getPublished()
const publishedEvents: Array<{ topic: string; payload: unknown; key?: string }> = [];

export const kafka = {
  publish: jest.fn(async <T>(topic: string, payload: T, key?: string) => {
    publishedEvents.push({ topic, payload, key });
    return Promise.resolve();
  }),

  connect: jest.fn(async () => Promise.resolve()),
  disconnect: jest.fn(async () => Promise.resolve()),
  consume: jest.fn(async () => Promise.resolve()),
};

// Test helpers
export const mockKafka = {
  getPublished: () => [...publishedEvents],
  getPublishedByTopic: (topic: string) =>
    publishedEvents.filter((e) => e.topic === topic),
  clear: () => {
    publishedEvents.length = 0;
    (kafka.publish as jest.Mock).mockClear();
  },
};

// Named export for type compatibility
export type BookingCreatedEvent = {
  bookingId: string;
  userId: string;
  serviceId: string;
  cityId: string;
  areaId?: string;
  lat: number;
  lng: number;
  amount: number;
  scheduledFor?: string;
};
