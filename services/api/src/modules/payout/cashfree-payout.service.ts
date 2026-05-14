// ═══════════════════════════════════════════════════════════════════
// INISTNT — Cashfree Payouts Service
//
// Cashfree Payouts API v2 (Batch Transfers)
// Docs: https://docs.cashfree.com/docs/payout-api
//
// Flow:
//   1. Worker requests payout → createPayout() called
//   2. Beneficiary created/verified on Cashfree
//   3. Transfer initiated → status: PROCESSING
//   4. Webhook received → status updated (COMPLETED / FAILED)
//   5. On failure → retry cron attempts up to MAX_RETRIES
//
// .env keys needed:
//   CASHFREE_APP_ID=your_app_id
//   CASHFREE_SECRET_KEY=your_secret_key
//   CASHFREE_ENV=TEST   (or PROD for live)
// ═══════════════════════════════════════════════════════════════════

import { db }     from '../../infrastructure/database';
import { logger } from '../../config/logger';
import { config } from '../../config';
import { sendPayoutProcessedEmail } from '../admin/campaign.service';

const CF_BASE = config.CASHFREE_ENV === 'PROD'
  ? 'https://payout-api.cashfree.com'
  : 'https://payout-gamma.cashfree.com';

const MAX_RETRIES   = 3;
const RETRY_DELAYS  = [5, 30, 120]; // minutes

// ─── AUTH TOKEN ──────────────────────────────────────────────────
let cfToken:     string | null = null;
let cfTokenExpAt: number       = 0;

async function getCfToken(): Promise<string | null> {
  if (!config.CASHFREE_APP_ID || !config.CASHFREE_SECRET_KEY) {
    logger.warn('[Cashfree] CASHFREE_APP_ID / CASHFREE_SECRET_KEY not set');
    return null;
  }

  if (cfToken && Date.now() < cfTokenExpAt - 30_000) return cfToken;

  const res = await fetch(`${CF_BASE}/payout/v1/authorize`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'X-Client-Id':    config.CASHFREE_APP_ID!,
      'X-Client-Secret': config.CASHFREE_SECRET_KEY!,
    },
  });

  if (!res.ok) {
    logger.error({ status: res.status }, '[Cashfree] Auth failed');
    return null;
  }

  const data = await res.json();
  cfToken     = data.data?.token ?? null;
  cfTokenExpAt = Date.now() + (data.data?.expiry_time ?? 300) * 1000;

  return cfToken;
}

// ─── BENEFICIARY: Create or verify ───────────────────────────────
async function ensureBeneficiary(worker: {
  id: string; name: string; mobile: string; email?: string;
  bankAccountNo?: string; bankIfsc?: string; upiId?: string;
}, payoutMethod: 'bank' | 'upi'): Promise<{ beneId: string; created: boolean }> {
  const token = await getCfToken();
  if (!token) throw new Error('Cashfree auth failed');

  const beneId = `INI_${worker.id.slice(-12)}`;

  // Check if beneficiary already exists
  const checkRes = await fetch(`${CF_BASE}/payout/v1/getBeneficiary/${beneId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (checkRes.ok) return { beneId, created: false };

  // Create beneficiary
  const body: any = {
    beneId,
    name:    worker.name,
    email:   worker.email ?? `worker_${worker.id.slice(-8)}@inistnt.com`,
    phone:   worker.mobile,
    bankAccount: payoutMethod === 'bank' ? worker.bankAccountNo : undefined,
    ifsc:        payoutMethod === 'bank' ? worker.bankIfsc      : undefined,
    vpa:         payoutMethod === 'upi'  ? worker.upiId         : undefined,
    address1:    'India',
  };

  const createRes = await fetch(`${CF_BASE}/payout/v1/addBeneficiary`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify(body),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Beneficiary creation failed: ${err.slice(0, 200)}`);
  }

  return { beneId, created: true };
}

