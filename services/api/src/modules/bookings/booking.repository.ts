import { db } from '../../infrastructure/database';

export const bookingRepo = {

  // ─── CREATE ─────────────────────────────────────────────

  create: async (data: {
    userId: string;
    serviceId: string;
    cityId: string;
    areaId?: string;
    addressId: string;
    lat: number;
    lng: number;
    type: 'INSTANT' | 'SCHEDULED';
    scheduledFor?: Date;
    baseAmount: number;
    surgeMultiplier: number;
    surgeAmount: number;
    discountAmount: number;
    couponCode?: string;
    couponId?: string;
    finalAmount: number;
    commissionRate: number;
    userNotes?: string;
  }) => {
    // Booking number generate karo — INS-2024-00001
    const count = await db.booking.count();
    const bookingNumber = `INS-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    // OTPs generate karo
    const startOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const endOtp   = Math.floor(1000 + Math.random() * 9000).toString();

    return db.booking.create({
      data: {
        ...data,
        bookingNumber,
        startOtp,
        endOtp,
        status: 'PENDING',
        // Worker earning will be calculated after worker is assigned
        workerEarning: 0,
        commissionAmount: 0,
      },
      include: {
        user:    { select: { id: true, name: true, mobile: true, profilePhoto: true } },
        service: { select: { id: true, nameHi: true, nameEn: true, iconUrl: true } },
        address: true,
        city:    { select: { id: true, nameHi: true, nameEn: true } },
        area:    { select: { id: true, nameHi: true, nameEn: true } },
      },
    });
  },

  // ─── FIND ───────────────────────────────────────────────

  findById: async (id: string) => {
    return db.booking.findUnique({
      where: { id },
      include: {
        user:    { select: { id: true, name: true, mobile: true, profilePhoto: true } },
        worker:  { select: { id: true, name: true, mobile: true, profilePhoto: true, rating: true, tier: true } },
        service: { select: { id: true, nameHi: true, nameEn: true, iconUrl: true } },
        address: true,
        city:    { select: { id: true, nameHi: true, nameEn: true } },
        area:    { select: { id: true, nameHi: true, nameEn: true } },
        payment: true,
        review:  true,
        timeline: { orderBy: { createdAt: 'asc' } },
        photos:   { orderBy: { createdAt: 'asc' } },
      },
    });
  },

  findByNumber: async (bookingNumber: string) => {
    return db.booking.findUnique({ where: { bookingNumber } });
  },

  // ─── USER BOOKINGS ──────────────────────────────────────

  getUserBookings: async (userId: string, params?: {
    status?: string;
    page?: number;
    limit?: number;
  }) => {
    const { status, page = 1, limit = 10 } = params ?? {};
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      db.booking.findMany({
        where,
        include: {
          worker:  { select: { id: true, name: true, profilePhoto: true, rating: true } },
          service: { select: { id: true, nameHi: true, nameEn: true, iconUrl: true } },
          address: { select: { street: true, area: true, city: true } },
          review:  { select: { rating: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.booking.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  // ─── WORKER BOOKINGS ────────────────────────────────────

  getWorkerBookings: async (workerId: string, params?: {
    status?: string;
    page?: number;
    limit?: number;
  }) => {
    const { status, page = 1, limit = 10 } = params ?? {};
    const skip = (page - 1) * limit;

    const where: any = { workerId };
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      db.booking.findMany({
        where,
        include: {
          user:    { select: { id: true, name: true, profilePhoto: true } },
          service: { select: { id: true, nameHi: true, nameEn: true, iconUrl: true } },
          address: { select: { flat: true, building: true, street: true, area: true, city: true, lat: true, lng: true } },
          earning: { select: { finalAmount: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.booking.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  // ─── STATUS UPDATE ──────────────────────────────────────

  updateStatus: async (
    id: string,
    status: string,
    extra?: Record<string, unknown>,
    actorId?: string,
    actorType?: string,
  ) => {
    const now = new Date();
    const timeFields: Record<string, Date> = {};

    // Status ke hisaab se timestamp set karo
    if (status === 'ASSIGNED')          timeFields.assignedAt        = now;
    if (status === 'WORKER_ACCEPTED')   timeFields.workerAcceptedAt  = now;
    if (status === 'WORKER_ARRIVED')    timeFields.workerArrivedAt   = now;
    if (status === 'WORK_STARTED')      timeFields.workStartedAt     = now;
    if (status === 'WORK_COMPLETED')    timeFields.workCompletedAt   = now;
    if (status === 'COMPLETED')         timeFields.completedAt       = now;
    if (status.startsWith('CANCELLED')) timeFields.cancelledAt       = now;

    const [booking] = await Promise.all([
      // Booking update karo
      db.booking.update({
        where: { id },
        data: { status: status as any, ...timeFields, ...(extra ?? {}) },
      }),
      // Timeline mein log karo
      db.bookingTimeline.create({
        data: {
          bookingId: id,
          status: status as any,
          actorId,
          actorType,
        },
      }),
    ]);

    return booking;
  },

  // ─── ASSIGN WORKER ──────────────────────────────────────

  assignWorker: async (bookingId: string, workerId: string, commissionRate: number) => {
    const booking = await db.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw { statusCode: 404, message: 'Booking nahi mili.' };

    const commissionAmount = Math.round(booking.finalAmount * (commissionRate / 100));
    const workerEarning = booking.finalAmount - commissionAmount;

    return db.booking.update({
      where: { id: bookingId },
      data: {
        workerId,
        status: 'ASSIGNED',
        assignedAt: new Date(),
        commissionRate,
        commissionAmount,
        workerEarning,
      },
    });
  },

  // ─── OTP VERIFY ─────────────────────────────────────────

  verifyStartOtp: async (bookingId: string, otp: string) => {
    const booking = await db.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw { statusCode: 404, message: 'Booking nahi mili.' };
    if (booking.startOtp !== otp) throw { statusCode: 400, code: 'WRONG_OTP', message: 'Galat OTP.' };

    return db.booking.update({
      where: { id: bookingId },
      data: { startOtpVerifiedAt: new Date(), status: 'WORK_STARTED', workStartedAt: new Date() },
    });
  },

  verifyEndOtp: async (bookingId: string, otp: string) => {
    const booking = await db.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw { statusCode: 404, message: 'Booking nahi mili.' };
    if (booking.endOtp !== otp) throw { statusCode: 400, code: 'WRONG_OTP', message: 'Galat OTP.' };

    return db.booking.update({
      where: { id: bookingId },
      data: { endOtpVerifiedAt: new Date(), status: 'WORK_COMPLETED', workCompletedAt: new Date() },
    });
  },

  // ─── CANCEL ─────────────────────────────────────────────

  cancel: async (bookingId: string, reason: string, cancelledById: string, cancelledByRole: string) => {
    const status = cancelledByRole === 'user'
      ? 'CANCELLED_BY_USER'
      : cancelledByRole === 'worker'
        ? 'CANCELLED_BY_WORKER'
        : 'CANCELLED_BY_ADMIN';

    return db.booking.update({
      where: { id: bookingId },
      data: {
        status: status as any,
        cancelledAt: new Date(),
        cancellationReason: reason,
        cancelledById,
        cancelledByRole,
      },
    });
  },

  // ─── PHOTOS ─────────────────────────────────────────────

  addPhoto: async (bookingId: string, type: string, url: string, uploadedById: string, uploadedByType: string, caption?: string) => {
    return db.bookingPhoto.create({
      data: { bookingId, type, url, uploadedById, uploadedByType, caption },
    });
  },

  getPhotos: async (bookingId: string) => {
    return db.bookingPhoto.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'asc' },
    });
  },

  // ─── REVIEW ─────────────────────────────────────────────

  createReview: async (data: {
    bookingId: string;
    workerId: string;
    reviewerId: string;
    rating: number;
    comment?: string;
    tags?: string[];
  }) => {
    const review = await db.review.create({
      data: {
        ...data,
        targetType: 'USER_TO_WORKER',
      },
    });

    // Worker ka rating update karo
    const allReviews = await db.review.findMany({
      where: { workerId: data.workerId, isVisible: true },
      select: { rating: true },
    });
    const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;

    await db.worker.update({
      where: { id: data.workerId },
      data: {
        rating: Math.round(avgRating * 10) / 10,
        totalReviews: allReviews.length,
        consecutiveFiveStars: data.rating === 5
          ? { increment: 1 }
          : 0,
      },
    });

    return review;
  },

  // ─── SOS ────────────────────────────────────────────────

  createSos: async (bookingId: string, triggeredBy: string, userId?: string, workerId?: string, lat?: number, lng?: number, description?: string) => {
    return db.sosIncident.create({
      data: {
        bookingId,
        triggeredBy,
        userId,
        workerId,
        status: 'ACTIVE',
        lat: lat ?? 0,
        lng: lng ?? 0,
        description,
      },
    });
  },

  // ─── ACTIVE BOOKING CHECK ───────────────────────────────

  getUserActiveBooking: async (userId: string) => {
    return db.booking.findFirst({
      where: {
        userId,
        status: {
          notIn: ['COMPLETED', 'CANCELLED_BY_USER', 'CANCELLED_BY_WORKER', 'CANCELLED_BY_ADMIN', 'NO_WORKER_FOUND'],
        },
      },
    });
  },

  getWorkerActiveBooking: async (workerId: string) => {
    return db.booking.findFirst({
      where: {
        workerId,
        status: {
          notIn: ['COMPLETED', 'CANCELLED_BY_USER', 'CANCELLED_BY_WORKER', 'CANCELLED_BY_ADMIN', 'NO_WORKER_FOUND'],
        },
      },
    });
  },
};
