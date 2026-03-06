import { bookingRepo } from './booking.repository';
import { db } from '../../infrastructure/database';
import { kafka, KafkaTopics, type BookingCreatedEvent } from '../../infrastructure/kafka';
import { serviceRepo } from '../services/service.repository';

export const bookingService = {

  // ─── CREATE BOOKING ─────────────────────────────────────

  create: async (params: {
    userId: string;
    serviceId: string;
    cityId: string;
    areaId?: string;
    addressId: string;
    lat: number;
    lng: number;
    type?: 'INSTANT' | 'SCHEDULED';
    scheduledFor?: string;
    couponCode?: string;
    userNotes?: string;
  }) => {

    // 1. User ka active booking check karo
    const activeBooking = await bookingRepo.getUserActiveBooking(params.userId);
    if (activeBooking) {
      throw { statusCode: 400, code: 'ACTIVE_BOOKING_EXISTS', message: 'Aapki ek booking already active hai.' };
    }

    // 2. Service aur pricing fetch karo
    const service = await db.service.findUnique({ where: { id: params.serviceId } });
    if (!service) throw { statusCode: 404, message: 'Service nahi mili.' };

    const pricing = await db.servicePricing.findFirst({
      where: { serviceId: params.serviceId, cityId: params.cityId, isActive: true },
    });
    if (!pricing) throw { statusCode: 400, code: 'NOT_SERVICEABLE', message: 'Yeh service aapke city mein available nahi hai.' };

    // 3. Surge multiplier
    const surgeMultiplier = await serviceRepo.getSurgMultiplier(params.cityId, params.lat, params.lng);
    const baseAmount = pricing.basePrice;
    const surgeAmount = Math.round(baseAmount * (surgeMultiplier - 1));

    // 4. Coupon check
    let discountAmount = 0;
    let couponId: string | undefined;

    if (params.couponCode) {
      const coupon = await db.coupon.findFirst({
        where: {
          code: params.couponCode.toUpperCase(),
          isActive: true,
          validFrom: { lte: new Date() },
          validTo:   { gte: new Date() },
        },
      });

      if (coupon) {
        const amountAfterSurge = baseAmount + surgeAmount;
        if (amountAfterSurge >= coupon.minOrderAmount) {
          discountAmount = coupon.discountType === 'percentage'
            ? Math.round(amountAfterSurge * (coupon.discountValue / 100))
            : coupon.discountValue;

          if (coupon.maxDiscount) discountAmount = Math.min(discountAmount, coupon.maxDiscount);
          couponId = coupon.id;
          // Usage count increment
          await db.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
        }
      }
    }

    // 5. Final amount
    const finalAmount = Math.max(0, baseAmount + surgeAmount - discountAmount);

    // 6. Commission rate fetch karo
    const commissionRule = await db.commissionRule.findFirst({
      where: { isActive: true, cityId: params.cityId },
      orderBy: { level: 'desc' }, // Most specific rule
    });
    const commissionRate = commissionRule?.value ?? 12.0;

    // 7. Booking create karo
    const booking = await bookingRepo.create({
      userId: params.userId,
      serviceId: params.serviceId,
      cityId: params.cityId,
      areaId: params.areaId,
      addressId: params.addressId,
      lat: params.lat,
      lng: params.lng,
      type: params.type ?? 'INSTANT',
      scheduledFor: params.scheduledFor ? new Date(params.scheduledFor) : undefined,
      baseAmount,
      surgeMultiplier,
      surgeAmount,
      discountAmount,
      couponCode: params.couponCode,
      couponId,
      finalAmount,
      commissionRate,
      userNotes: params.userNotes,
    });

    // 8. Kafka event — matching engine aur notifications consume karenge
    await kafka.publish<BookingCreatedEvent>(KafkaTopics.BOOKING_CREATED, {
      bookingId: booking.id,
      userId:    params.userId,
      serviceId: params.serviceId,
      cityId:    params.cityId,
      areaId:    params.areaId,
      lat:       params.lat,
      lng:       params.lng,
      amount:    finalAmount,
      scheduledFor: params.scheduledFor,
    }, booking.id);

    // 9. Status SEARCHING pe set karo
    await bookingRepo.updateStatus(booking.id, 'SEARCHING', {}, params.userId, 'user');

    return booking;
  },

  // ─── CANCEL BOOKING ─────────────────────────────────────

  cancel: async (bookingId: string, reason: string, cancelledById: string, role: string) => {
    const booking = await bookingRepo.findById(bookingId);
    if (!booking) throw { statusCode: 404, message: 'Booking nahi mili.' };

    // Cancellable statuses
    const cancellableStatuses = ['PENDING', 'SEARCHING', 'ASSIGNED', 'WORKER_ACCEPTED', 'WORKER_ON_WAY'];
    if (!cancellableStatuses.includes(booking.status)) {
      throw { statusCode: 400, code: 'CANNOT_CANCEL', message: 'Yeh booking ab cancel nahi ho sakti.' };
    }

    const cancelled = await bookingRepo.cancel(bookingId, reason, cancelledById, role);

    await kafka.publish(KafkaTopics.BOOKING_CANCELLED, {
      bookingId,
      userId: booking.userId,
      workerId: booking.workerId,
      reason,
      cancelledByRole: role,
    }, bookingId);

    return cancelled;
  },

  // ─── RATE BOOKING ────────────────────────────────────────

  rateBooking: async (bookingId: string, userId: string, rating: number, comment?: string, tags?: string[]) => {
    const booking = await bookingRepo.findById(bookingId);
    if (!booking) throw { statusCode: 404, message: 'Booking nahi mili.' };
    if (booking.userId !== userId) throw { statusCode: 403, message: 'Yeh aapki booking nahi hai.' };
    if (booking.status !== 'COMPLETED') throw { statusCode: 400, message: 'Sirf completed bookings pe review de sakte hain.' };
    if (booking.review) throw { statusCode: 400, code: 'ALREADY_REVIEWED', message: 'Aap pehle hi review de chuke hain.' };
    if (!booking.workerId) throw { statusCode: 400, message: 'Worker assigned nahi tha.' };

    const review = await bookingRepo.createReview({
      bookingId,
      workerId: booking.workerId,
      reviewerId: userId,
      rating,
      comment,
      tags,
    });

    await kafka.publish(KafkaTopics.REVIEW_CREATED, {
      bookingId,
      workerId: booking.workerId,
      userId,
      rating,
    }, bookingId);

    return review;
  },
};
// NOTE: couponUsedCount increment added below
