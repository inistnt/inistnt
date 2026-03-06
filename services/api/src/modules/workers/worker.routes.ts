import type { FastifyInstance } from 'fastify';
import { requireWorker } from '../../plugins/auth.middleware';
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

  // ─── PUBLIC (no auth) ──────────────────────────────────────
  server.get('/:workerId/profile', wrap(getPublicProfile));
  server.get('/:workerId/reviews', wrap(getWorkerReviews));

  // ─── PRIVATE (worker auth required) ───────────────────────
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
    s.get('/me/skills',              wrap(getSkills));
    s.post('/me/skills', {
      schema: { body: { type: 'object', required: ['serviceCategoryId'], properties: { serviceCategoryId: { type: 'string' }, experienceYears: { type: 'number', minimum: 0 } } } },
    }, wrap(addSkill));
    s.delete('/me/skills/:skillId',  wrap(removeSkill));

    // Earnings & Finance
    s.get('/me/earnings',         wrap(getEarnings));
    s.get('/me/transactions',     wrap(getTransactions));
    s.get('/me/payouts',          wrap(getPayouts));
    s.post('/me/request-payout', {
      schema: { body: { type: 'object', required: ['amount'], properties: { amount: { type: 'number', minimum: 100 } } } },
    }, wrap(requestPayout));

    // Bank Details
    s.get('/me/bank-details',  wrap(getBankDetails));
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
    s.get('/me/rewards',              wrap(getRewards));
    s.get('/me/incentive-programs',   wrap(getIncentivePrograms));
    s.get('/me/subscription',         wrap(getSubscription));
  });
}
