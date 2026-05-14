// ═══════════════════════════════════════════════════════════════════
// INISTNT — Review System with AI
//
// User Routes:
//   POST /api/v1/bookings/:bookingId/review  — submit review
//   GET  /api/v1/workers/:workerId/reviews   — worker's public reviews
//   POST /api/v1/reviews/:reviewId/helpful   — mark review helpful
//
// Worker Routes:
//   POST /api/v1/reviews/:reviewId/respond   — worker replies to review
//
// Admin Routes:
//   GET  /api/v1/admin/reviews               — all reviews with filters
//   POST /api/v1/admin/reviews/:id/moderate  — approve/hide/flag
//   GET  /api/v1/admin/reviews/stats         — platform review stats
//
// AI Analysis (Groq):
//   - sentimentScore (-1 to 1)
//   - sentimentLabel: positive/negative/neutral/mixed
//   - aiTags: ['professional', 'on_time', 'overcharged', ...]
//   - isSuspicious: fake review detection
// ═══════════════════════════════════════════════════════════════════

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireUser, requireWorker, requireStaff, requirePermission } from '../../plugins/auth.middleware';
import { db }     from '../../infrastructure/database';
import { logger } from '../../config/logger';
import { detectReviewFraud, categorizeDispute } from '../../infrastructure/ai.service';

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

// ─── AI ANALYSIS (runs async after review created) ─────────────────
async function analyzeReviewWithAI(reviewId: string, text: string, rating: number, workerName: string) {
  try {
    // Run fraud detection and sentiment in parallel
    const [fraud, sentiment] = await Promise.all([
      detectReviewFraud({ text, rating, workerName }),
      analyzeReviewSentiment(text, rating),
    ]);

    await db.review.update({
      where: { id: reviewId },
      data: {
        sentimentScore:  sentiment.score,
        sentimentLabel:  sentiment.label,
        aiTags:          sentiment.tags,
        aiSummary:       sentiment.summary,
        isSuspicious:    fraud.isSuspicious && fraud.confidence > 0.7,
        suspicionReason: fraud.isSuspicious ? fraud.reason : null,
      },
    });

    // Auto-flag highly suspicious reviews for moderation
    if (fraud.isSuspicious && fraud.confidence > 0.85) {
      await db.review.update({
        where: { id: reviewId },
        data:  { isFlagged: true, flagReason: `AI: ${fraud.reason}` },
      });
      logger.warn({ reviewId, reason: fraud.reason }, '[Review] Auto-flagged as suspicious');
    }
  } catch (err: any) {
    logger.warn({ err: err.message, reviewId }, '[Review] AI analysis failed — skipping');
  }
}

// Sentiment analysis using Groq
async function analyzeReviewSentiment(text: string, rating: number): Promise<{
  score: number; label: string; tags: string[]; summary: string;
}> {
  if (!process.env.GROQ_API_KEY) {
    // Fallback: derive from rating
    const score = (rating - 3) / 2;
    return {
      score,
      label:   score > 0.3 ? 'positive' : score < -0.3 ? 'negative' : 'neutral',
      tags:    [],
      summary: text.slice(0, 80),
    };
  }

  const Groq = (await import('groq-sdk')).default;
  const groq  = new Groq({ apiKey: process.env.GROQ_API_KEY });

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: `Analyze this home service review (rating: ${rating}/5) for sentiment and tags. Respond ONLY with valid JSON.

Review: "${text.slice(0, 400)}"

JSON format:
{"score":<-1.0 to 1.0>,"label":"positive"|"negative"|"neutral"|"mixed","tags":["professional","on_time","quality_work","overcharged","rude","damage","punctual","friendly","slow","thorough"],"summary":"one-line English summary max 80 chars"}

Tags must ONLY come from the list provided. Pick max 3 that apply.`,
      }],
      temperature:     0.1,
      max_tokens:      200,
      response_format: { type: 'json_object' },
    });

    const raw    = completion.choices[0]?.message?.content ?? '{}';
    const clean  = raw.replace(/```json|```/g, '').trim();
    const match  = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON');
    const parsed = JSON.parse(match[0]);

    return {
      score:   Math.max(-1, Math.min(1, parseFloat(parsed.score) || 0)),
      label:   ['positive', 'negative', 'neutral', 'mixed'].includes(parsed.label) ? parsed.label : 'neutral',
      tags:    Array.isArray(parsed.tags) ? parsed.tags.slice(0, 3) : [],
      summary: (parsed.summary ?? text.slice(0, 80)).slice(0, 80),
    };
  } catch {
    const score = (rating - 3) / 2;
    return { score, label: score > 0.3 ? 'positive' : score < -0.3 ? 'negative' : 'neutral', tags: [], summary: text.slice(0, 80) };
  }
}

