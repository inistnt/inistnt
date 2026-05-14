// ═══════════════════════════════════════════════════════════════════
// INISTNT — Worker Loan Routes
// Worker-facing: loan apply, status, history
// Admin-facing:  loan approve/reject, disburse
// Prefix: /api/v1/workers/me/loans  (worker)
//         /api/v1/admin/loans        (admin)
// ═══════════════════════════════════════════════════════════════════

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireWorker } from '../../plugins/auth.middleware';
import { db } from '../../infrastructure/database';

// ─── REPOSITORY ─────────────────────────────────────────────────────────────

const loanRepo = {

  getWorkerLoans: async (workerId: string) => {
    return db.workerLoan.findMany({
      where:   { workerId },
      orderBy: { createdAt: 'desc' },
    });
  },

  getLoanById: async (loanId: string, workerId?: string) => {
    return db.workerLoan.findFirst({
      where: { id: loanId, ...(workerId ? { workerId } : {}) },
    });
  },

  applyForLoan: async (workerId: string, data: {
    amount:   number;
    purpose:  string;
    emiAmount: number;
  }) => {
    return db.workerLoan.create({
      data: {
        workerId,
        amount:      data.amount,
        outstanding: data.amount,
        purpose:     data.purpose,
        emiAmount:   data.emiAmount,
        status:      'pending_approval',
      },
    });
  },

  approveLoan: async (loanId: string, approvedById: string) => {
    return db.$transaction(async (tx) => {
      const loan = await tx.workerLoan.update({
        where: { id: loanId },
        data:  { status: 'active', approvedById, approvedAt: new Date() },
      });

      // Credit worker wallet
      const worker = await tx.worker.findUnique({
        where:  { id: loan.workerId },
        select: { walletBalance: true },
      });

      await tx.worker.update({
        where: { id: loan.workerId },
        data:  { walletBalance: { increment: loan.amount } },
      });

      await tx.transaction.create({
        data: {
          type:          'LOAN_DISBURSEMENT',
          amount:         loan.amount,
          workerId:       loan.workerId,
          loanId:         loan.id,
          balanceBefore:  worker?.walletBalance ?? 0,
          balanceAfter:  (worker?.walletBalance ?? 0) + loan.amount,
          description:   `Loan disbursed — ₹${loan.amount / 100} (${loan.purpose})`,
          metadata:      { loanId: loan.id, approvedById },
        },
      });

      await tx.auditLog.create({
        data: {
          action:     'loan.approved',
          entityType: 'worker_loan',
          entityId:   loanId,
          actorId:    approvedById,
          actorRole:  'admin',
          after:      { status: 'active', disbursed: loan.amount },
        },
      });

      return loan;
    });
  },

  rejectLoan: async (loanId: string, rejectedById: string, reason: string) => {
    return db.$transaction([
      db.workerLoan.update({
        where: { id: loanId },
        data:  { status: 'rejected' },
      }),
      db.auditLog.create({
        data: {
          action:     'loan.rejected',
          entityType: 'worker_loan',
          entityId:   loanId,
          actorId:    rejectedById,
          actorRole:  'admin',
          reason,
        },
      }),
    ]);
  },

  // Booking complete hone pe EMI deduct karo
  deductEmi: async (workerId: string, bookingId: string) => {
    const activeLoan = await db.workerLoan.findFirst({
      where:   { workerId, status: 'active' },
      orderBy: { createdAt: 'asc' }, // oldest loan first
    });

    if (!activeLoan || activeLoan.outstanding <= 0) return null;

    const deductAmount = Math.min(activeLoan.emiAmount, activeLoan.outstanding);
    const newOutstanding = activeLoan.outstanding - deductAmount;
    const isClosed = newOutstanding <= 0;

    const worker = await db.worker.findUnique({
      where:  { id: workerId },
      select: { walletBalance: true },
    });

    if (!worker || worker.walletBalance < deductAmount) return null; // Insufficient balance

    await db.$transaction([
      db.workerLoan.update({
        where: { id: activeLoan.id },
        data:  {
          outstanding:   newOutstanding,
          lastDeductedAt: new Date(),
          status:         isClosed ? 'closed' : 'active',
          closedAt:       isClosed ? new Date() : null,
        },
      }),
      db.worker.update({
        where: { id: workerId },
        data:  { walletBalance: { decrement: deductAmount } },
      }),
      db.transaction.create({
        data: {
          type:          'LOAN_REPAYMENT',
          amount:        -deductAmount,
          workerId,
          loanId:         activeLoan.id,
          bookingId,
          balanceBefore:  worker.walletBalance,
          balanceAfter:   worker.walletBalance - deductAmount,
          description:   `Loan EMI deducted — outstanding: ₹${newOutstanding / 100}`,
          metadata:      { loanId: activeLoan.id, isClosed, bookingId },
        },
      }),
    ]);

    return { deductAmount, newOutstanding, isClosed };
  },

  // Admin: pending approval ke loans
  getPendingLoans: async () => {
    return db.workerLoan.findMany({
      where:   { status: 'pending_approval' },
      include: {
        worker: { select: { id: true, name: true, mobile: true, tier: true, totalJobs: true, rating: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  getAllLoans: async (params: { status?: string; page?: number; limit?: number }) => {
    const { status, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      db.workerLoan.findMany({
        where,
        include: { worker: { select: { id: true, name: true, mobile: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.workerLoan.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },
};

// ─── CONTROLLERS ────────────────────────────────────────────────────────────

function wrap(fn: Function) {
  return async (req: any, rep: any) => {
    try {
      return await fn(req, rep);
    } catch (err: any) {
      if (err.statusCode) return rep.status(err.statusCode).send({ success: false, error: { code: err.code, message: err.message } });
      req.log?.error(err);
      return rep.status(500).send({ success: false, error: { code: 'SERVER_ERROR', message: 'Kuch gadbad ho gayi.' } });
    }
  };
}

// Worker: apne loans dekho
async function getMyLoans(req: FastifyRequest, rep: FastifyReply) {
  const workerId = (req as any).currentUser.id;
  const loans = await loanRepo.getWorkerLoans(workerId);
  return rep.send({ success: true, data: loans });
}

// Worker: loan ke liye apply karo
async function applyForLoan(req: FastifyRequest, rep: FastifyReply) {
  const workerId = (req as any).currentUser.id;
  const { amount, purpose } = req.body as any;

  if (!amount || !purpose) {
    return rep.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'amount, purpose required' } });
  }
  if (amount < 100000 || amount > 5000000) { // ₹1000 to ₹50000
    return rep.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Loan amount ₹1,000 to ₹50,000 ke beech hona chahiye' } });
  }

  // Existing active loan check
  const existingLoan = await db.workerLoan.findFirst({
    where: { workerId, status: { in: ['active', 'pending_approval'] } },
  });
  if (existingLoan) {
    return rep.status(409).send({ success: false, error: { code: 'LOAN_EXISTS', message: 'Aapka ek loan already active hai' } });
  }

  // EMI: 10% of loan per booking (rounded)
  const emiAmount = Math.round(amount * 0.10);

  const loan = await loanRepo.applyForLoan(workerId, { amount, purpose, emiAmount });
  return rep.status(201).send({ success: true, data: loan });
}

// Worker: loan repayment history
async function getLoanRepayments(req: FastifyRequest, rep: FastifyReply) {
  const workerId = (req as any).currentUser.id;
  const { loanId } = req.params as any;

  const loan = await loanRepo.getLoanById(loanId, workerId);
  if (!loan) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Loan nahi mila' } });

  const repayments = await db.transaction.findMany({
    where:   { loanId, type: 'LOAN_REPAYMENT' },
    orderBy: { createdAt: 'desc' },
  });
  return rep.send({ success: true, data: repayments });
}

// ─── ROUTES ─────────────────────────────────────────────────────────────────

export async function workerLoanRoutes(server: FastifyInstance) {
  // Worker-facing routes (under /api/v1/workers)
  server.get('/me/loans',                { preHandler: [requireWorker] }, wrap(getMyLoans));
  server.post('/me/loans',               { preHandler: [requireWorker] }, wrap(applyForLoan));
  server.get('/me/loans/:loanId/repayments', { preHandler: [requireWorker] }, wrap(getLoanRepayments));
}

// Export deductEmi for booking completion handler
export { loanRepo };
