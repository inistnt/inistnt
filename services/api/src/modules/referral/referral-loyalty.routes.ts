// ═══════════════════════════════════════════════════════════════════
// INISTNT — Referral + Loyalty Routes
//
// Referral:
//   GET  /api/v1/referral/my-code       — get/generate my referral code
//   POST /api/v1/referral/apply         — apply referral code at signup
//   GET  /api/v1/referral/stats         — my referral stats
//   GET  /api/v1/admin/referrals        — admin: all referrals
//
// Loyalty:
//   GET  /api/v1/loyalty/balance        — points balance + tier
//   GET  /api/v1/loyalty/history        — transaction history
//   POST /api/v1/loyalty/redeem-preview — how much discount for X points
//   GET  /api/v1/admin/loyalty/stats    — platform-wide loyalty stats
//   POST /api/v1/admin/loyalty/adjust   — manual credit/debit
// ═══════════════════════════════════════════════════════════════════

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireUser, requireWorker, requireStaff, requirePermission } from '../../plugins/auth.middleware';
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

// ─── CONSTANTS ────────────────────────────────────────────────────
const REFERRAL = {
  REFERRER_REWARD:     50,    // coins when referee completes 1st booking
  REFEREE_SIGNUP:      100,   // coins to referee on signup with code
  CODE_PREFIX_USER:    'USR',
  CODE_PREFIX_WORKER:  'WRK',
};

const LOYALTY = {
  POINTS_PER_RUPEE:    0.1,
  POINTS_TO_RUPEE:     1.0,   // 1 point = ₹1
  MAX_REDEEM_PERCENT:  20,    // Max 20% of order can be paid with points
  MIN_REDEEM:          100,
  EXPIRY_DAYS:         365,
  TIERS: [
    { name: 'Bronze',   minPoints: 0,     multiplier: 1.0, badge: '🥉' },
    { name: 'Silver',   minPoints: 500,   multiplier: 1.5, badge: '🥈' },
    { name: 'Gold',     minPoints: 2000,  multiplier: 2.0, badge: '🥇' },
    { name: 'Platinum', minPoints: 5000,  multiplier: 2.5, badge: '💎' },
  ],
};

function getTier(points: number) {
  return [...LOYALTY.TIERS].reverse().find(t => points >= t.minPoints) ?? LOYALTY.TIERS[0];
}

function generateReferralCode(type: 'user' | 'worker', id: string): string {
  const prefix = type === 'user' ? REFERRAL.CODE_PREFIX_USER : REFERRAL.CODE_PREFIX_WORKER;
  const suffix  = id.slice(-6).toUpperCase();
  const rand    = Math.random().toString(36).slice(-4).toUpperCase();
  return `${prefix}${suffix}${rand}`;
}

// ═══════════════════════════════════════════════════════════════════
// REFERRAL CONTROLLERS
// ═══════════════════════════════════════════════════════════════════

async function getMyReferralCode(req: FastifyRequest, rep: FastifyReply) {
  const userId    = (req as any).currentUser.id;
  const userType  = (req as any).currentUser.role === 'worker' ? 'worker' : 'user';

  // Check if code exists
  const existing = await db.referral.findFirst({
    where: userType === 'user'
      ? { referrerUserId: userId }
      : { referrerWorkerId: userId },
    select: {
      code: true,
      _count: { select: { id: true } },
    },
  });

  if (existing) {
    const rewardCount = await db.referral.count({
      where: {
        ...(userType === 'user' ? { referrerUserId: userId } : { referrerWorkerId: userId }),
        referrerBonusPaid: true,
      },
    });
    const totalEarned = await db.referral.aggregate({
      where: {
        ...(userType === 'user' ? { referrerUserId: userId } : { referrerWorkerId: userId }),
        referrerBonusPaid: true,
      },
      _sum: { referrerBonusAmount: true },
    });

    return rep.send({
      success: true,
      data: {
        code:         existing.code,
        shareUrl:     `https://inistnt.com/invite/${existing.code}`,
        shareText:    `Inistnt use karo aur ₹${REFERRAL.REFEREE_SIGNUP} ka discount pao! Code: ${existing.code}`,
        totalReferrals: rewardCount,
        totalEarned:    totalEarned._sum.referrerBonusAmount ?? 0,
        rewardPerReferral: REFERRAL.REFERRER_REWARD,
      },
    });
  }

  // Generate new code
  const code = generateReferralCode(userType, userId);
  return rep.send({
    success: true,
    data: {
      code,
      shareUrl:          `https://inistnt.com/invite/${code}`,
      shareText:         `Inistnt use karo aur ₹${REFERRAL.REFEREE_SIGNUP} ka discount pao! Code: ${code}`,
      totalReferrals:    0,
      totalEarned:       0,
      rewardPerReferral: REFERRAL.REFERRER_REWARD,
    },
  });
}

