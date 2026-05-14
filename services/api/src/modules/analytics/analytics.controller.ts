import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../infrastructure/database';

export async function getRevenueAnalytics(req: FastifyRequest, rep: FastifyReply) {
  const { cityId, days = 30 } = req.query as { cityId?: string; days?: number };
  const dateFrom = new Date(Date.now() - +days * 24 * 60 * 60 * 1000);

  const payments = await db.payment.findMany({
    where: {
      status: 'CAPTURED',
      createdAt: { gte: dateFrom },
      ...(cityId && { booking: { cityId } }),
    },
    select: { amount: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const byDay: Record<string, number> = {};
  for (const p of payments) {
    const day = p.createdAt.toISOString().split('T')[0];
    byDay[day] = (byDay[day] ?? 0) + p.amount;
  }

  const totalRevenue = payments.reduce((s, p) => s + p.amount, 0);
  const totalCount   = payments.length;

  return rep.send({
    success: true,
    data: {
      totalRevenue,
      totalBookingsPaid: totalCount,
      avgOrderValue: totalCount > 0 ? Math.round(totalRevenue / totalCount) : 0,
      chart: Object.entries(byDay).map(([date, amount]) => ({ date, amount })),
    },
  });
}

export async function getBookingAnalytics(req: FastifyRequest, rep: FastifyReply) {
  const { cityId, days = 30 } = req.query as { cityId?: string; days?: number };
  const dateFrom    = new Date(Date.now() - +days * 24 * 60 * 60 * 1000);
  const cityFilter  = cityId ? { cityId } : {};

  const [total, completed, cancelled, noWorker] = await Promise.all([
    db.booking.count({ where: { ...cityFilter, createdAt: { gte: dateFrom } } }),
    db.booking.count({ where: { ...cityFilter, createdAt: { gte: dateFrom }, status: 'COMPLETED' } }),
    db.booking.count({ where: { ...cityFilter, createdAt: { gte: dateFrom }, status: { in: ['CANCELLED_BY_USER','CANCELLED_BY_WORKER','CANCELLED_BY_ADMIN'] } } }),
    db.booking.count({ where: { ...cityFilter, createdAt: { gte: dateFrom }, status: 'NO_WORKER_FOUND' } }),
  ]);

  return rep.send({
    success: true,
    data: {
      total, completed, cancelled, noWorker,
      completionRate:   total > 0 ? Math.round((completed / total) * 100) : 0,
      cancellationRate: total > 0 ? Math.round((cancelled / total) * 100) : 0,
    },
  });
}

export async function getWorkerAnalytics(req: FastifyRequest, rep: FastifyReply) {
  const { cityId } = req.query as { cityId?: string };
  const cityFilter  = cityId ? { cityId } : {};

  const [total, verified, online, gig, fullTime, byTier] = await Promise.all([
    db.worker.count({ where: { ...cityFilter } }),
    db.worker.count({ where: { ...cityFilter, status: 'VERIFIED' } }),
    db.worker.count({ where: { ...cityFilter, isOnline: true } }),
    db.worker.count({ where: { ...cityFilter, employmentType: 'GIG' } }),
    db.worker.count({ where: { ...cityFilter, employmentType: 'FULL_TIME' } }),
    db.worker.groupBy({ by: ['tier'], where: cityFilter, _count: true }),
  ]);

  return rep.send({
    success: true,
    data: {
      total, verified, online, gig, fullTime,
      byTier: byTier.map(t => ({ tier: t.tier, count: t._count })),
    },
  });
}

export async function getCityAnalytics(_req: FastifyRequest, rep: FastifyReply) {
  const cities = await db.city.findMany({ where: { isActive: true }, select: { id: true, nameEn: true } });

  const stats = await Promise.all(cities.map(async (city) => {
    const [bookings, revenue, workers] = await Promise.all([
      db.booking.count({ where: { cityId: city.id } }),
      db.payment.aggregate({ where: { status: 'CAPTURED', booking: { cityId: city.id } }, _sum: { amount: true } }),
      db.worker.count({ where: { cityId: city.id } }),
    ]);
    return { cityId: city.id, cityName: city.nameEn, bookings, revenue: revenue._sum.amount ?? 0, workers };
  }));

  return rep.send({ success: true, data: stats });
}

// ═══════════════════════════════════════════════════════════════════
// CLICKHOUSE CUSTOM REPORT BUILDER
//
// POST /admin/analytics/custom-report
// Body: { dateFrom, dateTo, metric, dimensions, filters, groupBy, cityId? }
//
// ClickHouse tables expected (populated by Kafka consumer):
//   events (event_time, event_type, user_id, worker_id, booking_id, city_id, amount, metadata)
//
// Safe query builder — no raw SQL injection, only allowed columns
// ═══════════════════════════════════════════════════════════════════

import { createClient } from '@clickhouse/client';

let clickhouseClient: ReturnType<typeof createClient> | null = null;

function getClickhouse() {
  if (!clickhouseClient) {
    const host     = process.env.CLICKHOUSE_HOST     ?? 'localhost';
    const port     = process.env.CLICKHOUSE_PORT     ?? '8123';
    const username = process.env.CLICKHOUSE_USER     ?? 'inistnt';
    const password = process.env.CLICKHOUSE_PASSWORD ?? '';
    const database = process.env.CLICKHOUSE_DATABASE ?? 'inistnt_analytics';

    clickhouseClient = createClient({
      url:      `http://${host}:${port}`,
      username,
      password,
      database,
    });
  }
  return clickhouseClient;
}

// ─── ALLOWED CONFIG (prevent injection) ──────────────────────────
const ALLOWED_METRICS: Record<string, string> = {
  booking_count:       'COUNT(*)',
  completed_count:     "countIf(status = 'COMPLETED')",
  cancelled_count:     "countIf(status IN ('CANCELLED_BY_USER','CANCELLED_BY_WORKER','CANCELLED_BY_ADMIN'))",
  total_revenue:       'SUM(final_amount)',
  avg_order_value:     'AVG(final_amount)',
  total_commission:    'SUM(commission_amount)',
  worker_earnings:     'SUM(worker_earning)',
  unique_users:        'uniq(user_id)',
  unique_workers:      'uniq(worker_id)',
};

const ALLOWED_DIMENSIONS: Record<string, string> = {
  day:        "toDate(created_at) AS period",
  week:       "toMonday(created_at) AS period",
  month:      "toStartOfMonth(created_at) AS period",
  city_id:    "city_id",
  status:     "status",
  service_id: "service_id",
};

const ALLOWED_FILTERS: Record<string, string> = {
  city_id:    "city_id = {cityId:String}",
  status:     "status = {status:String}",
  service_id: "service_id = {serviceId:String}",
};

// ─── REPORT BUILDER ───────────────────────────────────────────────
export async function buildCustomReport(req: FastifyRequest, rep: FastifyReply) {
  const {
    dateFrom,
    dateTo,
    metric,
    dimension,
    filters = {},
    cityId,
  } = req.body as any;

  // Validate inputs
  if (!dateFrom || !dateTo || !metric) {
    return rep.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'dateFrom, dateTo, metric required' } });
  }

  const metricSql = ALLOWED_METRICS[metric];
  if (!metricSql) {
    return rep.status(400).send({
      success: false,
      error: {
        code:    'INVALID_METRIC',
        message: `Invalid metric. Allowed: ${Object.keys(ALLOWED_METRICS).join(', ')}`,
      },
    });
  }

  // Build SELECT
  const dimensionSql = dimension ? ALLOWED_DIMENSIONS[dimension] : null;
  if (dimension && !dimensionSql) {
    return rep.status(400).send({
      success: false,
      error: {
        code:    'INVALID_DIMENSION',
        message: `Invalid dimension. Allowed: ${Object.keys(ALLOWED_DIMENSIONS).join(', ')}`,
      },
    });
  }

  // Build WHERE clauses
  const whereClauses: string[] = [
    `created_at >= {dateFrom:DateTime}`,
    `created_at <= {dateTo:DateTime}`,
  ];
  const queryParams: Record<string, any> = {
    dateFrom: new Date(dateFrom).toISOString(),
    dateTo:   new Date(dateTo).toISOString(),
  };

  if (cityId) {
    whereClauses.push(`city_id = {cityId:String}`);
    queryParams.cityId = cityId;
  }

  for (const [key, value] of Object.entries(filters)) {
    const filterSql = ALLOWED_FILTERS[key];
    if (filterSql && value) {
      whereClauses.push(filterSql);
      queryParams[key] = value;
    }
  }

  const selectParts = [metricSql + ' AS value'];
  if (dimensionSql) selectParts.unshift(dimensionSql);

  const groupBy = dimensionSql
    ? `GROUP BY ${dimension === 'day' || dimension === 'week' || dimension === 'month' ? 'period' : dimensionSql.split(' AS ')[0]}`
    : '';

  const orderBy = dimensionSql ? 'ORDER BY period ASC' : '';

  const query = `
    SELECT ${selectParts.join(', ')}
    FROM bookings
    WHERE ${whereClauses.join(' AND ')}
    ${groupBy}
    ${orderBy}
    LIMIT 1000
  `.trim();

  try {
    const ch     = getClickhouse();
    const result = await ch.query({
      query,
      query_params: queryParams,
      format: 'JSONEachRow',
    });

    const rows = await result.json<any[]>();

    return rep.send({
      success: true,
      data: {
        rows,
        rowCount:  rows.length,
        metric,
        dimension: dimension ?? null,
        period:    { dateFrom, dateTo },
        query:     process.env.NODE_ENV === 'development' ? query : undefined,
      },
    });

  } catch (err: any) {
    // ClickHouse not available → fallback to Postgres aggregation
    req.log?.warn({ err: err.message }, '[Analytics] ClickHouse unavailable — falling back to Postgres');

    const from = new Date(dateFrom);
    const to   = new Date(dateTo);
    const cityFilter = cityId ? { cityId } : {};

    let fallbackData: any = {};

    if (metric === 'booking_count') {
      fallbackData = { value: await db.booking.count({ where: { ...cityFilter, createdAt: { gte: from, lte: to } } }) };
    } else if (metric === 'completed_count') {
      fallbackData = { value: await db.booking.count({ where: { ...cityFilter, status: 'COMPLETED', completedAt: { gte: from, lte: to } } }) };
    } else if (metric === 'total_revenue') {
      const agg = await db.payment.aggregate({ where: { status: 'CAPTURED', createdAt: { gte: from, lte: to } }, _sum: { amount: true } });
      fallbackData = { value: agg._sum.amount ?? 0 };
    } else if (metric === 'total_commission') {
      const agg = await db.booking.aggregate({ where: { ...cityFilter, status: 'COMPLETED', completedAt: { gte: from, lte: to } }, _sum: { commissionAmount: true } });
      fallbackData = { value: agg._sum.commissionAmount ?? 0 };
    }

    return rep.send({
      success: true,
      data: {
        rows:       [fallbackData],
        rowCount:   1,
        metric,
        dimension:  null,
        period:     { dateFrom, dateTo },
        source:     'postgres_fallback',
        warning:    'ClickHouse unavailable — simplified aggregation returned',
      },
    });
  }
}

// ─── AVAILABLE METRICS + DIMENSIONS (for frontend report builder UI) ──
export async function getReportBuilderConfig(_req: FastifyRequest, rep: FastifyReply) {
  return rep.send({
    success: true,
    data: {
      metrics: Object.keys(ALLOWED_METRICS).map(key => ({
        key,
        label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      })),
      dimensions: Object.keys(ALLOWED_DIMENSIONS).map(key => ({
        key,
        label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      })),
      filters: Object.keys(ALLOWED_FILTERS).map(key => ({
        key,
        label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      })),
    },
  });
}

// Add FastifyRequest import if not present at top
import type { FastifyRequest, FastifyReply } from 'fastify';
