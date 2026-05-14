import type { FastifyInstance } from 'fastify';
import { requireWorker } from '../../plugins/auth.middleware';
import { db } from '../../infrastructure/database';
import {
  getPublicProfile, getWorkerReviews,
  getMe, updateMe, updateStatus, updateLocation,
  getDocuments, uploadDocument,
  getSkills, addSkill, removeSkill,
  getEarnings, getTransactions,
  getPayouts, requestPayout,
  getBankDetails, updateBankDetails,
  getStats,
  getNotifications, getUnreadNotificationCount, markNotificationsRead,
  getRewards, getIncentivePrograms, getSubscription,
} from './worker.controller';

function wrap(fn: Function) {
  return async (req: any, rep: any) => {
    try { return await fn(req, rep); }
    catch (err: any) {
      if (err.statusCode) return rep.status(err.statusCode).send({ success: false, error: { code: err.code ?? 'ERROR', message: err.message } });
      throw err;
    }
  };
}

export async function workerRoutes(server: FastifyInstance) {

  // ─── PUBLIC (no auth) ─────────────────────────────────────
  server.get('/:workerId/profile', wrap(getPublicProfile));
  server.get('/:workerId/reviews', wrap(getWorkerReviews));

  // ─── PRIVATE (worker auth required) ──────────────────────
  server.register(async (s) => {
    s.addHook('preHandler', requireWorker);

    // Profile
    s.get('/me',    wrap(getMe));
    s.patch('/me', {
      schema: { body: { type: 'object', properties: {
        name:          { type: 'string', minLength: 2, maxLength: 100 },
        email:         { type: 'string', format: 'email' },
        preferredLang: { type: 'string', enum: ['hi', 'en'] },
        tshirtSize:    { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
      } } },
    }, wrap(updateMe));

    // FCM Token update — app login ke baad call karo
    s.patch('/me/fcm-token', {
      schema: {
        body: {
          type: 'object', required: ['fcmToken'],
          properties: { fcmToken: { type: 'string', minLength: 10 } },
        },
      },
    }, async (req: any, rep: any) => {
      const { fcmToken } = req.body as { fcmToken: string };
      await db.worker.update({ where: { id: req.currentUser.id }, data: { fcmToken } });
      return rep.send({ success: true, data: null });
    });

    // Status & Location
    s.patch('/me/status', {
      schema: { body: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['online', 'offline'] } } } },
    }, wrap(updateStatus));
    s.post('/me/location', {
      schema: { body: { type: 'object', required: ['lat', 'lng'], properties: { lat: { type: 'number' }, lng: { type: 'number' }, accuracy: { type: 'number' } } } },
    }, wrap(updateLocation));

    // Documents
    s.get('/me/documents',  wrap(getDocuments));
    s.post('/me/documents', {
      schema: { body: { type: 'object', required: ['type', 'fileUrl'], properties: {
        type:    { type: 'string', enum: ['AADHAAR_FRONT', 'AADHAAR_BACK', 'PAN_CARD', 'DRIVING_LICENSE', 'BANK_PASSBOOK', 'POLICE_VERIFICATION', 'SELFIE', 'CERTIFICATE'] },
        fileUrl: { type: 'string', format: 'uri' },
      } } },
    }, wrap(uploadDocument));

    // Skills
    s.get('/me/skills',             wrap(getSkills));
    s.post('/me/skills', {
      schema: { body: { type: 'object', required: ['serviceCategoryId'], properties: { serviceCategoryId: { type: 'string' }, experienceYears: { type: 'number', minimum: 0 } } } },
    }, wrap(addSkill));
    s.delete('/me/skills/:skillId', wrap(removeSkill));

    // Earnings & Finance
    s.get('/me/earnings',        wrap(getEarnings));
    s.get('/me/transactions',    wrap(getTransactions));
    s.get('/me/payouts',         wrap(getPayouts));
    s.post('/me/request-payout', {
      schema: { body: { type: 'object', required: ['amount'], properties: { amount: { type: 'number', minimum: 100 } } } },
    }, wrap(requestPayout));

    // Bank Details
    s.get('/me/bank-details', wrap(getBankDetails));
    s.put('/me/bank-details', {
      schema: { body: { type: 'object', required: ['payoutMethod'], properties: {
        payoutMethod:  { type: 'string', enum: ['bank', 'upi'] },
        bankAccountNo: { type: 'string' },
        bankIfsc:      { type: 'string', pattern: '^[A-Z]{4}0[A-Z0-9]{6}$' },
        bankName:      { type: 'string' },
        upiId:         { type: 'string' },
      } } },
    }, wrap(updateBankDetails));

    // Stats
    s.get('/me/stats', wrap(getStats));

    // Notifications
    s.get('/me/notifications',              wrap(getNotifications));
    s.get('/me/notifications/unread-count', wrap(getUnreadNotificationCount));
    s.post('/me/notifications/read',        wrap(markNotificationsRead));


    // Rewards & Subscription
    s.get('/me/rewards',            wrap(getRewards));
    s.get('/me/incentive-programs', wrap(getIncentivePrograms));
    s.get('/me/subscription',       wrap(getSubscription));

    // POST /api/v1/workers/me/subscription/upgrade
    s.post('/me/subscription/upgrade', {
      schema: {
        body: {
          type: 'object', required: ['plan'],
          properties: {
            plan:      { type: 'string', enum: ['SILVER', 'GOLD', 'PLATINUM'] },
            autoRenew: { type: 'boolean' },
          },
        },
      },
    }, wrap(async (req: any, rep: any) => {
      const { plan, autoRenew = false } = req.body as { plan: string; autoRenew: boolean };
      const workerId = req.currentUser.id;

      // Subscription pricing (paise mein)
      const PLAN_PRICE: Record<string, number> = {
        SILVER:   19900,   // ₹199/month
        GOLD:     49900,   // ₹499/month
        PLATINUM: 99900,   // ₹999/month
      };
      const price = PLAN_PRICE[plan];

      // Worker wallet check
      const worker = await db.worker.findUnique({
        where:  { id: workerId },
        select: { walletBalance: true, name: true },
        include: { subscription: true } as any,
      } as any);
      if (!worker) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Worker nahi mila.' } });

      const anyWorker = worker as any;
      if (anyWorker.walletBalance < price) {
        return rep.status(400).send({
          success: false,
          error: {
            code: 'INSUFFICIENT_BALANCE',
            message: `Wallet mein kam paise hain. ₹${(price/100).toFixed(0)} chahiye, aapke paas ₹${(anyWorker.walletBalance/100).toFixed(0)} hain.`,
          },
        });
      }

      const balanceBefore = anyWorker.walletBalance;
      const expiresAt     = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      // Upsert subscription + deduct wallet in one transaction
      const [subscription] = await db.$transaction([
        db.workerSubscription.upsert({
          where:  { workerId },
          update: { plan: plan as any, status: 'ACTIVE', startedAt: new Date(), expiresAt, autoRenew, cancelledAt: null, cancelReason: null },
          create: { workerId, plan: plan as any, status: 'ACTIVE', startedAt: new Date(), expiresAt, autoRenew },
        }),
        db.worker.update({
          where: { id: workerId },
          data:  { walletBalance: { decrement: price } },
        }),
        db.transaction.create({
          data: {
            workerId,
            type:          'SUBSCRIPTION_CHARGE',
            amount:        price,
            balanceBefore,
            balanceAfter:  balanceBefore - price,
            description:   `${plan} subscription — 30 din ke liye`,
          },
        }),
      ]);

      return rep.status(201).send({
        success: true,
        data: {
          message:     `${plan} subscription active ho gaya! ₹${(price/100).toFixed(0)} wallet se deduct hue.`,
          subscription,
          expiresAt,
          amountCharged: price,
        },
      });
    }));

    // POST /api/v1/workers/me/subscription/cancel
    s.post('/me/subscription/cancel', {
      schema: {
        body: {
          type: 'object',
          properties: { reason: { type: 'string' } },
        },
      },
    }, wrap(async (req: any, rep: any) => {
      const { reason } = req.body as { reason?: string };
      const sub = await db.workerSubscription.findUnique({ where: { workerId: req.currentUser.id } });
      if (!sub || sub.status !== 'ACTIVE') {
        return rep.status(400).send({ success: false, error: { code: 'NO_SUBSCRIPTION', message: 'Koi active subscription nahi hai.' } });
      }
      await db.workerSubscription.update({
        where: { workerId: req.currentUser.id },
        data:  { autoRenew: false, cancelledAt: new Date(), cancelReason: reason ?? null },
      });
      return rep.send({
        success: true,
        data: { message: `Auto-renewal band kar diya. Subscription ${sub.expiresAt?.toLocaleDateString('en-IN')} tak active rahega.` },
      });
    }));
  });
}
