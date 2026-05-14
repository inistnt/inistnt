import type { FastifyInstance } from 'fastify';
import { requireStaff } from '../../plugins/auth.middleware';
import {
  getRevenueAnalytics,
  getBookingAnalytics,
  getWorkerAnalytics,
  getCityAnalytics,
} from './analytics.controller';
import { buildCustomReport, getReportBuilderConfig } from './analytics.controller';

function wrap(fn: Function) {
  return async (req: any, rep: any) => {
    try { return await fn(req, rep); }
    catch (err: any) {
      if (err.statusCode) return rep.status(err.statusCode).send({ success: false, error: { code: err.code ?? 'ERROR', message: err.message } });
      throw err;
    }
  };
}

export async function analyticsRoutes(server: FastifyInstance) {
  server.addHook('preHandler', requireStaff);

  server.get('/revenue',  wrap(getRevenueAnalytics));
  server.get('/bookings', wrap(getBookingAnalytics));
  server.get('/workers',  wrap(getWorkerAnalytics));
  server.get('/cities',   wrap(getCityAnalytics));

  // ─── Custom Report Builder ────────────────────────────────────
  // GET  /analytics/report-config  — available metrics/dimensions
  // POST /analytics/custom-report  — run custom report
  server.get('/report-config',   wrap(getReportBuilderConfig));
  server.post('/custom-report',  wrap(buildCustomReport));
}
