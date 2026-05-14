// ═══════════════════════════════════════════════════════════════════
// INISTNT — Subscription Auto-Renewal Cron
//
// Kab chalta hai: Har raat 2 AM (India time)
// Kya karta hai:
//   1. autoRenew=true wale expire hone wale subscriptions renew karta hai
//   2. Expire ho chuke subscriptions ko GRACE_PERIOD mein dalta hai
//   3. Grace period bhi khatam hone par FREE mein downgrade karta hai
//   4. Har action ke liye Transaction + AuditLog create karta hai
// ═══════════════════════════════════════════════════════════════════

import cron from 'node-cron';
import { db } from '../../infrastructure/database';

// Subscription plan prices in paise
const PLAN_PRICES: Record<string, number> = {
  SILVER:   19900,  // ₹199
  GOLD:     49900,  // ₹499
  PLATINUM: 99900,  // ₹999
};

// Grace period: 3 din
const GRACE_PERIOD_DAYS = 3;

// ─── MAIN JOB ──────────────────────────────────────────────────────────────
async function runSubscriptionRenewal() {
  const now = new Date();
  console.log(`[SubscriptionCron] Starting at ${now.toISOString()}`);

  let renewed = 0, gracePeriod = 0, downgraded = 0, errors = 0;

  // ── Step 1: Auto-renew subscriptions expiring in next 24 hours ────────────
  const toRenew = await db.workerSubscription.findMany({
    where: {
      autoRenew: true,
      status:    'ACTIVE',
      plan:      { not: 'FREE' },
      expiresAt: { lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
    },
    include: { worker: { select: { id: true, walletBalance: true, name: true } } },
  });

  for (const sub of toRenew) {
    try {
      const price = PLAN_PRICES[sub.plan] ?? 0;
      if (price === 0) continue;

      if (sub.worker.walletBalance >= price) {
        // Wallet se deduct karke renew karo
        const newExpiry = new Date(now);
        newExpiry.setMonth(newExpiry.getMonth() + 1);

        await db.$transaction([
          db.workerSubscription.update({
            where: { id: sub.id },
            data:  {
              status:    'ACTIVE',
              startedAt: now,
              expiresAt: newExpiry,
            },
          }),
          db.worker.update({
            where: { id: sub.workerId },
            data:  { walletBalance: { decrement: price } },
          }),
          db.transaction.create({
            data: {
              type:           'SUBSCRIPTION_CHARGE',
              amount:         -price,
              workerId:       sub.workerId,
              subscriptionId: sub.id,
              balanceBefore:  sub.worker.walletBalance,
              balanceAfter:   sub.worker.walletBalance - price,
              description:    `${sub.plan} subscription auto-renewed`,
              metadata:       { plan: sub.plan, renewedAt: now.toISOString() },
            },
          }),
          db.auditLog.create({
            data: {
              action:     'subscription.auto_renewed',
              entityType: 'worker_subscription',
              entityId:   sub.id,
              actorId:    'system',
              actorRole:  'cron',
              after:      { plan: sub.plan, expiresAt: newExpiry.toISOString() },
            },
          }),
        ]);

        renewed++;
        console.log(`[SubscriptionCron] Renewed ${sub.plan} for worker ${sub.workerId}`);

      } else {
        // Wallet mein paisa nahi — grace period mein dalo
        const graceEnd = new Date(now);
        graceEnd.setDate(graceEnd.getDate() + GRACE_PERIOD_DAYS);

        await db.$transaction([
          db.workerSubscription.update({
            where: { id: sub.id },
            data:  { status: 'GRACE_PERIOD', expiresAt: graceEnd },
          }),
          db.auditLog.create({
            data: {
              action:     'subscription.grace_period_started',
              entityType: 'worker_subscription',
              entityId:   sub.id,
              actorId:    'system',
              actorRole:  'cron',
              reason:     'Insufficient wallet balance for auto-renewal',
              after:      { status: 'GRACE_PERIOD', graceEndsAt: graceEnd.toISOString() },
            },
          }),
          // Notification create karo
          db.notification.create({
            data: {
              channel:  'PUSH',
              title:    'Subscription Renew Karein',
              body:     `Aapka ${sub.plan} subscription expire ho gaya. ${GRACE_PERIOD_DAYS} din mein renew karein warna FREE plan pe aa jayenge.`,
              deepLink: '/worker/subscription',
              workerId: sub.workerId,
            },
          }),
        ]);

        gracePeriod++;
        console.log(`[SubscriptionCron] Grace period started for worker ${sub.workerId}`);
      }
    } catch (err) {
      errors++;
      console.error(`[SubscriptionCron] Error renewing sub ${sub.id}:`, err);
    }
  }

  // ── Step 2: GRACE_PERIOD subscriptions jinka time khatam ho gaya → FREE ──
  const toDowngrade = await db.workerSubscription.findMany({
    where: {
      status:    'GRACE_PERIOD',
      expiresAt: { lt: now },
    },
  });

  for (const sub of toDowngrade) {
    try {
      await db.$transaction([
        db.workerSubscription.update({
          where: { id: sub.id },
          data:  {
            plan:       'FREE',
            status:     'EXPIRED',
            expiresAt:  null,
            autoRenew:  false,
          },
        }),
        db.auditLog.create({
          data: {
            action:     'subscription.downgraded_to_free',
            entityType: 'worker_subscription',
            entityId:   sub.id,
            actorId:    'system',
            actorRole:  'cron',
            before:     { plan: sub.plan, status: 'GRACE_PERIOD' },
            after:      { plan: 'FREE', status: 'EXPIRED' },
          },
        }),
        db.notification.create({
          data: {
            channel:  'PUSH',
            title:    'Plan Downgrade Ho Gaya',
            body:     `Aapka ${sub.plan} plan expire ho gaya. Ab aap FREE plan pe hain. Upgrade karein!`,
            deepLink: '/worker/subscription',
            workerId: sub.workerId,
          },
        }),
      ]);

      downgraded++;
      console.log(`[SubscriptionCron] Downgraded worker ${sub.workerId} to FREE`);
    } catch (err) {
      errors++;
      console.error(`[SubscriptionCron] Error downgrading sub ${sub.id}:`, err);
    }
  }

  // ── Step 3: ACTIVE subscriptions jo expire ho chuke hain (no autoRenew) ──
  const expiredActive = await db.workerSubscription.findMany({
    where: {
      status:    'ACTIVE',
      autoRenew: false,
      plan:      { not: 'FREE' },
      expiresAt: { lt: now },
    },
  });

  for (const sub of expiredActive) {
    try {
      const graceEnd = new Date(now);
      graceEnd.setDate(graceEnd.getDate() + GRACE_PERIOD_DAYS);

      await db.$transaction([
        db.workerSubscription.update({
          where: { id: sub.id },
          data:  { status: 'GRACE_PERIOD', expiresAt: graceEnd },
        }),
        db.notification.create({
          data: {
            channel:  'PUSH',
            title:    'Subscription Expire Hua',
            body:     `Aapka ${sub.plan} subscription expire ho gaya. ${GRACE_PERIOD_DAYS} din mein renew karein.`,
            deepLink: '/worker/subscription',
            workerId: sub.workerId,
          },
        }),
      ]);

      gracePeriod++;
    } catch (err) {
      errors++;
      console.error(`[SubscriptionCron] Error setting grace period for sub ${sub.id}:`, err);
    }
  }

  console.log(`[SubscriptionCron] Done — renewed: ${renewed}, grace: ${gracePeriod}, downgraded: ${downgraded}, errors: ${errors}`);
}

// ─── CRON SCHEDULE ─────────────────────────────────────────────────────────
// Raat 2 AM IST (UTC+5:30 = 20:30 UTC)
export function startSubscriptionRenewalCron() {
  cron.schedule('30 20 * * *', async () => {
    try {
      await runSubscriptionRenewal();
    } catch (err) {
      console.error('[SubscriptionCron] Unhandled error:', err);
    }
  }, { timezone: 'Asia/Kolkata' });

  console.log('✅ Subscription renewal cron scheduled (daily 2 AM IST)');
}
