import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireUser } from '../../plugins/auth.middleware';
import { userProfileRepo } from './user.repository';
import { db } from '../../infrastructure/database';

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

  // Saare user routes pe authentication required hai
  server.addHook('preHandler', requireUser);

  // ─── PROFILE ──────────────────────────────────────────────

  // GET /api/v1/users/me
  server.get('/me', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const user = await userProfileRepo.findById(req.currentUser.id);
    if (!user) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User nahi mila.' } });
    return rep.send({ success: true, data: user });
  }));

  // PATCH /api/v1/users/me
  server.patch('/me', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name:          { type: 'string', minLength: 2, maxLength: 100 },
          email:         { type: 'string', format: 'email' },
          preferredLang: { type: 'string', enum: ['hi', 'en'] },
        },
      },
    },
  }, wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const data = req.body as { name?: string; email?: string; preferredLang?: string };
    const user = await userProfileRepo.update(req.currentUser.id, data);
    return rep.send({ success: true, data: user });
  }));

  // DELETE /api/v1/users/me — Account delete
  server.delete('/me', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    await db.user.update({ where: { id: req.currentUser.id }, data: { status: 'DELETED', deletedAt: new Date() } });
    return rep.send({ success: true, data: { message: 'Account delete ho gaya.' } });
  }));

  // PATCH /api/v1/users/me/fcm-token — FCM token update (app login ke baad call karo)
  server.patch('/me/fcm-token', {
    schema: {
      body: {
        type: 'object',
        required: ['fcmToken'],
        properties: {
          fcmToken: { type: 'string', minLength: 10 },
        },
      },
    },
  }, wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const { fcmToken } = req.body as { fcmToken: string };
    await db.user.update({ where: { id: req.currentUser.id }, data: { fcmToken } });
    return rep.send({ success: true, data: null });
  }));

  // ─── ADDRESSES ────────────────────────────────────────────

  // GET /api/v1/users/me/addresses
  server.get('/me/addresses', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const addresses = await userProfileRepo.getAddresses(req.currentUser.id);
    return rep.send({ success: true, data: addresses });
  }));

  // POST /api/v1/users/me/addresses
  server.post('/me/addresses', {
    schema: {
      body: {
        type: 'object',
        required: ['tag', 'street', 'area', 'city', 'state', 'pincode', 'lat', 'lng'],
        properties: {
          tag:       { type: 'string' },
          flat:      { type: 'string' },
          building:  { type: 'string' },
          street:    { type: 'string' },
          area:      { type: 'string' },
          city:      { type: 'string' },
          state:     { type: 'string' },
          pincode:   { type: 'string', pattern: '^[1-9][0-9]{5}$' },
          lat:       { type: 'number' },
          lng:       { type: 'number' },
          isDefault: { type: 'boolean' },
        },
      },
    },
  }, wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const address = await userProfileRepo.createAddress(req.currentUser.id, req.body as any);
    return rep.status(201).send({ success: true, data: address });
  }));

  // PUT /api/v1/users/me/addresses/:addressId
  server.put('/me/addresses/:addressId', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const { addressId } = req.params as { addressId: string };
    const existing = await userProfileRepo.getAddressById(addressId, req.currentUser.id);
    if (!existing) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Address nahi mila.' } });
    const updated = await userProfileRepo.updateAddress(addressId, req.currentUser.id, req.body as any);
    return rep.send({ success: true, data: updated });
  }));

  // DELETE /api/v1/users/me/addresses/:addressId
  server.delete('/me/addresses/:addressId', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const { addressId } = req.params as { addressId: string };
    const existing = await userProfileRepo.getAddressById(addressId, req.currentUser.id);
    if (!existing) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Address nahi mila.' } });
    await userProfileRepo.deleteAddress(addressId, req.currentUser.id);
    return rep.send({ success: true, data: null });
  }));

  // PATCH /api/v1/users/me/addresses/:addressId/default
  server.patch('/me/addresses/:addressId/default', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const { addressId } = req.params as { addressId: string };
    const existing = await userProfileRepo.getAddressById(addressId, req.currentUser.id);
    if (!existing) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Address nahi mila.' } });
    await userProfileRepo.setDefaultAddress(addressId, req.currentUser.id);
    return rep.send({ success: true, data: { message: 'Default address set ho gaya.' } });
  }));

  // ─── LOYALTY ──────────────────────────────────────────────

  // GET /api/v1/users/me/points
  server.get('/me/points', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const points = await userProfileRepo.getLoyaltyPoints(req.currentUser.id);
    return rep.send({ success: true, data: { points } });
  }));

  // GET /api/v1/users/me/points/history
  server.get('/me/points/history', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const { page = 1, limit = 20 } = req.query as { page?: number; limit?: number };
    const result = await userProfileRepo.getLoyaltyHistory(req.currentUser.id, +page, +limit);
    return rep.send({ success: true, data: result.items, meta: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages } });
  }));

  // ─── TRANSACTIONS ─────────────────────────────────────────

  // GET /api/v1/users/me/transactions
  server.get('/me/transactions', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const { page = 1, limit = 20 } = req.query as { page?: number; limit?: number };
    const result = await userProfileRepo.getTransactions(req.currentUser.id, +page, +limit);
    return rep.send({ success: true, data: result.items, meta: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages } });
  }));

  // ─── NOTIFICATIONS ────────────────────────────────────────

  // GET /api/v1/users/me/notifications
  server.get('/me/notifications', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const { page = 1, limit = 20 } = req.query as { page?: number; limit?: number };
    const result = await userProfileRepo.getNotifications(req.currentUser.id, +page, +limit);
    return rep.send({ success: true, data: result.items, meta: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages } });
  }));

  // GET /api/v1/users/me/notifications/unread-count
  server.get('/me/notifications/unread-count', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const count = await userProfileRepo.getUnreadCount(req.currentUser.id);
    return rep.send({ success: true, data: { count } });
  }));

  // POST /api/v1/users/me/notifications/read
  server.post('/me/notifications/read', {
    schema: {
      body: {
        type: 'object',
        properties: {
          notificationIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  }, wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const { notificationIds } = req.body as { notificationIds?: string[] };
    await userProfileRepo.markNotificationsRead(req.currentUser.id, notificationIds);
    return rep.send({ success: true, data: null });
  }));

  // POST /api/v1/users/me/notifications/read-all
  server.post('/me/notifications/read-all', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    await userProfileRepo.markNotificationsRead(req.currentUser.id);
    return rep.send({ success: true, data: null });
  }));

  // ─── DISPUTES ─────────────────────────────────────────────

  // POST /api/v1/users/me/disputes
  server.post('/me/disputes', {
    schema: {
      body: {
        type: 'object', required: ['bookingId', 'category', 'description'],
        properties: {
          bookingId:   { type: 'string' },
          category:    { type: 'string', enum: ['PAYMENT', 'WORKER_BEHAVIOUR', 'WORK_QUALITY', 'LATE_ARRIVAL', 'OTHER'] },
          description: { type: 'string', minLength: 20 },
        },
      },
    },
  }, wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const { bookingId, category, description } = req.body as any;
    const booking = await db.booking.findFirst({ where: { id: bookingId, userId: req.currentUser.id } });
    if (!booking) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Booking nahi mili.' } });
    const dispute = await db.dispute.create({
      data: {
        bookingId, userId: req.currentUser.id, workerId: booking.workerId,
        category, description, status: 'OPEN',
        priority: category === 'PAYMENT' ? 'HIGH' : 'MEDIUM',
      },
    });
    return rep.status(201).send({ success: true, data: dispute });
  }));

  // GET /api/v1/users/me/disputes
  server.get('/me/disputes', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const disputes = await db.dispute.findMany({
      where: { userId: req.currentUser.id },
      include: { booking: { select: { bookingNumber: true } }, notes: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    });
    return rep.send({ success: true, data: disputes });
  }));

  // ─── REFERRAL ─────────────────────────────────────────────

  // GET /api/v1/users/me/referral
  server.get('/me/referral', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const info = await userProfileRepo.getReferralInfo(req.currentUser.id);
    return rep.send({ success: true, data: info });
  }));

  // POST /api/v1/users/me/referral/apply — Referral code apply karo
  server.post('/me/referral/apply', {
    schema: {
      body: {
        type: 'object',
        required: ['code'],
        properties: { code: { type: 'string', minLength: 4, maxLength: 20 } },
      },
    },
  }, wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const { code } = req.body as { code: string };
    const userId   = req.currentUser.id;

    // Pehle check: kya is user ne pehle se koi referral apply kiya hai?
    const alreadyReferred = await db.referral.findFirst({ where: { referredUserId: userId } });
    if (alreadyReferred) {
      return rep.status(400).send({
        success: false, error: { code: 'ALREADY_REFERRED', message: 'Aapne pehle se ek referral code apply kar rakha hai.' },
      });
    }

    // Code se referrer dhundho — User ya Worker dono ho sakte hain
    const referrerUser = await db.user.findFirst({
      where: { referralCode: code.toUpperCase(), isDeleted: false },
      select: { id: true },
    });
    const referrerWorker = !referrerUser
      ? await db.worker.findFirst({
          where: { referralCode: code.toUpperCase(), isActive: true },
          select: { id: true },
        })
      : null;

    if (!referrerUser && !referrerWorker) {
      return rep.status(404).send({
        success: false, error: { code: 'INVALID_CODE', message: 'Yeh referral code valid nahi hai.' },
      });
    }

    // Apna code apply nahi kar sakte
    if (referrerUser?.id === userId) {
      return rep.status(400).send({
        success: false, error: { code: 'SELF_REFERRAL', message: 'Apna khud ka referral code use nahi kar sakte.' },
      });
    }

    // Referral record + wallet credit — ek transaction mein
    const user = await db.user.findUnique({ where: { id: userId }, select: { walletBalance: true } });
    const balanceBefore = user?.walletBalance ?? 0;

    await db.$transaction([
      db.referral.create({
        data: {
          code:               code.toUpperCase(),
          referrerType:       referrerUser ? 'user' : 'worker',
          referrerUserId:     referrerUser?.id,
          referrerWorkerId:   referrerWorker?.id,
          referredUserId:     userId,
          referrerBonusAmount: 5000,   // ₹50 referrer ko (after referred ka pehla booking)
          referredBonusAmount: 10000,  // ₹100 naye user ko
        },
      }),
      db.user.update({
        where: { id: userId },
        data:  { walletBalance: { increment: 10000 } },
      }),
      db.transaction.create({
        data: {
          userId,
          type:         'REFERRAL_BONUS',
          amount:       10000,
          balanceBefore,
          balanceAfter: balanceBefore + 10000,
          description:  `Referral bonus — code ${code.toUpperCase()} use karne ke liye ₹100`,
        },
      }),
    ]);

    return rep.status(201).send({
      success: true,
      data: {
        message:       'Referral code apply ho gaya! ₹100 wallet mein add kar diye.',
        bonusAdded:    10000,
        referrerBonus: 'Referrer ko ₹50 aapka pehla booking complete hone ke baad milenge.',
      },
    });
  }));

}
