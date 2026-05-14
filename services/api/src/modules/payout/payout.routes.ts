// ═══════════════════════════════════════════════════════════════════
// INISTNT — Payout Routes
//
// Worker: POST /api/v1/workers/me/payout-request
// Webhook: POST /api/v1/webhooks/cashfree/payout
// Admin:   GET  /api/v1/admin/payouts
//          POST /api/v1/admin/payouts/:id/process (manual trigger)
// ═══════════════════════════════════════════════════════════════════

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { requireWorker, requireStaff, requirePermission } from '../../plugins/auth.middleware';
import { db }     from '../../infrastructure/database';
import { config } from '../../config';
import { createAndInitiatePayout, handleCashfreeWebhook } from './cashfree-payout.service';

function wrap(fn: Function) {
  return async (req: any, rep: any) => {
    try { return await fn(req, rep); }
    catch (err: any) {
      if (err.statusCode) return rep.status(err.statusCode).send({ success: false, error: { code: err.code, message: err.message } });
      req.log?.error(err);
      return rep.status(500).send({ success: false, error: { code: 'SERVER_ERROR', message: err.message ?? 'Kuch gadbad ho gayi.' } });
    }
  };
}

// ─── WORKER: Request Payout ──────────────────────────────────────
async function requestPayout(req: FastifyRequest, rep: FastifyReply) {
  const workerId = (req as any).currentUser.id;
  const { amount, method = 'upi' } = req.body as any;

  if (!amount || amount < 10000) { // Min ₹100
    return rep.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Minimum payout ₹100 hai' } });
  }
  if (!['bank', 'upi'].includes(method)) {
    return rep.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'method bank ya upi hona chahiye' } });
  }

  const worker = await db.worker.findUnique({
    where:  { id: workerId },
    select: {
      walletBalance: true, pendingPayout: true,
      bankAccountNo: true, bankIfsc: true, upiId: true,
    },
  });
  if (!worker) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Worker not found' } });

  const available = worker.walletBalance - worker.pendingPayout;
  if (amount > available) {
    return rep.status(400).send({
      success: false,
      error: {
        code:    'INSUFFICIENT_BALANCE',
        message: `Available balance ₹${available / 100} hai, requested ₹${amount / 100}`,
      },
    });
  }

  // Check UPI/bank details
  if (method === 'upi' && !worker.upiId) {
    return rep.status(400).send({ success: false, error: { code: 'MISSING_UPI', message: 'UPI ID set nahi hai. Profile mein add karein.' } });
  }
  if (method === 'bank' && (!worker.bankAccountNo || !worker.bankIfsc)) {
    return rep.status(400).send({ success: false, error: { code: 'MISSING_BANK', message: 'Bank details set nahi hain. Profile mein add karein.' } });
  }

  // Create payout record
  const payout = await db.workerPayout.create({
    data: {
      workerId,
      amount,
      payoutMethod: method,
      status:       'PENDING',
    },
  });

  // Mark as pending in wallet
  await db.worker.update({
    where: { id: workerId },
    data:  { pendingPayout: { increment: amount } },
  });

  // Initiate transfer async (don't await — webhook will confirm)
  createAndInitiatePayout(payout.id).catch(err =>
    req.log?.error({ payoutId: payout.id, err: err.message }, 'Payout initiation failed')
  );

  return rep.status(201).send({
    success: true,
    data: {
      payoutId: payout.id,
      amount,
      method,
      status:   'PROCESSING',
      message:  'Payout initiate ho gayi hai. 1-2 ghante mein transfer complete hoga.',
    },
  });
}

// Worker: payout history
async function getPayoutHistory(req: FastifyRequest, rep: FastifyReply) {
  const workerId = (req as any).currentUser.id;
  const q        = req.query as any;
  const skip     = ((q.page ?? 1) - 1) * 20;

  const [items, total] = await Promise.all([
    db.workerPayout.findMany({
      where:   { workerId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: 20,
    }),
    db.workerPayout.count({ where: { workerId } }),
  ]);

  return rep.send({ success: true, data: items, total, page: q.page ?? 1, totalPages: Math.ceil(total / 20) });
}

// ─── WEBHOOK: Cashfree callback ──────────────────────────────────
async function cashfreeWebhook(req: FastifyRequest, rep: FastifyReply) {
  // Verify webhook signature if CASHFREE_SECRET_KEY is set
  const signature = (req.headers as any)['x-cashfree-signature'];
  if (config.CASHFREE_SECRET_KEY && signature) {
    const rawBody = JSON.stringify(req.body);
    const expected = crypto
      .createHmac('sha256', config.CASHFREE_SECRET_KEY!)
      .update(rawBody)
      .digest('base64');
    if (signature !== expected) {
      return rep.status(401).send({ success: false, error: { code: 'INVALID_SIGNATURE', message: 'Webhook signature mismatch' } });
    }
  }

  await handleCashfreeWebhook(req.body as any);
  return rep.send({ success: true });
}

// ─── ADMIN: List all payouts ──────────────────────────────────────
async function adminListPayouts(req: FastifyRequest, rep: FastifyReply) {
  const q    = req.query as any;
  const skip = ((parseInt(q.page ?? '1')) - 1) * 20;
  const where: any = {};
  if (q.status) where.status = q.status;
  if (q.workerId) where.workerId = q.workerId;

  const [items, total] = await Promise.all([
    db.workerPayout.findMany({
      where,
      include: { worker: { select: { name: true, mobile: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: 20,
    }),
    db.workerPayout.count({ where }),
  ]);
  return rep.send({ success: true, data: items, total, totalPages: Math.ceil(total / 20) });
}

// ADMIN: Manually trigger payout (for stuck PENDING ones)
async function adminProcessPayout(req: FastifyRequest, rep: FastifyReply) {
  const { payoutId } = req.params as any;
  const payout = await db.workerPayout.findUnique({ where: { id: payoutId } });
  if (!payout) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Payout nahi mila' } });
  if (payout.status === 'COMPLETED') {
    return rep.status(400).send({ success: false, error: { code: 'ALREADY_DONE', message: 'Payout already completed hai' } });
  }

  await createAndInitiatePayout(payoutId);
  const updated = await db.workerPayout.findUnique({ where: { id: payoutId } });
  return rep.send({ success: true, data: updated });
}

// ─── ROUTE REGISTRATION ──────────────────────────────────────────
export async function workerPayoutRoutes(server: FastifyInstance) {
  server.post('/me/payout-request', { preHandler: [requireWorker] }, wrap(requestPayout));
  server.get('/me/payouts',         { preHandler: [requireWorker] }, wrap(getPayoutHistory));
}

export async function webhookRoutes(server: FastifyInstance) {
  // No auth — Cashfree calls this directly
  server.post('/cashfree/payout', wrap(cashfreeWebhook));
}

export async function adminPayoutRoutes(server: FastifyInstance) {
  const perm = (p: string) => [requireStaff, requirePermission(p as any)];
  server.get('/payouts',                  { preHandler: perm('view:workers')   }, wrap(adminListPayouts));
  server.post('/payouts/:payoutId/process', { preHandler: perm('manage:workers') }, wrap(adminProcessPayout));
}