// ─── INITIATE TRANSFER ───────────────────────────────────────────
async function initiateTransfer(params: {
  payoutId:     string;
  beneId:       string;
  amount:       number;     // in paise
  remarks:      string;
  payoutMethod: 'bank' | 'upi';
}): Promise<{ transferId: string; status: string; utrNumber?: string }> {
  const token = await getCfToken();
  if (!token) throw new Error('Cashfree auth failed');

  const amountRupees = params.amount / 100;
  const transferId   = `TXN_${params.payoutId.slice(-16)}`;

  const res = await fetch(`${CF_BASE}/payout/v1/requestTransfer`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      beneId:       params.beneId,
      amount:       amountRupees.toFixed(2),
      transferId,
      transferMode: params.payoutMethod === 'upi' ? 'UPI' : 'NEFT',
      remarks:      params.remarks,
    }),
  });

  const data = await res.json();

  if (!res.ok || data.status === 'ERROR') {
    throw new Error(data.message ?? `Transfer failed: ${res.status}`);
  }

  const txnStatus = data.data?.transferStatus ?? 'PROCESSING';
  const utrNumber = data.data?.utr ?? undefined;

  return { transferId, status: txnStatus, utrNumber };
}

// ─── MAIN: Create and initiate payout ────────────────────────────
export async function createAndInitiatePayout(payoutId: string): Promise<void> {
  const payout = await db.workerPayout.findUnique({
    where:   { id: payoutId },
    include: {
      worker: {
        select: {
          id: true, name: true, mobile: true, email: true,
          bankAccountNo: true, bankIfsc: true, upiId: true,
          walletBalance: true, pendingPayout: true,
        },
      },
    },
  });

  if (!payout) throw new Error(`Payout ${payoutId} not found`);
  if (payout.status === 'COMPLETED') return; // Already done

  const worker = payout.worker;
  const payoutMethod = (payout.payoutMethod as 'bank' | 'upi') ?? 'upi';

  // Validate worker has required payout details
  if (payoutMethod === 'bank' && (!worker.bankAccountNo || !worker.bankIfsc)) {
    await db.workerPayout.update({
      where: { id: payoutId },
      data:  { status: 'FAILED', failureReason: 'Bank account details missing' },
    });
    return;
  }
  if (payoutMethod === 'upi' && !worker.upiId) {
    await db.workerPayout.update({
      where: { id: payoutId },
      data:  { status: 'FAILED', failureReason: 'UPI ID missing' },
    });
    return;
  }

  try {
    // Step 1: Ensure beneficiary exists
    const { beneId } = await ensureBeneficiary(worker, payoutMethod);

    // Step 2: Initiate transfer
    const { transferId, status, utrNumber } = await initiateTransfer({
      payoutId,
      beneId,
      amount:       payout.amount,
      remarks:      `Inistnt Earnings — ${worker.name}`,
      payoutMethod,
    });

    const isCompleted = status === 'SUCCESS';
    const isFailed    = status === 'FAILED' || status === 'REVERSED';

    await db.$transaction([
      db.workerPayout.update({
        where: { id: payoutId },
        data:  {
          status:             isCompleted ? 'COMPLETED' : isFailed ? 'FAILED' : 'PROCESSING',
          cashfreeTransferId: transferId,
          cashfreeBeneId:     beneId,
          utrNumber:          utrNumber ?? null,
          processedAt:        isCompleted ? new Date() : null,
        },
      }),
      // Deduct from pendingPayout if completed
      ...(isCompleted ? [
        db.worker.update({
          where: { id: worker.id },
          data:  { pendingPayout: { decrement: payout.amount } },
        }),
        db.transaction.create({
          data: {
            type:          'PAYOUT',
            amount:        -payout.amount,
            workerId:      worker.id,
            payoutId,
            balanceBefore: worker.walletBalance,
            balanceAfter:  worker.walletBalance - payout.amount,
            description:   `Payout processed — ${payoutMethod.toUpperCase()} | UTR: ${utrNumber ?? 'N/A'}`,
            metadata:      { transferId, beneId, method: payoutMethod },
          },
        }),
      ] : []),
    ]);

    // Send email if completed
    if (isCompleted && worker.email) {
      await sendPayoutProcessedEmail({
        to:         worker.email,
        workerName: worker.name,
        amount:     (payout.amount / 100).toFixed(2),
        utrNumber:  utrNumber ?? transferId,
        method:     payoutMethod,
      }).catch(() => {}); // Don't fail payout if email fails
    }

    logger.info({ payoutId, transferId, status, utrNumber }, '[Cashfree] Transfer initiated');

  } catch (err: any) {
    const retryCount = payout.retryCount + 1;
    const willRetry  = retryCount <= MAX_RETRIES;
    const nextRetryMins = RETRY_DELAYS[retryCount - 1] ?? 0;

    await db.workerPayout.update({
      where: { id: payoutId },
      data:  {
        status:        willRetry ? 'PENDING' : 'FAILED',
        failureReason: err.message?.slice(0, 200),
        retryCount,
        nextRetryAt:   willRetry
          ? new Date(Date.now() + nextRetryMins * 60_000)
          : null,
      },
    });

    logger.error({ payoutId, err: err.message, retryCount, willRetry }, '[Cashfree] Transfer failed');
    if (!willRetry) throw err;
  }
}

