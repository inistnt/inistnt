import { sendPush }  from '../providers/fcm';
import { sendSms }   from '../providers/sms';
import { sendEmail } from '../providers/email';
import { getUserInfo, getWorkerInfo } from '../providers/db';
import { logger }    from '../logger';

// ─── EVENT SHAPES ─────────────────────────────────────────────────────────────

export interface NotificationSendEvent {
  recipientType: 'user' | 'worker' | 'staff';
  recipientId:   string;
  fcmToken?:     string;
  mobile?:       string;
  email?:        string;
  channels:      Array<'push' | 'sms' | 'email'>;
  title?:        string;
  body:          string;
  deepLink?:     string;
  imageUrl?:     string;
  bookingId?:    string;
  _meta?:        any;
}

// ─── HANDLER ─────────────────────────────────────────────────────────────────

export async function handleNotificationSend(event: NotificationSendEvent): Promise<void> {
  const { recipientType, recipientId, channels } = event;

  // Fetch recipient info from DB if tokens not provided in event
  let fcmToken = event.fcmToken;
  let mobile   = event.mobile;
  let email    = event.email;

  if (!fcmToken || !mobile) {
    const info = recipientType === 'user'
      ? await getUserInfo(recipientId)
      : await getWorkerInfo(recipientId);

    if (!info) {
      logger.warn({ recipientId, recipientType }, 'Recipient not found, skipping notification');
      return;
    }

    fcmToken = fcmToken ?? info.fcmToken;
    mobile   = mobile   ?? info.mobile;
    email    = email    ?? info.email;
  }

  const title = event.title ?? 'Inistnt';
  const results: Record<string, boolean> = {};

  // ─── PUSH NOTIFICATION ───────────────────────────────────────────────────

  if (channels.includes('push')) {
    if (fcmToken) {
      results.push = await sendPush({
        token:    fcmToken,
        title,
        body:     event.body,
        deepLink: event.deepLink,
        imageUrl: event.imageUrl,
        data: {
          ...(event.bookingId && { bookingId: event.bookingId }),
          ...(event.deepLink  && { deepLink:  event.deepLink  }),
        },
      });
    } else {
      logger.warn({ recipientId }, 'Push requested but no FCM token available');
      results.push = false;
    }
  }

  // ─── SMS ─────────────────────────────────────────────────────────────────

  if (channels.includes('sms')) {
    if (mobile) {
      results.sms = await sendSms(mobile, event.body);
    } else {
      logger.warn({ recipientId }, 'SMS requested but no mobile available');
      results.sms = false;
    }
  }

  // ─── EMAIL ───────────────────────────────────────────────────────────────

  if (channels.includes('email')) {
    if (email) {
      results.email = await sendEmail({
        to:      email,
        subject: title,
        html:    `<p>${event.body}</p>`,
      });
    } else {
      logger.warn({ recipientId }, 'Email requested but no email available');
      results.email = false;
    }
  }

  logger.info({
    recipientId,
    recipientType,
    channels,
    results,
    bookingId: event.bookingId,
  }, '📬 Notification dispatched');
}

// ─── BOOKING EVENT HANDLERS ──────────────────────────────────────────────────

export interface BookingAssignedEvent {
  bookingId:           string;
  workerId:            string;
  userId:              string;
  estimatedArrivalMin: number;
  _meta?:              any;
}

export async function handleBookingAssigned(event: BookingAssignedEvent): Promise<void> {
  const [user, worker] = await Promise.all([
    getUserInfo(event.userId),
    getWorkerInfo(event.workerId),
  ]);

  // Notify user
  if (user) {
    await handleNotificationSend({
      recipientType: 'user',
      recipientId:   event.userId,
      fcmToken:      user.fcmToken,
      mobile:        user.mobile,
      email:         user.email,
      channels:      ['push', 'sms'],
      title:         '✅ Worker mil gaya!',
      body:          `${worker?.name ?? 'Worker'} aa rahe hain — ~${event.estimatedArrivalMin} min mein pahunchenge.`,
      deepLink:      `inistnt://booking/${event.bookingId}/track`,
      bookingId:     event.bookingId,
    });
  }

  // Notify worker
  if (worker) {
    await handleNotificationSend({
      recipientType: 'worker',
      recipientId:   event.workerId,
      fcmToken:      worker.fcmToken,
      mobile:        worker.mobile,
      channels:      ['push'],
      title:         '📋 Booking assign hui!',
      body:          `Nayi booking assign hui hai. App mein details dekhein.`,
      deepLink:      `inistnt://worker/booking/${event.bookingId}`,
      bookingId:     event.bookingId,
    });
  }
}

