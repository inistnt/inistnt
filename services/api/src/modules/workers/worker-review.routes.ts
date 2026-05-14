// ═══════════════════════════════════════════════════════════════════
// INISTNT — Worker Review (Worker rates User)
// Route:  POST /workers/me/bookings/:bookingId/review
// Auth:   Worker JWT
//
// Schema: Review model with targetType = WORKER_TO_USER
// Rules:
//   - Booking must be COMPLETED
//   - Booking must belong to this worker
//   - Only one review per booking per direction
//   - Rating: 1-5 stars
//   - Optional comment + predefined tags
// ═══════════════════════════════════════════════════════════════════

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db }     from '../../infrastructure/database';
import { authenticate, requireWorker } from '../../plugins/auth.middleware';
import { kafka, KafkaTopics } from '../../infrastructure/kafka';

// ─── Predefined tags for Worker → User reviews ───────────────────────────────
const WORKER_TO_USER_TAGS = [
  'polite',           // Vinamra tha
  'on_time',          // Samay par tha
  'clear_instructions', // Saaf bataya
  'good_facilities',  // Saaf jagah di kaam karne ke liye
  'tip_given',        // Tip di
  'rude',             // Badtameez tha
  'delayed_access',   // Andar aane mein der ki
  'unclear_instructions', // Kuch samajh nahi aaya
] as const;

const WorkerReviewSchema = z.object({
  rating:  z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
  tags:    z.array(z.enum(WORKER_TO_USER_TAGS)).max(5).optional().default([]),
});

type WorkerReviewBody = z.infer<typeof WorkerReviewSchema>;

// ─── Route Handler ────────────────────────────────────────────────────────────
export async function workerReviewRoutes(app: FastifyInstance) {
  // POST /workers/me/bookings/:bookingId/review
  app.post<{
    Params: { bookingId: string };
    Body:   WorkerReviewBody;
  }>(
    '/workers/me/bookings/:bookingId/review',
    {
      preHandler: [authenticate, requireWorker],
      schema: {
        tags:        ['Workers'],
        summary:     'Worker rates a User after booking completion',
        params:      { type: 'object', properties: { bookingId: { type: 'string' } } },
        body: {
          type: 'object',
          required: ['rating'],
          properties: {
            rating:  { type: 'integer', minimum: 1, maximum: 5 },
            comment: { type: 'string',  maxLength: 500 },
            tags:    { type: 'array',   items: { type: 'string' } },
          },
        },
      },
    },
    async (req: FastifyRequest<{ Params: { bookingId: string }; Body: WorkerReviewBody }>, rep: FastifyReply) => {
      const workerId  = (req as any).worker.id as string;
      const { bookingId } = req.params;

      // Validate body
      const parsed = WorkerReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        return rep.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
      }
      const { rating, comment, tags } = parsed.data;

      // Fetch booking
      const booking = await db.booking.findUnique({
        where:   { id: bookingId },
        include: { review: true },
      });

      if (!booking) {
        return rep.status(404).send({ error: 'Booking not found' });
      }

      // Must be this worker's booking
      if (booking.workerId !== workerId) {
        return rep.status(403).send({ error: 'Yeh booking aapki nahi hai' });
      }

      // Must be completed
      if (booking.status !== 'COMPLETED') {
        return rep.status(400).send({ error: 'Sirf completed bookings review ki ja sakti hain' });
      }

      // Check for duplicate WORKER_TO_USER review
      const existingWorkerReview = await db.review.findFirst({
        where: {
          bookingId,
          targetType: 'WORKER_TO_USER',
          workerId,
        },
      });
      if (existingWorkerReview) {
        return rep.status(409).send({ error: 'Aap pehle hi is booking ke liye review de chuke hain' });
      }

      // Create review
      const review = await db.review.create({
        data: {
          bookingId,
          targetType: 'WORKER_TO_USER',
          rating,
          comment:    comment ?? null,
          tags:       tags ?? [],
          workerId,   // Reviewer is the worker
          // reviewerId = null (user is the target, not the reviewer here)
          isVisible:  true,
        },
      });

      // Publish review created event (for ES sync + analytics)
      await kafka.publish(KafkaTopics.REVIEW_CREATED, {
        reviewId:   review.id,
        bookingId,
        workerId,
        userId:     booking.userId,
        targetType: 'WORKER_TO_USER',
        rating,
      }, bookingId);

      req.log.info({ reviewId: review.id, bookingId, workerId, rating }, '[WorkerReview] Created');

      return rep.status(201).send({
        success: true,
        reviewId: review.id,
        message: 'Review submit ho gaya',
      });
    },
  );

  // GET /workers/me/bookings/:bookingId/review — Check if already reviewed
  app.get<{ Params: { bookingId: string } }>(
    '/workers/me/bookings/:bookingId/review',
    { preHandler: [authenticate, requireWorker] },
    async (req: FastifyRequest<{ Params: { bookingId: string } }>, rep: FastifyReply) => {
      const workerId  = (req as any).worker.id as string;
      const { bookingId } = req.params;

      const review = await db.review.findFirst({
        where: { bookingId, targetType: 'WORKER_TO_USER', workerId },
        select: { id: true, rating: true, comment: true, tags: true, createdAt: true },
      });

      return rep.send({ reviewed: !!review, review: review ?? null });
    },
  );
}

// ─── Available tags export (for API docs / frontend) ─────────────────────────
export { WORKER_TO_USER_TAGS };