// ─── WEBHOOK HANDLER ─────────────────────────────────────────────
export async function handleCashfreeWebhook(body: any): Promise<void> {
  const { event, transferId, utr, status } = body;
  if (!transferId) return;

  const payout = await db.workerPayout.findFirst({
    where: { cashfreeTransferId: transferId },
  });
  if (!payout) {
    logger.warn({ transferId }, '[Cashfree] Webhook: payout not found');
    return;
  }

  const isCompleted = status === 'SUCCESS'  || event?.includes('SUCCESS');
  const isFailed    = status === 'FAILED'   || event?.includes('FAILED') || event?.includes('REVERSED');

  if (!isCompleted && !isFailed) return; // Still processing

  const worker = await db.worker.findUnique({
    where:  { id: payout.workerId },
    select: { walletBalance: true, email: true, name: true },
  });

  await db.$transaction([
    db.workerPayout.update({
      where: { id: payout.id },
      data:  {
        status:         isCompleted ? 'COMPLETED' : 'FAILED',
        utrNumber:      utr ?? payout.utrNumber,
        processedAt:    isCompleted ? new Date() : null,
        failureReason:  isFailed ? (body.reason ?? 'Transfer failed') : null,
      },
    }),
    ...(isCompleted && worker ? [
      db.worker.update({
        where: { id: payout.workerId },
        data:  { pendingPayout: { decrement: payout.amount } },
      }),
      db.transaction.create({
        data: {
          type:          'PAYOUT',
          amount:        -payout.amount,
          workerId:      payout.workerId,
          payoutId:      payout.id,
          balanceBefore: worker.walletBalance,
          balanceAfter:  worker.walletBalance - payout.amount,
          description:   `Payout confirmed via webhook — UTR: ${utr ?? 'N/A'}`,
          metadata:      { transferId, event },
        },
      }),
    ] : []),
  ]);

  if (isCompleted && worker?.email) {
    await sendPayoutProcessedEmail({
      to:         worker.email,
      workerName: worker.name,
      amount:     (payout.amount / 100).toFixed(2),
      utrNumber:  utr ?? transferId,
      method:     payout.payoutMethod,
    }).catch(() => {});
  }

  logger.info({ payoutId: payout.id, transferId, isCompleted, isFailed }, '[Cashfree] Webhook processed');
}

// ─── RETRY CRON: Run every 30 mins ───────────────────────────────
export async function retryFailedPayouts(): Promise<void> {
  const now = new Date();

  const toRetry = await db.workerPayout.findMany({
    where: {
      status:       'PENDING',
      retryCount:   { gt: 0, lte: MAX_RETRIES },
      nextRetryAt:  { lte: now },
    },
    take: 20, // Batch size
  });

  if (!toRetry.length) return;
  logger.info({ count: toRetry.length }, '[Cashfree] Retrying failed payouts');

  for (const payout of toRetry) {
    try {
      await createAndInitiatePayout(payout.id);
    } catch (err: any) {
      logger.error({ payoutId: payout.id, err: err.message }, '[Cashfree] Retry failed');
    }
  }
}
