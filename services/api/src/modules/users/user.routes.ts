import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../plugins/auth.middleware';
import {
  getMe, updateMe, deleteMe,
  getAddresses, createAddress, updateAddress, deleteAddress, setDefaultAddress,
  getLoyaltyPoints, getLoyaltyHistory,
  getTransactions,
  getNotifications, getUnreadNotificationCount, markNotificationsRead, markAllNotificationsRead,
  getReferralInfo,
  createDispute, getMyDisputes,
} from './user.controller';

function wrap(fn: Function) {
  return async (req: any, rep: any) => {
    try { return await fn(req, rep); }
    catch (err: any) {
      if (err.statusCode) return rep.status(err.statusCode).send({ success: false, error: { code: err.code ?? 'ERROR', message: err.message } });
      throw err;
    }
  };
}

export async function userRoutes(server: FastifyInstance) {

  server.addHook('preHandler', requireUser);

  // ─── PROFILE ──────────────────────────────────────────────
  server.get('/me', wrap(getMe));
  server.patch('/me', {
    schema: { body: { type: 'object', properties: {
      name:          { type: 'string', minLength: 2, maxLength: 100 },
      email:         { type: 'string', format: 'email' },
      preferredLang: { type: 'string', enum: ['hi', 'en'] },
    } } },
  }, wrap(updateMe));
  server.delete('/me', wrap(deleteMe));

  // ─── ADDRESSES ────────────────────────────────────────────
  server.get('/me/addresses', wrap(getAddresses));
  server.post('/me/addresses', {
    schema: { body: { type: 'object', required: ['tag', 'street', 'area', 'city', 'state', 'pincode', 'lat', 'lng'],
      properties: {
        tag: { type: 'string' }, flat: { type: 'string' }, building: { type: 'string' },
        street: { type: 'string' }, area: { type: 'string' }, city: { type: 'string' },
        state: { type: 'string' }, pincode: { type: 'string', pattern: '^[1-9][0-9]{5}$' },
        lat: { type: 'number' }, lng: { type: 'number' }, isDefault: { type: 'boolean' },
      },
    } },
  }, wrap(createAddress));
  server.put('/me/addresses/:addressId',           wrap(updateAddress));
  server.delete('/me/addresses/:addressId',        wrap(deleteAddress));
  server.patch('/me/addresses/:addressId/default', wrap(setDefaultAddress));

  // ─── LOYALTY ──────────────────────────────────────────────
  server.get('/me/points',         wrap(getLoyaltyPoints));
  server.get('/me/points/history', wrap(getLoyaltyHistory));

  // ─── TRANSACTIONS ─────────────────────────────────────────
  server.get('/me/transactions', wrap(getTransactions));

  // ─── NOTIFICATIONS ────────────────────────────────────────
  server.get('/me/notifications',              wrap(getNotifications));
  server.get('/me/notifications/unread-count', wrap(getUnreadNotificationCount));
  server.post('/me/notifications/read',        wrap(markNotificationsRead));
  server.post('/me/notifications/read-all',    wrap(markAllNotificationsRead));

  // ─── REFERRAL ─────────────────────────────────────────────
  server.get('/me/referral', wrap(getReferralInfo));

  // ─── DISPUTES ─────────────────────────────────────────────
  server.get('/me/disputes', wrap(getMyDisputes));
  server.post('/me/disputes', {
    schema: { body: { type: 'object', required: ['bookingId', 'category', 'description'],
      properties: {
        bookingId:   { type: 'string' },
        category:    { type: 'string', enum: ['PAYMENT', 'WORKER_BEHAVIOUR', 'WORK_QUALITY', 'LATE_ARRIVAL', 'OTHER'] },
        description: { type: 'string', minLength: 20 },
      },
    } },
  }, wrap(createDispute));
}
