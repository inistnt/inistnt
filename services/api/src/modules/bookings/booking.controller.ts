import type { FastifyRequest, FastifyReply } from 'fastify';
import { bookingRepo } from './booking.repository';
import { bookingService } from './booking.service';
import { kafka, KafkaTopics } from '../../infrastructure/kafka';
import { calculateBookingAmount } from './hourly-billing.service';
import { db } from '../../infrastructure/database';

// ─── USER ACTIONS ────────────────────────────────────────────

export async function createBooking(req: FastifyRequest, rep: FastifyReply) {
  const body = req.body as any;

  // ── Hourly billing ──────────────────────────────────────────────
  const billing = await calculateBookingAmount({
    serviceId:  body.serviceId,
    cityId:     body.cityId,
    workerTier: 'BASIC',
    hours:      body.bookedHours ?? 1,
  });

  // ── Loyalty points redemption ───────────────────────────────────
  // 1 point = ₹0.10 (10 paise). Max redeem: upto 20% of booking amount.
  let loyaltyDiscount = 0;
  if (body.redeemPoints) {
    const user = await db.user.findUnique({
      where:  { id: req.currentUser.id },
      select: { loyaltyPoints: true },
    });
    const availablePoints = user?.loyaltyPoints ?? 0;
    const maxDiscount     = Math.floor(billing.baseAmount * 0.20); // max 20%
    const pointsValue     = availablePoints * 10;                  // 1 pt = 10 paise
    loyaltyDiscount       = Math.min(pointsValue, maxDiscount);
  }

  const booking = await bookingService.create({
    ...body,
    userId:          req.currentUser.id,
    baseAmount:      billing.baseAmount,
    bookedHours:     billing.bookedHours,
    loyaltyDiscount,
    redeemPoints:    body.redeemPoints ?? false,
  });
  return rep.status(201).send({ success: true, data: booking });
}

export async function getMyBookings(req: FastifyRequest, rep: FastifyReply) {
  const { status, page = 1, limit = 10 } = req.query as any;
  const result = await bookingRepo.getUserBookings(req.currentUser.id, { status, page: +page, limit: +limit });
  return rep.send({ success: true, data: result.items, meta: { total: result.total, page: result.page, totalPages: result.totalPages } });
}

export async function getActiveBooking(req: FastifyRequest, rep: FastifyReply) {
  const booking = await bookingRepo.getUserActiveBooking(req.currentUser.id);
  return rep.send({ success: true, data: booking });
}

export async function getBookingById(req: FastifyRequest, rep: FastifyReply) {
  const { bookingId } = req.params as { bookingId: string };
  const booking = await bookingRepo.findById(bookingId);
  if (!booking) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Booking nahi mili.' } });
  if (booking.userId !== req.currentUser.id) return rep.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied.' } });
  return rep.send({ success: true, data: booking });
}

export async function cancelBookingByUser(req: FastifyRequest, rep: FastifyReply) {
  const { bookingId } = req.params as { bookingId: string };
  const { reason } = req.body as { reason: string };
  const booking = await bookingRepo.findById(bookingId);
  if (!booking || booking.userId !== req.currentUser.id) return rep.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied.' } });
  const cancelled = await bookingService.cancel(bookingId, reason, req.currentUser.id, 'user');
  return rep.send({ success: true, data: cancelled });
}

export async function verifyEndOtp(req: FastifyRequest, rep: FastifyReply) {
  const { bookingId } = req.params as { bookingId: string };
  const { otp } = req.body as { otp: string };
  const booking = await bookingRepo.verifyEndOtp(bookingId, otp);
  await kafka.publish(KafkaTopics.BOOKING_COMPLETED, {
    bookingId, userId: booking.userId, workerId: booking.workerId,
    amount: booking.finalAmount, commissionAmount: booking.commissionAmount,
    workerEarning: booking.workerEarning, cityId: booking.cityId,
    serviceId: booking.serviceId, completedAt: new Date().toISOString(),
  }, bookingId);
  return rep.send({ success: true, data: { message: 'Booking complete ho gayi!' } });
}