export interface BookingCompletedEvent {
  bookingId:  string;
  userId:     string;
  workerId:   string;
  amount:     number;
  _meta?:     any;
}

export async function handleBookingCompleted(event: BookingCompletedEvent): Promise<void> {
  const user = await getUserInfo(event.userId);
  if (!user) return;

  await handleNotificationSend({
    recipientType: 'user',
    recipientId:   event.userId,
    fcmToken:      user.fcmToken,
    mobile:        user.mobile,
    email:         user.email,
    channels:      ['push', 'email'],
    title:         '⭐ Service complete! Rating dein',
    body:          `Aapki service complete ho gayi. ₹${event.amount / 100} charge hua. Kaisi rahi service?`,
    deepLink:      `inistnt://booking/${event.bookingId}/review`,
    bookingId:     event.bookingId,
  });
}

export interface BookingCancelledEvent {
  bookingId:     string;
  userId:        string;
  workerId?:     string;
  cancelledBy:   'user' | 'worker' | 'system';
  reason?:       string;
  _meta?:        any;
}

export async function handleBookingCancelled(event: BookingCancelledEvent): Promise<void> {
  const user = await getUserInfo(event.userId);

  if (event.cancelledBy === 'worker' && user) {
    await handleNotificationSend({
      recipientType: 'user',
      recipientId:   event.userId,
      fcmToken:      user.fcmToken,
      mobile:        user.mobile,
      channels:      ['push', 'sms'],
      title:         '😔 Booking cancel ho gayi',
      body:          'Worker ne booking cancel kar di. Hum aapke liye naya worker dhundh rahe hain.',
      bookingId:     event.bookingId,
    });
  }

  if (event.workerId && event.cancelledBy === 'user') {
    const worker = await getWorkerInfo(event.workerId);
    if (worker) {
      await handleNotificationSend({
        recipientType: 'worker',
        recipientId:   event.workerId,
        fcmToken:      worker.fcmToken,
        channels:      ['push'],
        title:         'Booking cancel ho gayi',
        body:          'Customer ne booking cancel kar di.',
        bookingId:     event.bookingId,
      });
    }
  }
}

export interface WorkerVerifiedEvent {
  workerId: string;
  _meta?:   any;
}

export async function handleWorkerVerified(event: WorkerVerifiedEvent): Promise<void> {
  const worker = await getWorkerInfo(event.workerId);
  if (!worker) return;

  await handleNotificationSend({
    recipientType: 'worker',
    recipientId:   event.workerId,
    fcmToken:      worker.fcmToken,
    mobile:        worker.mobile,
    email:         worker.email,
    channels:      ['push', 'sms', 'email'],
    title:         '🎉 Profile Verified!',
    body:          'Badhai ho! Aapka Inistnt profile verify ho gaya. Ab app se bookings lena shuru karein.',
    deepLink:      'inistnt://worker/dashboard',
  });
}

export interface SosTriggeredEvent {
  sosId:     string;
  bookingId: string;
  userId?:   string;
  workerId?: string;
  lat:       number;
  lng:       number;
  _meta?:    any;
}

export async function handleSosTriggered(event: SosTriggeredEvent): Promise<void> {
  // Notify admin via SMS immediately
  logger.warn({
    sosId:     event.sosId,
    bookingId: event.bookingId,
    lat:       event.lat,
    lng:       event.lng,
  }, '🚨 SOS TRIGGERED — Admin notification required');

  // In production: notify on-call staff via SMS/call
  // For now, log prominently and send to support queue
}
