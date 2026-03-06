import { Kafka, Producer, Consumer, logLevel } from 'kafkajs';
import { config } from '../config';

// ──────────────────────────────────────────────────────────
// KAFKA TOPICS — All events in one place
// ──────────────────────────────────────────────────────────

export const KafkaTopics = {
  // Bookings
  BOOKING_CREATED:   'booking.created',
  BOOKING_ASSIGNED:  'booking.assigned',
  BOOKING_ACCEPTED:  'booking.accepted',
  BOOKING_STARTED:   'booking.started',
  BOOKING_COMPLETED: 'booking.completed',
  BOOKING_CANCELLED: 'booking.cancelled',
  BOOKING_NO_WORKER: 'booking.no_worker_found',

  // Payments
  PAYMENT_INITIATED: 'payment.initiated',
  PAYMENT_CAPTURED:  'payment.captured',
  PAYMENT_FAILED:    'payment.failed',
  REFUND_PROCESSED:  'refund.processed',
  PAYOUT_PROCESSED:  'payout.processed',

  // Workers
  WORKER_REGISTERED:    'worker.registered',
  WORKER_VERIFIED:      'worker.verified',
  WORKER_ONLINE:        'worker.online',
  WORKER_OFFLINE:       'worker.offline',
  WORKER_LOCATION:      'worker.location.updated',
  WORKER_SUSPENDED:     'worker.suspended',
  WORKER_TIER_CHANGED:  'worker.tier.changed',

  // Users
  USER_REGISTERED:  'user.registered',
  USER_DELETED:     'user.deleted',

  // Uniform
  UNIFORM_CHECK_DONE: 'uniform.check.completed',

  // SOS
  SOS_TRIGGERED:    'sos.triggered',
  SOS_RESOLVED:     'sos.resolved',

  // Reviews
  REVIEW_CREATED:   'review.created',

  // Notifications
  NOTIFICATION_SEND: 'notification.send',
  EMAIL_SEND:        'email.send',
  SMS_SEND:          'sms.send',
} as const;

export type KafkaTopic = typeof KafkaTopics[keyof typeof KafkaTopics];

// ──────────────────────────────────────────────────────────
// KAFKA CLIENT
// ──────────────────────────────────────────────────────────

const kafkaClient = new Kafka({
  clientId: config.KAFKA_CLIENT_ID,
  brokers: config.KAFKA_BROKERS,
  logLevel: config.NODE_ENV === 'production' ? logLevel.WARN : logLevel.ERROR,
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
});

const producer: Producer = kafkaClient.producer({
  allowAutoTopicCreation: true,
  transactionTimeout: 30000,
});

// ──────────────────────────────────────────────────────────
// KAFKA HELPERS
// ──────────────────────────────────────────────────────────

export const kafka = {
  connect: async () => {
    await producer.connect();
    console.log('✅ Kafka producer connected');
  },

  disconnect: async () => {
    await producer.disconnect();
  },

  // Publish a single event
  publish: async <T>(
    topic: KafkaTopic,
    payload: T,
    key?: string
  ): Promise<void> => {
    await producer.send({
      topic,
      messages: [
        {
          key: key ?? null,
          value: JSON.stringify({
            ...payload as Record<string, unknown>,
            _meta: {
              topic,
              timestamp: new Date().toISOString(),
              service: config.KAFKA_CLIENT_ID,
            },
          }),
        },
      ],
    });
  },

  // Create a consumer for a specific group
  createConsumer: (groupId: string): Consumer => {
    return kafkaClient.consumer({
      groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });
  },
};

// ──────────────────────────────────────────────────────────
// TYPED EVENT PAYLOADS
// ──────────────────────────────────────────────────────────

export interface BookingCreatedEvent {
  bookingId: string;
  userId: string;
  serviceId: string;
  cityId: string;
  areaId?: string;
  lat: number;
  lng: number;
  amount: number;
  scheduledFor?: string;
}

export interface BookingAssignedEvent {
  bookingId: string;
  workerId: string;
  userId: string;
  workerLat: number;
  workerLng: number;
  estimatedArrivalMin: number;
}

export interface BookingCompletedEvent {
  bookingId: string;
  userId: string;
  workerId: string;
  amount: number;
  commissionAmount: number;
  workerEarning: number;
  cityId: string;
  serviceId: string;
  completedAt: string;
}

export interface PaymentCapturedEvent {
  paymentId: string;
  bookingId: string;
  userId: string;
  workerId: string;
  amount: number;
  method: string;
}

export interface WorkerLocationEvent {
  workerId: string;
  cityId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  bookingId?: string;
}

export interface NotificationSendEvent {
  recipientType: 'user' | 'worker' | 'staff';
  recipientId: string;
  fcmToken?: string;
  mobile?: string;
  email?: string;
  channels: string[];
  title?: string;
  body: string;
  deepLink?: string;
  imageUrl?: string;
  bookingId?: string;
}