// ─── UPDATE WORKER RATING ──────────────────────────────────────────
async function recalcWorkerRating(workerId: string) {
  const agg = await db.review.aggregate({
    where: { workerId, isVisible: true, targetType: 'USER_TO_WORKER' },
    _avg:  { rating: true },
    _count: { id: true },
  });

  if (agg._count.id > 0) {
    await db.worker.update({
      where: { id: workerId },
      data:  {
        rating:       parseFloat((agg._avg.rating ?? 0).toFixed(2)),
        totalReviews: agg._count.id,
      } as any,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════
// USER CONTROLLERS
// ═══════════════════════════════════════════════════════════════════

async function submitReview(req: FastifyRequest, rep: FastifyReply) {
  const { bookingId } = req.params as any;
  const { rating, comment, tags = [] } = req.body as any;
  const userId = (req as any).currentUser.id;

  if (!rating || rating < 1 || rating > 5) {
    return rep.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'rating 1-5 required' } });
  }

  const booking = await db.booking.findUnique({
    where:   { id: bookingId },
    include: { worker: { select: { name: true } } },
  });

  if (!booking) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Booking nahi mili' } });
  if (booking.userId !== userId) return rep.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Sirf aap apni booking review kar sakte hain' } });
  if (booking.status !== 'COMPLETED') return rep.status(400).send({ success: false, error: { code: 'NOT_COMPLETED', message: 'Sirf completed bookings review ho sakti hain' } });

  // Check duplicate
  const existing = await db.review.findUnique({ where: { bookingId } });
  if (existing) return rep.status(409).send({ success: false, error: { code: 'ALREADY_REVIEWED', message: 'Aap yeh booking pehle review kar chuke hain' } });

  const review = await db.review.create({
    data: {
      bookingId,
      workerId:   booking.workerId ?? undefined,
      reviewerId: userId,
      targetType: 'USER_TO_WORKER',
      rating,
      comment:    comment?.trim(),
      tags,
    },
  });

  // Update worker rating
  if (booking.workerId) await recalcWorkerRating(booking.workerId);

  // AI analysis — run async, don't block response
  if (comment && booking.workerId) {
    analyzeReviewWithAI(review.id, comment, rating, booking.worker?.name ?? '').catch(() => {});
  }

  logger.info({ reviewId: review.id, bookingId, rating }, '[Review] Submitted');
  return rep.status(201).send({ success: true, data: review });
}

async function getWorkerReviews(req: FastifyRequest, rep: FastifyReply) {
  const { workerId } = req.params as any;
  const q = req.query as any;
  const page  = parseInt(q.page  ?? '1');
  const limit = Math.min(parseInt(q.limit ?? '10'), 50);
  const skip  = (page - 1) * limit;

  const where: any = { workerId, isVisible: true, targetType: 'USER_TO_WORKER' };
  if (q.rating) where.rating = parseInt(q.rating);
  if (q.tag)    where.tags   = { has: q.tag };

  const [reviews, total, stats] = await Promise.all([
    db.review.findMany({
      where,
      include: {
        reviewer: { select: { name: true } },
      },
      orderBy: q.sort === 'helpful' ? { helpfulCount: 'desc' } : { createdAt: 'desc' },
      skip, take: limit,
    }),
    db.review.count({ where }),
    db.review.aggregate({
      where: { workerId, isVisible: true },
      _avg:  { rating: true, sentimentScore: true },
      _count: { id: true },
    }),
  ]);

  // Rating distribution
  const ratingDist = await db.review.groupBy({
    by:    ['rating'],
    where: { workerId, isVisible: true },
    _count: { id: true },
  });

  return rep.send({
    success: true,
    data:    reviews,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    stats: {
      avgRating:      parseFloat((stats._avg.rating ?? 0).toFixed(2)),
      avgSentiment:   stats._avg.sentimentScore ?? 0,
      totalReviews:   stats._count.id,
      distribution:   Object.fromEntries(ratingDist.map(r => [r.rating, r._count.id])),
    },
  });
}

async function markHelpful(req: FastifyRequest, rep: FastifyReply) {
  const { reviewId } = req.params as any;
  const data = await db.review.update({
    where: { id: reviewId },
    data:  { helpfulCount: { increment: 1 } },
    select: { helpfulCount: true },
  });
  return rep.send({ success: true, data });
}

// ═══════════════════════════════════════════════════════════════════
// WORKER CONTROLLERS
// ═══════════════════════════════════════════════════════════════════

async function respondToReview(req: FastifyRequest, rep: FastifyReply) {
  const { reviewId }  = req.params as any;
  const { response }  = req.body as any;
  const workerId       = (req as any).currentUser.id;

  if (!response?.trim()) {
    return rep.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'response required' } });
  }

  const review = await db.review.findUnique({ where: { id: reviewId }, select: { workerId: true } });
  if (!review)               return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Review nahi mili' } });
  if (review.workerId !== workerId) return rep.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Sirf apni review pe respond kar sakte hain' } });

  const updated = await db.review.update({
    where: { id: reviewId },
    data:  { ownerResponse: response.trim().slice(0, 500), respondedAt: new Date() },
  });

  return rep.send({ success: true, data: updated });
}

// ═══════════════════════════════════════════════════════════════════
// ADMIN CONTROLLERS
// ═══════════════════════════════════════════════════════════════════