async function applyReferralCode(req: FastifyRequest, rep: FastifyReply) {
  const { code } = req.body as any;
  const userId   = (req as any).currentUser.id;

  if (!code) return rep.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'code required' } });

  // Check if user already used a referral
  const alreadyUsed = await db.referral.findFirst({
    where: { referredUserId: userId },
  });
  if (alreadyUsed) {
    return rep.status(409).send({ success: false, error: { code: 'ALREADY_REFERRED', message: 'Aap pehle se kisi ke referral se join kar chuke hain' } });
  }

  // Find referral by code
  const referral = await db.referral.findFirst({
    where: { code: code.toUpperCase().trim() },
    include: {
      referrerUser:   { select: { id: true, name: true } },
      referrerWorker: { select: { id: true, name: true } },
    },
  });

  if (!referral) {
    return rep.status(404).send({ success: false, error: { code: 'INVALID_CODE', message: 'Referral code invalid hai' } });
  }

  // Self-referral check
  if (referral.referrerUserId === userId) {
    return rep.status(400).send({ success: false, error: { code: 'SELF_REFERRAL', message: 'Aap apna khud ka referral code use nahi kar sakte' } });
  }

  // Credit signup bonus to referee
  await db.$transaction([
    db.referral.update({
      where: { id: referral.id },
      data:  { referredUserId: userId },
    }),
    db.user.update({
      where: { id: userId },
      data:  { loyaltyPoints: { increment: REFERRAL.REFEREE_SIGNUP } },
    }),
    db.loyaltyHistory.create({
      data: {
        userId,
        type:        'earned',
        points:      REFERRAL.REFEREE_SIGNUP,
        description: `Referral bonus — joined via ${referral.referrerUser?.name ?? referral.referrerWorker?.name ?? 'friend'}`,
        expiresAt:   new Date(Date.now() + LOYALTY.EXPIRY_DAYS * 86400_000),
      },
    }),
  ]);

  logger.info({ referralId: referral.id, userId, code }, '[Referral] Code applied, signup bonus credited');

  return rep.send({
    success: true,
    data: {
      message:      `🎉 ${REFERRAL.REFEREE_SIGNUP} loyalty coins credited! Pehli booking ke baad aur milenge.`,
      pointsEarned: REFERRAL.REFEREE_SIGNUP,
      referredBy:   referral.referrerUser?.name ?? referral.referrerWorker?.name ?? 'Ek dost',
    },
  });
}

