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
