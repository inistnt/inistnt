// ═══════════════════════════════════════════════════════════════════
// INISTNT — TDS Reporting Service
//
// TDS (Tax Deducted at Source) — Section 194C
// Rule: Worker ka annual payout > ₹30,000 → 1% TDS deduct
// Quarterly filing: Apr-Jun (Q1), Jul-Sep (Q2), Oct-Dec (Q3), Jan-Mar (Q4)
// ═══════════════════════════════════════════════════════════════════

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireStaff, requirePermission } from '../../plugins/auth.middleware';
import { db } from '../../infrastructure/database';

const TDS_THRESHOLD_PAISE = 3000000; // ₹30,000
const TDS_RATE = 0.01;               // 1% (194C for contractors)

// ─── REPOSITORY ─────────────────────────────────────────────────────────────

export const tdsRepo = {

  // Worker-wise payout totals for a financial year
  getWorkerPayoutTotals: async (financialYear: string, cityId?: string) => {
    // FY format: "2025-26" → Apr 2025 to Mar 2026
    const [startYearStr, endYearSuffix] = financialYear.split('-');
    const startYear = parseInt(startYearStr);
    const endYear   = startYear + 1;

    const fyStart = new Date(`${startYear}-04-01T00:00:00.000Z`);
    const fyEnd   = new Date(`${endYear}-03-31T23:59:59.999Z`);

    const workerFilter: any = {};
    if (cityId) workerFilter.cityId = cityId;

    const payouts = await db.workerPayout.findMany({
      where: {
        status:     'COMPLETED',
        processedAt: { gte: fyStart, lte: fyEnd },
        worker:     Object.keys(workerFilter).length ? workerFilter : undefined,
      },
      include: {
        worker: {
          select: {
            id: true, name: true, mobile: true, panNumber: true,
            bankAccountNo: true, bankIfsc: true,
            city: { select: { nameEn: true } },
          },
        },
      },
    });

    // Group by worker
    const workerMap = new Map<string, {
      worker:       any;
      totalPayout:  number;
      tdsApplicable: boolean;
      tdsAmount:    number;
      payoutCount:  number;
    }>();

    for (const payout of payouts) {
      const existing = workerMap.get(payout.workerId);
      if (existing) {
        existing.totalPayout += payout.amount;
        existing.payoutCount++;
      } else {
        workerMap.set(payout.workerId, {
          worker:        payout.worker,
          totalPayout:   payout.amount,
          tdsApplicable: false,
          tdsAmount:     0,
          payoutCount:   1,
        });
      }
    }

    // Calculate TDS
    for (const [, record] of workerMap) {
      if (record.totalPayout >= TDS_THRESHOLD_PAISE) {
        record.tdsApplicable = true;
        record.tdsAmount     = Math.floor(record.totalPayout * TDS_RATE);
      }
    }

    const records = Array.from(workerMap.values());
    const tdsWorkers = records.filter(r => r.tdsApplicable);

    return {
      financialYear,
      totalWorkers:       records.length,
      tdsApplicableCount: tdsWorkers.length,
      totalPayoutsPaise:  records.reduce((s, r) => s + r.totalPayout, 0),
      totalTdsPaise:      tdsWorkers.reduce((s, r) => s + r.tdsAmount, 0),
      records,
    };
  },

  // Quarterly breakdown for a worker
  getWorkerTdsDetail: async (workerId: string, financialYear: string) => {
    const [startYearStr] = financialYear.split('-');
    const startYear = parseInt(startYearStr);
    const endYear   = startYear + 1;

    const quarters = [
      { label: 'Q1 (Apr-Jun)', start: new Date(`${startYear}-04-01`), end: new Date(`${startYear}-06-30T23:59:59`) },
      { label: 'Q2 (Jul-Sep)', start: new Date(`${startYear}-07-01`), end: new Date(`${startYear}-09-30T23:59:59`) },
      { label: 'Q3 (Oct-Dec)', start: new Date(`${startYear}-10-01`), end: new Date(`${startYear}-12-31T23:59:59`) },
      { label: 'Q4 (Jan-Mar)', start: new Date(`${endYear}-01-01`),   end: new Date(`${endYear}-03-31T23:59:59`) },
    ];

    const worker = await db.worker.findUnique({
      where:  { id: workerId },
      select: { id: true, name: true, mobile: true, panNumber: true },
    });

    const quarterlyBreakdown = await Promise.all(
      quarters.map(async (q) => {
        const agg = await db.workerPayout.aggregate({
          where: {
            workerId,
            status:      'COMPLETED',
            processedAt: { gte: q.start, lte: q.end },
          },
          _sum:   { amount: true },
          _count: { id: true },
        });

        const payout = agg._sum.amount ?? 0;
        const tds    = payout >= TDS_THRESHOLD_PAISE ? Math.floor(payout * TDS_RATE) : 0;

        return {
          quarter:      q.label,
          payoutPaise:  payout,
          payoutRupees: payout / 100,
          tdsPaise:     tds,
          tdsRupees:    tds / 100,
          payoutCount:  agg._count.id,
        };
      })
    );

    const annualPayout = quarterlyBreakdown.reduce((s, q) => s + q.payoutPaise, 0);
    const annualTds    = annualPayout >= TDS_THRESHOLD_PAISE ? Math.floor(annualPayout * TDS_RATE) : 0;

    return {
      worker,
      financialYear,
      quarterlyBreakdown,
      annualPayoutPaise:  annualPayout,
      annualPayoutRupees: annualPayout / 100,
      annualTdsPaise:     annualTds,
      annualTdsRupees:    annualTds / 100,
      tdsApplicable:      annualPayout >= TDS_THRESHOLD_PAISE,
    };
  },

  // Summary for admin finance dashboard
  getFinanceSummary: async (dateFrom: string, dateTo: string, cityId?: string) => {
    const from = new Date(dateFrom);
    const to   = new Date(dateTo);
    const cityFilter = cityId ? { cityId } : {};

    const [gmv, platformRevenue, totalPayouts, totalRefunds, activeSubscriptions] = await Promise.all([
      // GMV = all captured payments
      db.payment.aggregate({
        where: { status: 'CAPTURED', createdAt: { gte: from, lte: to } },
        _sum:  { amount: true },
      }),
      // Platform revenue = commission collected
      db.booking.aggregate({
        where: { status: 'COMPLETED', completedAt: { gte: from, lte: to }, ...cityFilter },
        _sum:  { commissionAmount: true },
      }),
      // Total payouts processed
      db.workerPayout.aggregate({
        where: { status: 'COMPLETED', processedAt: { gte: from, lte: to } },
        _sum:  { amount: true },
      }),
      // Refunds
      db.payment.aggregate({
        where: { status: 'REFUNDED', updatedAt: { gte: from, lte: to } },
        _sum:  { amount: true },
      }),
      // Active subscriptions
      db.workerSubscription.count({
        where: { status: 'ACTIVE', plan: { not: 'FREE' } },
      }),
    ]);

    const gmvTotal      = gmv._sum.amount ?? 0;
    const revenueTotal  = platformRevenue._sum.commissionAmount ?? 0;
    const payoutsTotal  = totalPayouts._sum.amount ?? 0;
    const refundsTotal  = totalRefunds._sum.amount ?? 0;
    const takeRate      = gmvTotal > 0 ? Math.round((revenueTotal / gmvTotal) * 10000) / 100 : 0;

    return {
      period: { from: dateFrom, to: dateTo },
      gmv:                  { paise: gmvTotal,     rupees: gmvTotal / 100 },
      revenue:              { paise: revenueTotal, rupees: revenueTotal / 100 },
      payouts:              { paise: payoutsTotal, rupees: payoutsTotal / 100 },
      refunds:              { paise: refundsTotal, rupees: refundsTotal / 100 },
      takeRatePercent:      takeRate,
      activeSubscriptions,
      estimatedTds:         { paise: Math.floor(payoutsTotal * TDS_RATE), rupees: Math.floor(payoutsTotal * TDS_RATE) / 100 },
    };
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

async function getTdsReport(req: FastifyRequest, rep: FastifyReply) {
  const q = req.query as any;
  const financialYear = q.fy ?? `${new Date().getFullYear() - 1}-${String(new Date().getFullYear()).slice(-2)}`;
  const data = await tdsRepo.getWorkerPayoutTotals(financialYear, q.cityId);
  return rep.send({ success: true, data });
}

async function getWorkerTdsDetail(req: FastifyRequest, rep: FastifyReply) {
  const { workerId } = req.params as any;
  const q = req.query as any;
  const financialYear = q.fy ?? `${new Date().getFullYear() - 1}-${String(new Date().getFullYear()).slice(-2)}`;
  const data = await tdsRepo.getWorkerTdsDetail(workerId, financialYear);
  return rep.send({ success: true, data });
}

async function getFinanceSummary(req: FastifyRequest, rep: FastifyReply) {
  const q = req.query as any;
  if (!q.dateFrom || !q.dateTo) {
    return rep.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'dateFrom, dateTo required' } });
  }
  const data = await tdsRepo.getFinanceSummary(q.dateFrom, q.dateTo, q.cityId);
  return rep.send({ success: true, data });
}

// ─── ROUTES ─────────────────────────────────────────────────────────────────

export async function tdsRoutes(server: FastifyInstance) {
  const auth = [requireStaff, requirePermission('view:analytics' as any)];

  // GET /admin/finance/tds?fy=2025-26&cityId=...
  server.get('/tds',                    { preHandler: auth }, wrap(getTdsReport));

  // GET /admin/finance/tds/:workerId?fy=2025-26
  server.get('/tds/:workerId',          { preHandler: auth }, wrap(getWorkerTdsDetail));

  // GET /admin/finance/summary?dateFrom=2025-04-01&dateTo=2025-06-30
  server.get('/summary',                { preHandler: auth }, wrap(getFinanceSummary));
}
