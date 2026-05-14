// ═══════════════════════════════════════════════════════════════════
// INISTNT — Payout Withdrawal Limit Service
// Called by: payout request handler before creating payout
//
// Rules (monthly free withdrawals):
//   FREE     : 10 free/month, ₹25 charge after
//   SILVER   : 20 free/month, ₹15 charge after
//   GOLD     : Unlimited free
//   PLATINUM : Unlimited free
//
// Schema ADDITION REQUIRED on Worker:
//   monthlyPayoutCount  Int       @default(0)
//   payoutCountResetAt  DateTime?
//
// Usage in existing payout handler:
//   const check = await checkPayoutLimit(workerId);
//   if (!check.allowed) throw new Error(check.reason);
//   // ... create payout ...
//   await incrementPayoutCount(workerId);
// ═══════════════════════════════════════════════════════════════════

import { db }     from '../../infrastructure/database';
import { logger } from '../../config/logger';

// Free withdrawal limits per plan
const FREE_WITHDRAWALS: Record<string, number> = {
  FREE:     10,
  SILVER:   20,
  GOLD:     Infinity,
  PLATINUM: Infinity,
};

// Charge per extra withdrawal in paise
const EXTRA_WITHDRAWAL_FEE: Record<string, number> = {
  FREE:   2500,   // ₹25
  SILVER: 1500,   // ₹15
  GOLD:   0,
  PLATINUM: 0,
};

export interface PayoutLimitCheck {
  allowed:          boolean;
  reason?:          string;
  usedThisMonth:    number;
  freeLimit:        number;
  isOverLimit:      boolean;
  extraFeeApplied:  number;   // Paise deducted from payout if over limit
  plan:             string;
}

export async function checkPayoutLimit(workerId: string): Promise<PayoutLimitCheck> {
  const worker = await db.worker.findUnique({
    where:   { id: workerId },
    include: { subscription: true },
    // monthlyPayoutCount and payoutCountResetAt from schema addition
  });

  if (!worker) throw new Error('Worker not found');

  const plan            = worker.subscription?.status === 'ACTIVE'
    ? (worker.subscription.plan as string)
    : 'FREE';

  const freeLimit       = FREE_WITHDRAWALS[plan] ?? 10;
  const extraFee        = EXTRA_WITHDRAWAL_FEE[plan] ?? 2500;

  // ── Reset counter if new month ────────────────────────────────────────────
  const now             = new Date();
  const resetAt         = (worker as any).payoutCountResetAt as Date | null;
  const usedThisMonth   = (worker as any).monthlyPayoutCount as number ?? 0;

  const isNewMonth      = !resetAt
    || resetAt.getMonth() !== now.getMonth()
    || resetAt.getFullYear() !== now.getFullYear();

  if (isNewMonth) {
    await db.worker.update({
      where: { id: workerId },
      data:  {
        monthlyPayoutCount: 0,
        payoutCountResetAt: new Date(now.getFullYear(), now.getMonth(), 1),
      } as any,
    });
    return {
      allowed:         true,
      usedThisMonth:   0,
      freeLimit,
      isOverLimit:     false,
      extraFeeApplied: 0,
      plan,
    };
  }

  const isOverLimit = usedThisMonth >= freeLimit;

  if (!isOverLimit) {
    return {
      allowed:         true,
      usedThisMonth,
      freeLimit,
      isOverLimit:     false,
      extraFeeApplied: 0,
      plan,
    };
  }

  // Over the free limit
  if (freeLimit === Infinity) {
    // GOLD/PLATINUM — always free
    return {
      allowed:         true,
      usedThisMonth,
      freeLimit,
      isOverLimit:     true,
      extraFeeApplied: 0,
      plan,
    };
  }

  // FREE/SILVER — charge extra fee (deducted from payout amount)
  logger.info({ workerId, plan, usedThisMonth, freeLimit, extraFee },
    '[PayoutLimit] Over free limit — fee will apply');

  return {
    allowed:         true,   // Still allowed, just fee applies
    reason:          `${freeLimit} free withdrawals use ho gaye. ₹${extraFee / 100} extra fee lagega.`,
    usedThisMonth,
    freeLimit,
    isOverLimit:     true,
    extraFeeApplied: extraFee,
    plan,
  };
}

// ─── Increment counter after successful payout ───────────────────────────────
export async function incrementPayoutCount(workerId: string): Promise<void> {
  await db.worker.update({
    where: { id: workerId },
    data:  { monthlyPayoutCount: { increment: 1 } } as any,
  });
}

// ─── Integration snippet for existing payout.controller.ts ───────────────────
//
// import { checkPayoutLimit, incrementPayoutCount } from './payout-limit.service';
//
// async function requestPayout(workerId, amount) {
//   const check = await checkPayoutLimit(workerId);
//
//   let finalAmount = amount;
//
//   if (check.isOverLimit && check.extraFeeApplied > 0) {
//     if (amount <= check.extraFeeApplied) {
//       throw new Error('Amount withdrawal fee se kam hai');
//     }
//     finalAmount = amount - check.extraFeeApplied;
//     // Optionally create a ADJUSTMENT transaction for the fee
//   }
//
//   // ... create WorkerPayout with finalAmount ...
//
//   await incrementPayoutCount(workerId);
//
//   return { payout, extraFeeApplied: check.extraFeeApplied };
// }
