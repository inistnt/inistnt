import type { FastifyRequest, FastifyReply } from 'fastify';
import { bookingRepo } from './booking.repository';
import { bookingService } from './booking.service';
import { kafka, KafkaTopics } from '../../infrastructure/kafka';

// ─── USER ACTIONS ────────────────────────────────────────────

export async function createBooking(req: FastifyRequest, rep: FastifyReply) {
  const booking = await bookingService.create({ ...(req.body as any), userId: req.currentUser.id });
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
  return rep.send({ success: true, data: { message: 'Customer ko start OTP bhej diya gaya.' } });
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