async function getMyReferralStats(req: FastifyRequest, rep: FastifyReply) {
  const userId = (req as any).currentUser.id;

  const [referrals, pending] = await Promise.all([
    db.referral.findMany({
      where: { referrerUserId: userId },
      include: {
        referredUser: { select: { name: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.referral.count({ where: { referrerUserId: userId, referrerBonusPaid: false, referredUserId: { not: null } } }),
  ]);

  return rep.send({
    success: true,
    data: {
      totalReferrals:    referrals.length,
      confirmedReferrals: referrals.filter(r => r.referrerBonusPaid).length,
      pendingReferrals:  pending,
      totalEarned:       referrals.reduce((s, r) => s + r.referrerBonusAmount, 0),
      referrals:         referrals.map(r => ({
        name:       r.referredUser?.name ?? 'Pending',
        joinedAt:   r.referredUser?.createdAt,
        bonusPaid:  r.referrerBonusPaid,
        bonusAmount: r.referrerBonusAmount,
      })),
    },
  });
}

// Admin
async function adminGetReferrals(req: FastifyRequest, rep: FastifyReply) {
  const q    = req.query as any;
  const skip = ((parseInt(q.page ?? '1')) - 1) * 20;

  const [items, total] = await Promise.all([
    db.referral.findMany({
      include: {
        referrerUser: { select: { name: true, mobile: true } },
        referredUser: { select: { name: true, mobile: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip, take: 20,
    }),
    db.referral.count(),
  ]);

  const totalBonus = await db.referral.aggregate({
    where: { referrerBonusPaid: true },
    _sum:  { referrerBonusAmount: true },
  });

  return rep.send({
    success: true, data: items, total,
    totalBonusPaid: totalBonus._sum.referrerBonusAmount ?? 0,
    totalPages: Math.ceil(total / 20),
  });
}

// ═══════════════════════════════════════════════════════════════════
// LOYALTY CONTROLLERS
// ═══════════════════════════════════════════════════════════════════

async function getLoyaltyBalance(req: FastifyRequest, rep: FastifyReply) {
  const userId = (req as any).currentUser.id;

  const user = await db.user.findUnique({
    where:  { id: userId },
    select: { loyaltyPoints: true, name: true },
  });

  if (!user) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });

  const tier        = getTier(user.loyaltyPoints);
  const nextTier    = LOYALTY.TIERS[LOYALTY.TIERS.indexOf(tier) + 1];
  const pointsValue = Math.floor(user.loyaltyPoints * LOYALTY.POINTS_TO_RUPEE);

  // Expiring soon (next 30 days)
  const expiringSoon = await db.loyaltyHistory.aggregate({
    where: {
      userId,
      type:      'earned',
      expiresAt: { gte: new Date(), lte: new Date(Date.now() + 30 * 86400_000) },
    },
    _sum: { points: true },
  });

  return rep.send({
    success: true,
    data: {
      points:        user.loyaltyPoints,
      valueRupees:   pointsValue / 100,
      tier:          { name: tier.name, badge: tier.badge, multiplier: tier.multiplier },
      nextTier:      nextTier ? {
        name:           nextTier.name,
        badge:          nextTier.badge,
        pointsRequired: nextTier.minPoints - user.loyaltyPoints,
      } : null,
      expiringSoon:  expiringSoon._sum.points ?? 0,
      rules: {
        earnRate:        `₹1 spent = ${LOYALTY.POINTS_PER_RUPEE} points`,
        redeemRate:      '1 point = ₹1',
        maxRedeemPercent: LOYALTY.MAX_REDEEM_PERCENT,
        minRedeem:       LOYALTY.MIN_REDEEM,
        expiryDays:      LOYALTY.EXPIRY_DAYS,
      },
    },
  });
}

async function getLoyaltyHistory(req: FastifyRequest, rep: FastifyReply) {
  const userId = (req as any).currentUser.id;
  const q      = req.query as any;
  const skip   = ((parseInt(q.page ?? '1')) - 1) * 20;

  const [items, total] = await Promise.all([
    db.loyaltyHistory.findMany({
      where:   { userId, ...(q.type ? { type: q.type } : {}) },
      orderBy: { createdAt: 'desc' },
      skip, take: 20,
    }),
    db.loyaltyHistory.count({ where: { userId } }),
  ]);

  return rep.send({ success: true, data: items, total, totalPages: Math.ceil(total / 20) });
}

async function redeemPreview(req: FastifyRequest, rep: FastifyReply) {
  const userId         = (req as any).currentUser.id;
  const { pointsToUse, orderAmount } = req.body as any;

  const user = await db.user.findUnique({ where: { id: userId }, select: { loyaltyPoints: true } });
  if (!user) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });

  const available = user.loyaltyPoints;
  if (pointsToUse > available) {
    return rep.status(400).send({ success: false, error: { code: 'INSUFFICIENT_POINTS', message: `Aapke paas sirf ${available} points hain` } });
  }
  if (pointsToUse < LOYALTY.MIN_REDEEM) {
    return rep.status(400).send({ success: false, error: { code: 'MIN_REDEEM', message: `Minimum ${LOYALTY.MIN_REDEEM} points redeem kar sakte hain` } });
  }

  const maxByPercent  = Math.floor(orderAmount * (LOYALTY.MAX_REDEEM_PERCENT / 100));
  const pointsValue   = Math.floor(pointsToUse * LOYALTY.POINTS_TO_RUPEE); // paise
  const actualDiscount = Math.min(pointsValue, maxByPercent);
  const pointsActuallyUsed = actualDiscount; // 1:1 mapping

  return rep.send({
    success: true,
    data: {
      pointsRequested:  pointsToUse,
      pointsActualUsed: pointsActuallyUsed,
      discountAmount:   actualDiscount,
      finalAmount:      orderAmount - actualDiscount,
      remainingPoints:  available - pointsActuallyUsed,
      cappedBecause:    pointsValue > maxByPercent ? `Max ${LOYALTY.MAX_REDEEM_PERCENT}% of order (₹${maxByPercent/100}) se zyada use nahi ho sakta` : null,
    },
  });
}

// Admin: platform loyalty stats
async function adminLoyaltyStats(_req: FastifyRequest, rep: FastifyReply) {
  const [totalOutstanding, earnedToday, redeemedToday, topUsers] = await Promise.all([
    db.user.aggregate({ _sum: { loyaltyPoints: true } }),
    db.loyaltyHistory.aggregate({
      where: { type: 'earned', createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) } },
      _sum: { points: true },
    }),
    db.loyaltyHistory.aggregate({
      where: { type: 'redeemed', createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) } },
      _sum: { points: true },
    }),
    db.user.findMany({
      orderBy: { loyaltyPoints: 'desc' },
      take: 10,
      select: { id: true, name: true, mobile: true, loyaltyPoints: true },
    }),
  ]);

  const tierCounts = await Promise.all(LOYALTY.TIERS.map(async (tier, i) => {
    const next  = LOYALTY.TIERS[i + 1];
    const count = await db.user.count({
      where: {
        loyaltyPoints: {
          gte: tier.minPoints,
          ...(next ? { lt: next.minPoints } : {}),
        },
      },
    });
    return { tier: tier.name, badge: tier.badge, count };
  }));

  return rep.send({
    success: true,
    data: {
      totalOutstandingPoints: totalOutstanding._sum.loyaltyPoints ?? 0,
      totalOutstandingValue:  ((totalOutstanding._sum.loyaltyPoints ?? 0) * LOYALTY.POINTS_TO_RUPEE) / 100,
      earnedToday:            earnedToday._sum.points ?? 0,
      redeemedToday:          redeemedToday._sum.points ?? 0,
      tierDistribution:       tierCounts,
      topUsers,
    },
  });
}