export async function rateBooking(req: FastifyRequest, rep: FastifyReply) {
  const { bookingId } = req.params as { bookingId: string };
  const { rating, comment, tags } = req.body as any;
  const review = await bookingService.rateBooking(bookingId, req.currentUser.id, rating, comment, tags);
  return rep.status(201).send({ success: true, data: review });
}

export async function triggerSosByUser(req: FastifyRequest, rep: FastifyReply) {
  const { bookingId } = req.params as { bookingId: string };
  const { lat, lng, description } = req.body as any;
  const sos = await bookingRepo.createSos(bookingId, 'user', req.currentUser.id, undefined, lat, lng, description);
  await kafka.publish(KafkaTopics.SOS_TRIGGERED, { sosId: sos.id, bookingId, userId: req.currentUser.id, lat, lng }, bookingId);
  return rep.send({ success: true, data: { message: 'SOS bhej diya. Support team aapko contact karegi.', sos } });
}

export async function getBookingPhotos(req: FastifyRequest, rep: FastifyReply) {
  const { bookingId } = req.params as { bookingId: string };
  const photos = await bookingRepo.getPhotos(bookingId);
  return rep.send({ success: true, data: photos });
}

// ─── WORKER ACTIONS ──────────────────────────────────────────

export async function getWorkerBookings(req: FastifyRequest, rep: FastifyReply) {
  const { status, page = 1, limit = 10 } = req.query as any;
  const result = await bookingRepo.getWorkerBookings(req.currentUser.id, { status, page: +page, limit: +limit });
  return rep.send({ success: true, data: result.items, meta: { total: result.total, page: result.page, totalPages: result.totalPages } });
}

export async function getWorkerActiveBooking(req: FastifyRequest, rep: FastifyReply) {
  const booking = await bookingRepo.getWorkerActiveBooking(req.currentUser.id);
  return rep.send({ success: true, data: booking });
}

export async function acceptBooking(req: FastifyRequest, rep: FastifyReply) {
  const { bookingId } = req.params as { bookingId: string };
  const booking = await bookingRepo.findById(bookingId);
  if (!booking || booking.workerId !== req.currentUser.id) return rep.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied.' } });
  await bookingRepo.updateStatus(bookingId, 'WORKER_ACCEPTED', {}, req.currentUser.id, 'worker');
  await kafka.publish(KafkaTopics.BOOKING_ACCEPTED, { bookingId, workerId: req.currentUser.id, userId: booking.userId }, bookingId);
  return rep.send({ success: true, data: { message: 'Booking accept kar li.' } });
}

export async function markArrived(req: FastifyRequest, rep: FastifyReply) {
  const { bookingId } = req.params as { bookingId: string };
  const booking = await bookingRepo.findById(bookingId);
  if (!booking || booking.workerId !== req.currentUser.id) return rep.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied.' } });
  await bookingRepo.updateStatus(bookingId, 'WORKER_ARRIVED', {}, req.currentUser.id, 'worker');
  return rep.send({ success: true, data: { message: 'Customer ko OTP bhej diya. Unse start OTP lo.' } });
}

export async function verifyStartOtp(req: FastifyRequest, rep: FastifyReply) {
  const { bookingId } = req.params as { bookingId: string };
  const { otp } = req.body as { otp: string };
  const booking = await bookingRepo.verifyStartOtp(bookingId, otp);
  await kafka.publish(KafkaTopics.BOOKING_STARTED, { bookingId, workerId: req.currentUser.id, userId: booking.userId }, bookingId);
  return rep.send({ success: true, data: { message: 'Kaam shuru! Khatam hone pe customer se end OTP lo.' } });
}

