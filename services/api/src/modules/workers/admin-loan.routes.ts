// Admin loan management — ye admin.routes.ts mein add hoga
// Alag file mein rakha taaki clearly identifiable ho
// In routes ko admin.routes.ts ke registerRoutes function mein add karo

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireStaff, requirePermission } from '../../plugins/auth.middleware';
import { injectScope } from '../../plugins/scope.middleware';
import { loanRepo } from './worker-loan.routes';

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

async function getPendingLoans(_req: FastifyRequest, rep: FastifyReply) {
  const data = await loanRepo.getPendingLoans();
  return rep.send({ success: true, data });
}

async function getAllLoans(req: FastifyRequest, rep: FastifyReply) {
  const q = req.query as any;
  const data = await loanRepo.getAllLoans({
    status: q.status,
    page:   q.page  ? parseInt(q.page)  : 1,
    limit:  q.limit ? parseInt(q.limit) : 20,
  });
  return rep.send({ success: true, ...data });
}

async function approveLoan(req: FastifyRequest, rep: FastifyReply) {
  const { loanId } = req.params as any;
  const staffId = (req as any).currentUser.id;

  const loan = await loanRepo.getLoanById(loanId);
  if (!loan) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Loan nahi mila' } });
  if (loan.status !== 'pending_approval') {
    return rep.status(400).send({ success: false, error: { code: 'INVALID_STATE', message: `Loan already ${loan.status} hai` } });
  }

  const data = await loanRepo.approveLoan(loanId, staffId);
  return rep.send({ success: true, data });
}

async function rejectLoan(req: FastifyRequest, rep: FastifyReply) {
  const { loanId } = req.params as any;
  const { reason } = req.body as any;
  if (!reason) {
    return rep.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'reason required' } });
  }

  const staffId = (req as any).currentUser.id;
  const loan = await loanRepo.getLoanById(loanId);
  if (!loan) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Loan nahi mila' } });

  const data = await loanRepo.rejectLoan(loanId, staffId, reason);
  return rep.send({ success: true, data });
}

const perm = (p: string) => [requireStaff, injectScope, requirePermission(p as any)];

export async function adminLoanRoutes(server: FastifyInstance) {
  server.get('/loans/pending',          { preHandler: perm('view:workers')   }, wrap(getPendingLoans));
  server.get('/loans',                  { preHandler: perm('view:workers')   }, wrap(getAllLoans));
  server.post('/loans/:loanId/approve', { preHandler: perm('manage:workers') }, wrap(approveLoan));
  server.post('/loans/:loanId/reject',  { preHandler: perm('manage:workers') }, wrap(rejectLoan));
}