async function adminListReviews(req: FastifyRequest, rep: FastifyReply) {
  const q    = req.query as any;
  const page = parseInt(q.page ?? '1');
  const limit = Math.min(parseInt(q.limit ?? '20'), 50);
  const skip  = (page - 1) * limit;

  const where: any = {};
  if (q.isFlagged    !== undefined) where.isFlagged    = q.isFlagged === 'true';
  if (q.isSuspicious !== undefined) where.isSuspicious = q.isSuspicious === 'true';
  if (q.isVisible    !== undefined) where.isVisible    = q.isVisible === 'true';
  if (q.rating)   where.rating   = parseInt(q.rating);
  if (q.workerId) where.workerId = q.workerId;
  if (q.minRating) where.rating  = { ...(where.rating ?? {}), gte: parseInt(q.minRating) };
  if (q.maxRating) where.rating  = { ...(where.rating ?? {}), lte: parseInt(q.maxRating) };
  if (q.sentiment) where.sentimentLabel = q.sentiment;

  const [reviews, total] = await Promise.all([
    db.review.findMany({
      where,
      include: {
        reviewer: { select: { name: true, mobile: true } },
        worker:   { select: { name: true, mobile: true } },
        booking:  { select: { bookingNumber: true } },
      },
      orderBy: q.sort === 'flagged' ? [{ isFlagged: 'desc' }, { createdAt: 'desc' }] : { createdAt: 'desc' },
      skip, take: limit,
    }),
    db.review.count({ where }),
  ]);

  return rep.send({ success: true, data: reviews, total, page, totalPages: Math.ceil(total / limit) });
}

async function adminModerateReview(req: FastifyRequest, rep: FastifyReply) {
  const { reviewId }   = req.params as any;
  const { action, reason } = req.body as any;
  const staffId        = (req as any).currentUser.id;

  // action: 'approve' | 'hide' | 'flag' | 'delete_response'
  if (!['approve', 'hide', 'flag', 'delete_response'].includes(action)) {
    return rep.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'action: approve|hide|flag|delete_response' } });
  }

  const updateData: any = { moderatedById: staffId, moderatedAt: new Date() };
  if (action === 'approve')          { updateData.isVisible = true;  updateData.isFlagged = false; }
  if (action === 'hide')             { updateData.isVisible = false; }
  if (action === 'flag')             { updateData.isFlagged = true;  updateData.flagReason = reason; }
  if (action === 'delete_response')  { updateData.ownerResponse = null; updateData.respondedAt = null; }

  const review = await db.review.update({ where: { id: reviewId }, data: updateData });

  // Recalc worker rating if visibility changed
  if ((action === 'approve' || action === 'hide') && review.workerId) {
    await recalcWorkerRating(review.workerId);
  }

  return rep.send({ success: true, data: review });
}

async function adminReviewStats(_req: FastifyRequest, rep: FastifyReply) {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const [total, flaggedToday, suspicious, avgRating, sentimentDist, ratingDist] = await Promise.all([
    db.review.count(),
    db.review.count({ where: { isFlagged: true, createdAt: { gte: today } } }),
    db.review.count({ where: { isSuspicious: true, isVisible: true } }),
    db.review.aggregate({ where: { isVisible: true }, _avg: { rating: true } }),
    db.review.groupBy({ by: ['sentimentLabel'], where: { sentimentLabel: { not: null } }, _count: { id: true } }),
    db.review.groupBy({ by: ['rating'],         where: { isVisible: true }, _count: { id: true } }),
  ]);

  return rep.send({
    success: true,
    data: {
      total,
      flaggedToday,
      pendingSuspicious: suspicious,
      avgRating:         parseFloat((avgRating._avg.rating ?? 0).toFixed(2)),
      sentimentDistribution: Object.fromEntries(sentimentDist.map(s => [s.sentimentLabel, s._count.id])),
      ratingDistribution:    Object.fromEntries(ratingDist.map(r => [r.rating, r._count.id])),
    },
  });
}

// ─── ROUTE REGISTRATION ───────────────────────────────────────────

export async function reviewUserRoutes(server: FastifyInstance) {
  server.post('/:bookingId/review',    { preHandler: [requireUser] }, wrap(submitReview));
  server.get('/:workerId/reviews',     {}, wrap(getWorkerReviews));          // Public
  server.post('/reviews/:reviewId/helpful', { preHandler: [requireUser] }, wrap(markHelpful));
}

export async function reviewWorkerRoutes(server: FastifyInstance) {
  server.post('/reviews/:reviewId/respond', { preHandler: [requireWorker] }, wrap(respondToReview));
}

export async function reviewAdminRoutes(server: FastifyInstance) {
  const viewPerm   = [requireStaff, requirePermission('view:analytics' as any)];
  const managePerm = [requireStaff, requirePermission('manage:users' as any)];
  server.get('/',              { preHandler: viewPerm   }, wrap(adminListReviews));
  server.get('/stats',         { preHandler: viewPerm   }, wrap(adminReviewStats));
  server.post('/:reviewId/moderate', { preHandler: managePerm }, wrap(adminModerateReview));
}