export async function cancelBookingByWorker(req: FastifyRequest, rep: FastifyReply) {
  const { bookingId } = req.params as { bookingId: string };
  const { reason } = req.body as { reason: string };
  const booking = await bookingRepo.findById(bookingId);
  if (!booking || booking.workerId !== req.currentUser.id) return rep.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied.' } });
  const cancelled = await bookingService.cancel(bookingId, reason, req.currentUser.id, 'worker');
  return rep.send({ success: true, data: cancelled });
}

export async function uploadBookingPhoto(req: FastifyRequest, rep: FastifyReply) {
  const { bookingId } = req.params as { bookingId: string };
  const { type, url, caption } = req.body as any;
  const photo = await bookingRepo.addPhoto(bookingId, type, url, req.currentUser.id, 'worker', caption);
  return rep.status(201).send({ success: true, data: photo });
}

export async function triggerSosByWorker(req: FastifyRequest, rep: FastifyReply) {
  const { bookingId } = req.params as { bookingId: string };
  const { lat, lng, description } = req.body as any;
  const sos = await bookingRepo.createSos(bookingId, 'worker', undefined, req.currentUser.id, lat, lng, description);
  await kafka.publish(KafkaTopics.SOS_TRIGGERED, { sosId: sos.id, bookingId, workerId: req.currentUser.id, lat, lng }, bookingId);
  return rep.send({ success: true, data: { message: 'SOS bhej diya.', sos } });
}

// ─── UNIFORM CHECK — Worker selfie submit + AI analyze ─────────
export async function submitUniformCheck(req: FastifyRequest, rep: FastifyReply) {
  const { bookingId } = req.params as { bookingId: string };
  const { selfieUrl, lat, lng } = req.body as { selfieUrl: string; lat: number; lng: number };
  const workerId = req.currentUser.id;

  // Booking aur worker verify karo
  const booking = await db.booking.findUnique({
    where:  { id: bookingId },
    select: { workerId: true, status: true, uniformCheck: { select: { id: true } } },
  });
  if (!booking || booking.workerId !== workerId) {
    return rep.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied.' } });
  }
  if (booking.uniformCheck) {
    return rep.status(400).send({ success: false, error: { code: 'ALREADY_SUBMITTED', message: 'Is booking ka uniform check pehle se submit ho chuka hai.' } });
  }

  // DB mein save karo turant (AI async mein chalega)
  const check = await db.uniformCheck.create({
    data: {
      bookingId,
      workerId,
      selfieUrl,
      selfieLat:    lat,
      selfieLng:    lng,
      aiResult:     'UNSURE',
      aiConfidence: 0,
      finalResult:  'UNSURE',
    },
  });

  // AI analysis async mein (response block nahi karega)
  setImmediate(async () => {
    try {
      const { analyzeUniformPhotoRateLimited } = await import('../../infrastructure/uniform-ai.service');
      const aiResult = await analyzeUniformPhotoRateLimited(selfieUrl);

      const finalResult = aiResult.confidence >= 0.75
        ? aiResult.result
        : 'UNSURE';

      await db.uniformCheck.update({
        where: { id: check.id },
        data: {
          aiResult:       aiResult.result as any,
          aiConfidence:   aiResult.confidence,
          aiModelVersion: aiResult.modelVersion,
          finalResult:    finalResult as any,
        },
      });

      await kafka.publish(KafkaTopics.UNIFORM_AI_RESULT, {
        checkId:    check.id,
        bookingId,
        workerId,
        result:     finalResult,
        confidence: aiResult.confidence,
      }, bookingId);
    } catch (err: any) {
      console.error('[UniformCheck] AI analysis failed:', err.message);
    }
  });

  return rep.status(201).send({
    success: true,
    data: {
      checkId:  check.id,
      message:  'Selfie submit ho gayi. AI analysis ho raha hai, result kuch seconds mein milega.',
      status:   'PROCESSING',
    },
  });
}
