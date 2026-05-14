// ═══════════════════════════════════════════════════════════════════
// INISTNT — Coupon Engine
//
// Worker Routes:  /api/v1/coupons/validate
// User Routes:    /api/v1/coupons/my
// Admin Routes:   /api/v1/admin/coupons
//
// Coupon Types:
//   percentage  — 20% off, max ₹200 cap
//   flat        — ₹150 flat discount
//   free_delivery — ₹0 delivery/platform fee
//   bogo        — buy one get one (second booking free up to ₹X)
//
// Restrictions:
//   - Min order amount
//   - Target user type (new_users / returning / all / specific IDs)
//   - Per-user usage limit
//   - Total usage cap
//   - Valid date range
//   - Service category restrictions
//   - City restrictions
//   - First booking only flag
// ═══════════════════════════════════════════════════════════════════

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireUser, requireStaff, requirePermission } from '../../plugins/auth.middleware';
import { db }     from '../../infrastructure/database';
import { logger } from '../../config/logger';

function wrap(fn: Function) {
  return async (req: any, rep: any) => {
    try { return await fn(req, rep); }
    catch (err: any) {
      if (err.statusCode) return rep.status(err.statusCode).send({ success: false, error: { code: err.code ?? 'ERROR', message: err.message } });
      req.log?.error(err);
      return rep.status(500).send({ success: false, error: { code: 'SERVER_ERROR', message: err.message ?? 'Kuch gadbad ho gayi.' } });
    }
  };
}

// ─── CORE VALIDATION LOGIC ────────────────────────────────────────
export interface CouponValidation {
  valid:          boolean;
  couponId?:      string;
  code?:          string;
  discountAmount: number;  // paise
  finalAmount:    number;  // paise after discount
  message:        string;
  error?:         string;
}

export async function validateCoupon(params: {
  code:        string;
  userId:      string;
  orderAmount: number;   // paise
  cityId?:     string;
  serviceIds?: string[];
  isFirstBooking?: boolean;
}): Promise<CouponValidation> {
  const { code, userId, orderAmount, cityId, serviceIds = [], isFirstBooking = false } = params;

  const coupon = await db.coupon.findUnique({ where: { code: code.toUpperCase().trim() } });

  // ── Existence + active check ───────────────────────────────────
  if (!coupon) return { valid: false, discountAmount: 0, finalAmount: orderAmount, message: 'Invalid coupon', error: 'COUPON_NOT_FOUND' };
  if (!coupon.isActive) return { valid: false, discountAmount: 0, finalAmount: orderAmount, message: 'Yeh coupon ab valid nahi hai', error: 'COUPON_INACTIVE' };

  // ── Date validity ─────────────────────────────────────────────
  const now = new Date();
  if (now < coupon.validFrom) return { valid: false, discountAmount: 0, finalAmount: orderAmount, message: `Yeh coupon ${coupon.validFrom.toLocaleDateString('hi-IN')} se valid hoga`, error: 'COUPON_NOT_STARTED' };
  if (now > coupon.validTo)   return { valid: false, discountAmount: 0, finalAmount: orderAmount, message: 'Yeh coupon expire ho gaya hai', error: 'COUPON_EXPIRED' };

  // ── Min order check ───────────────────────────────────────────
  if (orderAmount < coupon.minOrderAmount) {
    return {
      valid: false, discountAmount: 0, finalAmount: orderAmount,
      message: `Minimum order ₹${coupon.minOrderAmount / 100} chahiye. Aapka order ₹${orderAmount / 100} hai.`,
      error: 'MIN_ORDER_NOT_MET',
    };
  }

  // ── Total usage cap ───────────────────────────────────────────
  if (coupon.maxUsageTotal && coupon.usedCount >= coupon.maxUsageTotal) {
    return { valid: false, discountAmount: 0, finalAmount: orderAmount, message: 'Yeh coupon already use limit reach kar chuka hai', error: 'USAGE_LIMIT_REACHED' };
  }

  // ── City restriction ──────────────────────────────────────────
  if (coupon.targetCityIds.length > 0 && cityId && !coupon.targetCityIds.includes(cityId)) {
    return { valid: false, discountAmount: 0, finalAmount: orderAmount, message: 'Yeh coupon aapke city mein available nahi hai', error: 'CITY_RESTRICTED' };
  }

  // ── User type check ───────────────────────────────────────────
  if (coupon.targetUserType === 'new_users' && !isFirstBooking) {
    return { valid: false, discountAmount: 0, finalAmount: orderAmount, message: 'Yeh coupon sirf naye users ke liye hai', error: 'NEW_USERS_ONLY' };
  }

  // ── Per-user usage check ──────────────────────────────────────
  const userUsageCount = await db.couponUsage.count({
    where: { couponId: coupon.id, userId },
  });
  if (userUsageCount >= coupon.maxUsagePerUser) {
    return {
      valid: false, discountAmount: 0, finalAmount: orderAmount,
      message: `Aap yeh coupon maximum ${coupon.maxUsagePerUser} baar use kar sakte hain`,
      error: 'USER_USAGE_LIMIT',
    };
  }

  // ── Calculate discount ────────────────────────────────────────
  let discountAmount = 0;

  if (coupon.discountType === 'percentage') {
    discountAmount = Math.floor(orderAmount * (coupon.discountValue / 100));
    if (coupon.maxDiscount) discountAmount = Math.min(discountAmount, coupon.maxDiscount);
  } else if (coupon.discountType === 'flat') {
    discountAmount = Math.min(coupon.discountValue, orderAmount);
  } else if (coupon.discountType === 'free_delivery') {
    // Platform fee waived — amount comes from booking context
    discountAmount = coupon.discountValue; // stored as exact platform fee to waive
  }

  discountAmount = Math.max(0, Math.min(discountAmount, orderAmount));
  const finalAmount = orderAmount - discountAmount;

  return {
    valid:          true,
    couponId:       coupon.id,
    code:           coupon.code,
    discountAmount,
    finalAmount,
    message:        `₹${discountAmount / 100} discount apply hua! 🎉`,
  };
}