// Admin: manual adjust
async function adminAdjustPoints(req: FastifyRequest, rep: FastifyReply) {
  const { userId, points, reason, type } = req.body as any;
  if (!userId || !points || !reason || !type) {
    return rep.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'userId, points, reason, type required' } });
  }

  const operation = type === 'credit' ? { increment: points } : { decrement: points };
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { loyaltyPoints: operation } }),
    db.loyaltyHistory.create({
      data: {
        userId,
        type:        type === 'credit' ? 'earned' : 'redeemed',
        points:      type === 'credit' ? points : -points,
        description: `Admin manual adjustment: ${reason}`,
        expiresAt:   type === 'credit' ? new Date(Date.now() + LOYALTY.EXPIRY_DAYS * 86400_000) : null,
      },
    }),
  ]);

  logger.info({ userId, points, type, reason }, '[Loyalty] Admin manual adjustment');
  return rep.send({ success: true, data: { userId, points, type, reason } });
}

// ─── ROUTE REGISTRATION ───────────────────────────────────────────

export async function referralUserRoutes(server: FastifyInstance) {
  server.get('/my-code',     { preHandler: [requireUser] }, wrap(getMyReferralCode));
  server.post('/apply',      { preHandler: [requireUser] }, wrap(applyReferralCode));
  server.get('/stats',       { preHandler: [requireUser] }, wrap(getMyReferralStats));
}

export async function loyaltyUserRoutes(server: FastifyInstance) {
  server.get('/balance',         { preHandler: [requireUser] }, wrap(getLoyaltyBalance));
  server.get('/history',         { preHandler: [requireUser] }, wrap(getLoyaltyHistory));
  server.post('/redeem-preview', { preHandler: [requireUser] }, wrap(redeemPreview));
}

export async function referralAdminRoutes(server: FastifyInstance) {
  const perm = [requireStaff, requirePermission('view:analytics' as any)];
  server.get('/', { preHandler: perm }, wrap(adminGetReferrals));
}

export async function loyaltyAdminRoutes(server: FastifyInstance) {
  const viewPerm   = [requireStaff, requirePermission('view:analytics' as any)];
  const managePerm = [requireStaff, requirePermission('manage:users' as any)];
  server.get('/stats',    { preHandler: viewPerm   }, wrap(adminLoyaltyStats));
  server.post('/adjust',  { preHandler: managePerm }, wrap(adminAdjustPoints));
}
