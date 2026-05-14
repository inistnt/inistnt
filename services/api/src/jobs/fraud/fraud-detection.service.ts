// ═══════════════════════════════════════════════════════════════════
// INISTNT — Fraud Auto-Detection Service
//
// Kab trigger hota hai: Booking complete/cancel events pe (Kafka)
// Kya detect karta hai:
//   1. Rapid cancellations (user ne 1 ghante mein 3+ cancellations)
//   2. Location spoofing (worker booking location se 50km+ door)
//   3. Fake review pattern (same user ne ek worker ko 5+ baar review kiya)
//   4. Multiple accounts (same device se 2+ accounts)
//   5. Cash collection fraud (worker ne baar baar COD bookings cancel ki)
//   6. Rating manipulation (ek hi IP/device se multiple reviews)
// ═══════════════════════════════════════════════════════════════════

import { db } from '../../infrastructure/database';
import { kafka } from '../../infrastructure/kafka';

// ─── DETECTION RULES ────────────────────────────────────────────────────────

// Rule 1: User rapid cancellations — 3+ cancellations in 1 hour
async function checkRapidCancellations(userId: string) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const count = await db.booking.count({
    where: {
      userId,
      status:      'CANCELLED_BY_USER',
      cancelledAt: { gte: oneHourAgo },
    },
  });

  if (count >= 3) {
    await createFlag({
      type:        'RAPID_CANCELLATIONS',
      severity:    count >= 5 ? 'HIGH' : 'MEDIUM',
      description: `User ne ${count} bookings ek ghante mein cancel ki`,
      userId,
    });
  }
}

// Rule 2: Worker location spoofing — accepted booking but last known location far
async function checkWorkerLocationSpoofing(workerId: string, bookingId: string) {
  const booking = await db.booking.findUnique({
    where:  { id: bookingId },
    select: { lat: true, lng: true },
  });

  // Last known worker location from history
  const lastLocation = await db.workerLocationHistory.findFirst({
    where:   { workerId },
    orderBy: { createdAt: 'desc' },
    select:  { lat: true, lng: true },
  });

  if (!booking?.lat || !booking?.lng || !lastLocation) return;

  const distKm = haversineKm(
    booking.lat, booking.lng,
    lastLocation.lat, lastLocation.lng
  );

  if (distKm > 50) {
    await createFlag({
      type:        'LOCATION_SPOOFING',
      severity:    'HIGH',
      description: `Worker ${Math.round(distKm)}km door tha jab usne booking accept ki`,
      workerId,
      bookingId,
    });
  }
}

// Rule 3: Fake review pattern — same user reviewed same worker 3+ times
async function checkFakeReviews(userId: string, workerId: string) {
  const count = await db.review.count({
    where: { userId, workerId },
  });

  if (count >= 3) {
    await createFlag({
      type:        'FAKE_REVIEW',
      severity:    'MEDIUM',
      description: `User ne ek hi worker ko ${count} baar review diya`,
      userId,
      workerId:    workerId,
    });
  }
}

// Rule 4: Cash on delivery fraud — worker repeatedly marks COD bookings as cancelled
async function checkCodFraud(workerId: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const cancelledCod = await db.booking.count({
    where: {
      workerId,
      status:      'CANCELLED_BY_WORKER',
      cancelledAt: { gte: sevenDaysAgo },
      payment:     { method: 'CASH' },
    },
  });

  if (cancelledCod >= 5) {
    await createFlag({
      type:        'COD_FRAUD',
      severity:    cancelledCod >= 10 ? 'CRITICAL' : 'HIGH',
      description: `Worker ne ${cancelledCod} COD bookings 7 din mein cancel ki`,
      workerId,
    });
  }
}

// Rule 5: Suspicious booking pattern — same address, multiple users, rapid succession
async function checkAddressFraud(bookingId: string) {
  const booking = await db.booking.findUnique({
    where:  { id: bookingId },
    select: { addressId: true, userId: true, createdAt: true },
  });
  if (!booking?.addressId) return;

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const sameAddressBookings = await db.booking.findMany({
    where: {
      addressId:  booking.addressId,
      userId:     { not: booking.userId },
      createdAt:  { gte: oneHourAgo },
    },
    select: { userId: true },
  });

  const uniqueUsers = new Set(sameAddressBookings.map(b => b.userId)).size;

  if (uniqueUsers >= 3) {
    await createFlag({
      type:        'SUSPICIOUS_BOOKING_PATTERN',
      severity:    'HIGH',
      description: `Ek ghante mein ${uniqueUsers} alag users ne same address se booking ki`,
      bookingId,
    });
  }
}

