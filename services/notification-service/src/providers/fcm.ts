import admin from 'firebase-admin';
import { config } from '../config';
import { logger } from '../logger';

// ─── INIT ─────────────────────────────────────────────────────────────────────

let initialized = false;

function init() {
  if (initialized) return;

  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = config;

  // Dev mode — skip init if any credential is missing/empty
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    logger.warn('FCM credentials missing — push notifications disabled (dev mode)');
    return;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey:  FIREBASE_PRIVATE_KEY,
      }),
    });
    initialized = true;
    logger.info('✅ Firebase Admin initialized');
  } catch (err: any) {
    logger.warn({ err: err.message }, '⚠️ Firebase init failed — push disabled (check credentials)');
  }
}

init();

// ─── SEND SINGLE PUSH ────────────────────────────────────────────────────────

export interface PushPayload {
  token:     string;
  title:     string;
  body:      string;
  deepLink?: string;
  imageUrl?: string;
  data?:     Record<string, string>;
}

export async function sendPush(payload: PushPayload): Promise<boolean> {
  if (!initialized) {
    // Dev mode — just log
    logger.info({ payload }, '📲 [DEV] FCM push (not sent — no credentials)');
    return true;
  }

  try {
    const msg: admin.messaging.Message = {
      token: payload.token,
      notification: {
        title: payload.title,
        body:  payload.body,
        ...(payload.imageUrl && { imageUrl: payload.imageUrl }),
      },
      data: {
        ...(payload.deepLink && { deepLink: payload.deepLink }),
        ...payload.data,
      },
      android: {
        priority: 'high',
        notification: {
          sound:       'default',
          channelId:   'bookings',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    const result = await admin.messaging().send(msg);
    logger.info({ messageId: result, token: payload.token.slice(-10) }, '✅ FCM push sent');
    return true;
  } catch (err: any) {
    // Token expired / unregistered — remove from DB
    if (err.code === 'messaging/registration-token-not-registered' ||
        err.code === 'messaging/invalid-registration-token') {
      logger.warn({ token: payload.token.slice(-10) }, '⚠️ FCM token invalid, should be removed');
    } else {
      logger.error({ err, token: payload.token.slice(-10) }, '❌ FCM push failed');
    }
    return false;
  }
}

// ─── SEND MULTI-CAST (up to 500 tokens) ─────────────────────────────────────

export async function sendMulticastPush(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  if (!initialized || tokens.length === 0) return;

  const chunks = chunkArray(tokens, 500);
  for (const chunk of chunks) {
    try {
      const result = await admin.messaging().sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        data,
        android: { priority: 'high' },
      });
      logger.info(
        { success: result.successCount, failed: result.failureCount },
        '📲 Multicast push sent'
      );
    } catch (err) {
      logger.error({ err }, 'Multicast push failed');
    }
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}