// ─── RECORD USAGE (call after booking created) ───────────────────
export async function recordCouponUsage(couponId: string, userId: string, bookingId: string, discountAmount: number) {
  await db.$transaction([
    db.couponUsage.create({ data: { couponId, userId, bookingId, discountAmount } }),
    db.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } }),
  ]);
}

// ─── CONTROLLERS ─────────────────────────────────────────────────

// User: validate a coupon before applying
async function validateCouponEndpoint(req: FastifyRequest, rep: FastifyReply) {
  const { code, orderAmount, cityId, serviceIds } = req.body as any;
  const userId = (req as any).currentUser.id;

  if (!code || !orderAmount) {
    return rep.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'code, orderAmount required' } });
  }

  // Check if first booking
  const bookingCount = await db.booking.count({ where: { userId, status: 'COMPLETED' } });

  const result = await validateCoupon({
    code, userId, orderAmount, cityId, serviceIds,
    isFirstBooking: bookingCount === 0,
  });

  return rep.send({ success: true, data: result });
}

// User: available coupons for current user
async function getAvailableCoupons(req: FastifyRequest, rep: FastifyReply) {
  const userId = (req as any).currentUser.id;
  const q      = req.query as any;
  const now    = new Date();

  const coupons = await db.coupon.findMany({
    where: {
      isActive:  true,
      validFrom: { lte: now },
      validTo:   { gte: now },
      OR: [
        { targetUserType: 'all' },
        { targetUserType: null },
        { targetUserType: 'new_users' },
      ],
      ...(q.cityId ? {
        OR: [
          { targetCityIds: { isEmpty: true } },
          { targetCityIds: { has: q.cityId } },
        ],
      } : {}),
    },
    select: {
      id: true, code: true, title: true, descriptionEn: true, descriptionHi: true,
      discountType: true, discountValue: true, maxDiscount: true,
      minOrderAmount: true, validTo: true, maxUsagePerUser: true,
    },
    orderBy: { discountValue: 'desc' },
    take: 20,
  });

  // Filter out already max-used by this user
  const usedCoupons = await db.couponUsage.groupBy({
    by:    ['couponId'],
    where: { userId, couponId: { in: coupons.map(c => c.id) } },
    _count: { id: true },
  });
  const usedMap = Object.fromEntries(usedCoupons.map(u => [u.couponId, u._count.id]));

  const available = coupons.filter(c => (usedMap[c.id] ?? 0) < c.maxUsagePerUser);

  return rep.send({ success: true, data: available });
}