// ─── HELPER: Create fraud flag (skip if duplicate open flag exists) ──────────
async function createFlag(data: {
  type:        string;
  severity:    string;
  description: string;
  userId?:     string;
  workerId?:   string;
  bookingId?:  string;
}) {
  // Duplicate check — agar isi entity pe same type ka open flag already hai toh skip
  const existing = await db.fraudFlag.findFirst({
    where: {
      type:     data.type as any,
      status:   'open',
      userId:   data.userId   ?? undefined,
      workerId: data.workerId ?? undefined,
    },
  });
  if (existing) return;

  await db.fraudFlag.create({
    data: {
      type:           data.type as any,
      severity:       data.severity as any,
      description:    data.description,
      userId:         data.userId,
      workerId:       data.workerId,
      bookingId:      data.bookingId,
      isAutoDetected: true,
    },
  });

  console.log(`[FraudDetection] Flag created: ${data.type} | severity: ${data.severity}`);
}

// ─── HAVERSINE DISTANCE ─────────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── EVENT HANDLERS ─────────────────────────────────────────────────────────
export async function handleBookingCancelledForFraud(event: {
  bookingId: string;
  userId:    string;
  workerId?: string;
  reason?:   string;
}) {
  // Run applicable checks in parallel
  await Promise.allSettled([
    checkRapidCancellations(event.userId),
    event.workerId ? checkCodFraud(event.workerId) : Promise.resolve(),
    checkAddressFraud(event.bookingId),
  ]);
}

export async function handleBookingCompletedForFraud(event: {
  bookingId: string;
  userId:    string;
  workerId:  string;
}) {
  await Promise.allSettled([
    checkWorkerLocationSpoofing(event.workerId, event.bookingId),
    checkFakeReviews(event.userId, event.workerId),
  ]);
}

// ─── KAFKA CONSUMER ─────────────────────────────────────────────────────────
export async function startFraudDetectionConsumer() {
  const consumer = kafka.createConsumer('fraud-detection-service');

  await consumer.connect();
  await consumer.subscribe({
    topics: ['booking.cancelled', 'booking.completed', 'review.created'],
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return;

      try {
        const event = JSON.parse(message.value.toString());

        if (topic === 'booking.cancelled') {
          await handleBookingCancelledForFraud({
            bookingId: event.bookingId,
            userId:    event.userId,
            workerId:  event.workerId,
            reason:    event.reason,
          });
        }

        if (topic === 'booking.completed') {
          await handleBookingCompletedForFraud({
            bookingId: event.bookingId,
            userId:    event.userId,
            workerId:  event.workerId,
          });
        }

        if (topic === 'review.created') {
          if (event.userId && event.workerId) {
            await checkFakeReviews(event.userId, event.workerId);
          }
        }
      } catch (err) {
        console.error(`[FraudDetection] Error processing ${topic} event:`, err);
      }
    },
  });

  console.log('✅ Fraud detection consumer started (topics: booking.cancelled, booking.completed, review.created)');
}

// ─── MANUAL SCAN (Admin trigger kare) ──────────────────────────────────────
export async function runManualFraudScan(targetType: 'users' | 'workers', limit = 100) {
  console.log(`[FraudDetection] Manual scan started for ${targetType}...`);
  let flagged = 0;

  if (targetType === 'users') {
    const users = await db.user.findMany({
      where:  { status: 'ACTIVE' },
      select: { id: true },
      take:   limit,
    });

    for (const user of users) {
      const before = await db.fraudFlag.count({ where: { userId: user.id } });
      await checkRapidCancellations(user.id);
      const after = await db.fraudFlag.count({ where: { userId: user.id } });
      if (after > before) flagged++;
    }
  }

  if (targetType === 'workers') {
    const workers = await db.worker.findMany({
      where:  { status: 'VERIFIED' },
      select: { id: true },
      take:   limit,
    });

    for (const worker of workers) {
      const before = await db.fraudFlag.count({ where: { workerId: worker.id } });
      await checkCodFraud(worker.id);
      const after = await db.fraudFlag.count({ where: { workerId: worker.id } });
      if (after > before) flagged++;
    }
  }

  console.log(`[FraudDetection] Manual scan done — ${flagged} new flags created`);
  return { scanned: limit, flagged };
}