// ─── ADMIN CONTROLLERS ────────────────────────────────────────────

async function adminListCoupons(req: FastifyRequest, rep: FastifyReply) {
  const q    = req.query as any;
  const skip = ((parseInt(q.page ?? '1')) - 1) * 20;
  const now  = new Date();
  const where: any = {};
  if (q.isActive !== undefined) where.isActive = q.isActive === 'true';
  if (q.search) where.code = { contains: q.search.toUpperCase() };
  if (q.status === 'expired')   where.validTo   = { lt: now };
  if (q.status === 'active')    where.validTo   = { gte: now };
  if (q.status === 'scheduled') where.validFrom = { gt: now };

  const [items, total] = await Promise.all([
    db.coupon.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip, take: 20,
    }),
    db.coupon.count({ where }),
  ]);
  return rep.send({ success: true, data: items, total, totalPages: Math.ceil(total / 20) });
}

async function adminCreateCoupon(req: FastifyRequest, rep: FastifyReply) {
  const body = req.body as any;
  if (!body.code || !body.discountType || !body.discountValue || !body.validFrom || !body.validTo) {
    return rep.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'code, discountType, discountValue, validFrom, validTo required' } });
  }

  const data = await db.coupon.create({
    data: {
      ...body,
      code:      body.code.toUpperCase().trim(),
      validFrom: new Date(body.validFrom),
      validTo:   new Date(body.validTo),
    },
  });
  logger.info({ couponId: data.id, code: data.code }, '[Coupon] Created');
  return rep.status(201).send({ success: true, data });
}

async function adminUpdateCoupon(req: FastifyRequest, rep: FastifyReply) {
  const { couponId } = req.params as any;
  const body = req.body as any;
  if (body.validFrom) body.validFrom = new Date(body.validFrom);
  if (body.validTo)   body.validTo   = new Date(body.validTo);
  const data = await db.coupon.update({ where: { id: couponId }, data: body });
  return rep.send({ success: true, data });
}

async function adminToggleCoupon(req: FastifyRequest, rep: FastifyReply) {
  const { couponId } = req.params as any;
  const { isActive }  = req.body as any;
  const data = await db.coupon.update({ where: { id: couponId }, data: { isActive } });
  return rep.send({ success: true, data });
}

async function adminGetCouponStats(req: FastifyRequest, rep: FastifyReply) {
  const { couponId } = req.params as any;
  const [coupon, usageCount, totalDiscount, recentUsage] = await Promise.all([
    db.coupon.findUnique({ where: { id: couponId } }),
    db.couponUsage.count({ where: { couponId } }),
    db.couponUsage.aggregate({ where: { couponId }, _sum: { discountAmount: true } }),
    db.couponUsage.findMany({
      where:   { couponId },
      include: { user: { select: { name: true, mobile: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  return rep.send({
    success: true,
    data: {
      coupon,
      usageCount,
      totalDiscountGiven: totalDiscount._sum.discountAmount ?? 0,
      recentUsage,
    },
  });
}

// ─── ROUTE REGISTRATION ───────────────────────────────────────────

export async function couponUserRoutes(server: FastifyInstance) {
  server.post('/validate',  { preHandler: [requireUser] }, wrap(validateCouponEndpoint));
  server.get('/available',  { preHandler: [requireUser] }, wrap(getAvailableCoupons));
}

export async function couponAdminRoutes(server: FastifyInstance) {
  const perm = (p: string) => [requireStaff, requirePermission(p as any)];
  server.get('/',                             { preHandler: perm('view:analytics')  }, wrap(adminListCoupons));
  server.post('/',                            { preHandler: perm('manage:campaigns') }, wrap(adminCreateCoupon));
  server.patch('/:couponId',                  { preHandler: perm('manage:campaigns') }, wrap(adminUpdateCoupon));
  server.patch('/:couponId/toggle',           { preHandler: perm('manage:campaigns') }, wrap(adminToggleCoupon));
  server.get('/:couponId/stats',              { preHandler: perm('view:analytics')  }, wrap(adminGetCouponStats));
}
