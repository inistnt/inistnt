import { db } from '../../infrastructure/database';

export const adminRepo = {

  // ─── SCOPE HELPERS ──────────────────────────────────────────
  getWorkerCityId: async (workerId: string) =>
    db.worker.findUnique({ where: { id: workerId }, select: { cityId: true } }),

  getDocumentWorkerCityId: async (documentId: string) =>
    db.workerDocument.findUnique({ where: { id: documentId }, select: { worker: { select: { cityId: true } } } }),

  getBookingCityId: async (bookingId: string) =>
    db.booking.findUnique({ where: { id: bookingId }, select: { cityId: true } }),


  getDashboardStats: async (cityId?: string) => {
    const cityFilter = cityId ? { cityId } : {};
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    const [totalBookings, todayBookings, activeBookings, totalUsers, totalWorkers, onlineWorkers, todayRevenue, totalRevenue, openDisputes, activeSos] = await Promise.all([
      db.booking.count({ where: { ...cityFilter } }),
      db.booking.count({ where: { ...cityFilter, createdAt: { gte: todayStart } } }),
      db.booking.count({ where: { ...cityFilter, status: { in: ['SEARCHING','ASSIGNED','WORKER_ACCEPTED','WORKER_ARRIVED','WORK_STARTED'] } } }),
      db.user.count(),
      db.worker.count({ where: cityId ? { cityId } : {} }),
      db.worker.count({ where: { isOnline: true, ...(cityId ? { cityId } : {}) } }),
      db.payment.aggregate({ where: { status: 'CAPTURED', createdAt: { gte: todayStart } }, _sum: { amount: true } }),
      db.payment.aggregate({ where: { status: 'CAPTURED' }, _sum: { amount: true } }),
      db.dispute.count({ where: { status: { in: ['OPEN','UNDER_REVIEW'] } } }),
      db.sosIncident.count({ where: { status: 'ACTIVE' } }),
    ]);

    return {
      bookings: { total: totalBookings, today: todayBookings, active: activeBookings },
      users:    { total: totalUsers },
      workers:  { total: totalWorkers, online: onlineWorkers },
      revenue:  { today: todayRevenue._sum.amount ?? 0, total: totalRevenue._sum.amount ?? 0 },
      alerts:   { disputes: openDisputes, sos: activeSos },
    };
  },

  getLiveOps: async (cityId?: string) => {
    const cityFilter = cityId ? { cityId } : {};
    const [searching, activeSos, recentBookings] = await Promise.all([
      db.booking.findMany({ where: { ...cityFilter, status: 'SEARCHING' }, select: { id: true, bookingNumber: true, createdAt: true, service: { select: { nameEn: true } } }, orderBy: { createdAt: 'asc' } }),
      db.sosIncident.findMany({ where: { status: 'ACTIVE' }, include: { booking: { select: { bookingNumber: true } }, user: { select: { name: true, mobile: true } }, worker: { select: { name: true, mobile: true } } }, orderBy: { createdAt: 'desc' } }),
      db.booking.findMany({ where: { ...cityFilter }, include: { user: { select: { name: true } }, worker: { select: { name: true } }, service: { select: { nameEn: true } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    return { searching, activeSos, recentBookings };
  },

  getWorkers: async (params: { cityId?: string; status?: string; search?: string; page?: number; limit?: number }) => {
    const { cityId, status, search, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (cityId) where.cityId = cityId;
    if (status) where.status = status;
    if (search) where.OR = [{ name: { contains: search, mode: 'insensitive' } }, { mobile: { contains: search } }];
    const [items, total] = await Promise.all([
      db.worker.findMany({ where, include: { city: { select: { nameEn: true } }, area: { select: { nameEn: true } } }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      db.worker.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  verifyWorker: async (workerId: string) => {
    return db.worker.update({ where: { id: workerId }, data: { status: 'VERIFIED', onboardedAt: new Date() } });
  },

  suspendWorker: async (workerId: string, reason: string, actorId: string) => {
    await db.auditLog.create({ data: { action: 'worker.suspend', entityType: 'worker', entityId: workerId, actorId, actorRole: 'admin', reason } });
    return db.worker.update({ where: { id: workerId }, data: { status: 'SUSPENDED', suspendedAt: new Date(), suspensionReason: reason } });
  },

  approveDocument: async (documentId: string, reviewedById: string) => {
    return db.workerDocument.update({ where: { id: documentId }, data: { status: 'APPROVED', reviewedById, reviewedAt: new Date() } });
  },

  rejectDocument: async (documentId: string, reviewedById: string, note: string) => {
    return db.workerDocument.update({ where: { id: documentId }, data: { status: 'REJECTED', reviewedById, reviewedAt: new Date(), rejectionNote: note } });
  },

  getBookings: async (params: { cityId?: string; status?: string; search?: string; page?: number; limit?: number }) => {
    const { cityId, status, search, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (cityId) where.cityId = cityId;
    if (status) where.status = status;
    if (search) where.OR = [{ bookingNumber: { contains: search } }];
    const [items, total] = await Promise.all([
      db.booking.findMany({ where, include: { user: { select: { name: true, mobile: true } }, worker: { select: { name: true, mobile: true } }, service: { select: { nameEn: true } }, payment: { select: { status: true, amount: true } } }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      db.booking.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  getDisputes: async (params: { status?: string; cityId?: string; page?: number; limit?: number }) => {
    const { status, cityId, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;
    if (cityId) where.booking = { cityId };
    const [items, total] = await Promise.all([
      db.dispute.findMany({ where, include: { booking: { select: { bookingNumber: true } }, user: { select: { name: true, mobile: true } }, worker: { select: { name: true, mobile: true } } }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }], skip, take: limit }),
      db.dispute.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  resolveDispute: async (disputeId: string, resolution: string, refundAmount: number | undefined, resolvedById: string) => {
    return db.dispute.update({ where: { id: disputeId }, data: { status: 'RESOLVED', resolution, refundAmount, resolvedById, resolvedAt: new Date() } });
  },

  addDisputeNote: async (disputeId: string, authorId: string, authorRole: string, note: string) => {
    return db.disputeNote.create({ data: { disputeId, authorId, authorRole, note, isInternal: true } });
  },

  getCommissionRules: async (cityId?: string) => {
    return db.commissionRule.findMany({ where: { isActive: true, ...(cityId ? { cityId } : {}) }, orderBy: { level: 'asc' } });
  },

  createCommissionRule: async (data: any) => {
    return db.commissionRule.create({ data });
  },

  getBanners: async (cityId?: string) => {
    return db.banner.findMany({ where: cityId ? { cityId } : {}, orderBy: [{ sortOrder: 'asc' }] });
  },

  createBanner: async (data: any, createdById: string) => {
    return db.banner.create({ data: { ...data, createdById } });
  },

  updateBannerStatus: async (bannerId: string, status: string, approvedById?: string) => {
    return db.banner.update({ where: { id: bannerId }, data: { status: status as any, ...(approvedById && { approvedById, approvedAt: new Date() }) } });
  },

  activateSurge: async (cityId: string, multiplier: number, reason: string, activatedById: string, deactivatesAt?: Date) => {
    await db.surgeZone.updateMany({ where: { cityId, isActive: true }, data: { isActive: false } });
    return db.surgeZone.create({ data: { cityId, name: `Manual - ${reason}`, polygon: {}, multiplier, isActive: true, reason, activatedById, activatedAt: new Date(), deactivatesAt } });
  },

  deactivateSurge: async (cityId: string) => {
    return db.surgeZone.updateMany({ where: { cityId, isActive: true }, data: { isActive: false } });
  },

  getFeatureFlags: async () => db.featureFlag.findMany({ orderBy: { key: 'asc' } }),

  toggleFeatureFlag: async (key: string, isEnabled: boolean, updatedById: string) => {
    return db.featureFlag.update({ where: { key }, data: { isEnabled, updatedById } });
  },

  getCoupons: async () => db.coupon.findMany({ orderBy: { createdAt: 'desc' } }),

  createCoupon: async (data: any, createdById: string) => {
    return db.coupon.create({ data: { ...data, createdById } });
  },

  toggleCoupon: async (couponId: string, isActive: boolean) => {
    return db.coupon.update({ where: { id: couponId }, data: { isActive } });
  },

  getPendingPayouts: async (cityId?: string) => {
    const payoutWhere: any = { status: 'PENDING' };
    if (cityId) payoutWhere.worker = { cityId };
    return db.workerPayout.findMany({
      where: payoutWhere,
      include: { worker: { select: { name: true, mobile: true, bankAccountNo: true, bankIfsc: true, upiId: true, payoutMethod: true } } },
      orderBy: { createdAt: 'asc' },
    });
  },

  processPayout: async (payoutId: string, utrNumber: string, processedById: string) => {
    const payout = await db.workerPayout.update({ where: { id: payoutId }, data: { status: 'COMPLETED', utrNumber, processedById, processedAt: new Date() } });
    await db.worker.update({ where: { id: payout.workerId }, data: { pendingPayout: { decrement: payout.amount }, walletBalance: { decrement: payout.amount }, totalWithdrawn: { increment: payout.amount } } });
    return payout;
  },

  getAuditLogs: async (params: { entityType?: string; entityId?: string; page?: number; limit?: number }) => {
    const { entityType, entityId, page = 1, limit = 50 } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    const [items, total] = await Promise.all([db.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }), db.auditLog.count({ where })]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  // ─── USER MANAGEMENT ────────────────────────────────────
  getUsers: async (params: { search?: string; status?: string; cityId?: string; page?: number; limit?: number }) => {
    const { search, status, cityId, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;
    if (cityId) where.bookings = { some: { cityId } };
    if (search) where.OR = [{ name: { contains: search, mode: 'insensitive' } }, { mobile: { contains: search } }, { email: { contains: search, mode: 'insensitive' } }];
    const [items, total] = await Promise.all([
      db.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      db.user.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  suspendUser: async (userId: string, reason: string, actorId: string) => {
    await db.auditLog.create({ data: { action: 'user.suspend', entityType: 'user', entityId: userId, actorId, actorRole: 'admin', reason } });
    return db.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });
  },

  // ─── WORKER TIER CHANGE ──────────────────────────────────
  updateWorkerTier: async (workerId: string, tier: string, changedById: string) => {
    const before = await db.worker.findUnique({ where: { id: workerId }, select: { tier: true } });
    await db.auditLog.create({ data: { action: 'worker.tier_change', entityType: 'worker', entityId: workerId, actorId: changedById, actorRole: 'admin', before: { tier: before?.tier }, after: { tier } } });
    return db.worker.update({ where: { id: workerId }, data: { tier: tier as any } });
  },

  // ─── SOS MANAGEMENT ──────────────────────────────────────
  getSosIncidents: async (params: { status?: string; cityId?: string; page?: number; limit?: number }) => {
    const { status, cityId, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;
    if (cityId) where.booking = { cityId };
    const [items, total] = await Promise.all([
      db.sosIncident.findMany({ where, include: { booking: { select: { bookingNumber: true } }, user: { select: { name: true, mobile: true } }, worker: { select: { name: true, mobile: true } } }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      db.sosIncident.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  resolveSos: async (sosId: string, resolution: string, resolvedById: string) => {
    return db.sosIncident.update({ where: { id: sosId }, data: { status: 'RESOLVED', resolution, resolvedById, resolvedAt: new Date() } });
  },

  // ─── CITY / AREA CRUD ────────────────────────────────────
  getCities: async (cityId?: string) => db.city.findMany({ where: cityId ? { id: cityId } : undefined, include: { state: { select: { nameEn: true } } }, orderBy: { nameEn: 'asc' } }),

  createCity: async (data: any) => db.city.create({ data }),

  updateCity: async (cityId: string, data: any) => db.city.update({ where: { id: cityId }, data }),

  getAreas: async (cityId: string, areaId?: string) => db.area.findMany({ where: areaId ? { cityId, id: areaId } : { cityId }, orderBy: { nameEn: 'asc' } }),

  createArea: async (data: any) => db.area.create({ data }),

  updateArea: async (areaId: string, data: any) => db.area.update({ where: { id: areaId }, data }),

  // ─── SERVICE CRUD ────────────────────────────────────────
  getServicesAdmin: async () => db.service.findMany({ include: { category: true }, orderBy: { sortOrder: 'asc' } }),

  createService: async (data: any) => db.service.create({ data }),

  updateService: async (serviceId: string, data: any) => db.service.update({ where: { id: serviceId }, data }),

  createCategory: async (data: any) => db.serviceCategory.create({ data }),

  updateCategory: async (categoryId: string, data: any) => db.serviceCategory.update({ where: { id: categoryId }, data }),

  // Pricing
  setPricing: async (serviceId: string, cityId: string, workerTier: string, data: any) => {
    return db.servicePricing.upsert({
      where: { serviceId_cityId_workerTier: { serviceId, cityId, workerTier } },
      create: { serviceId, cityId, workerTier: workerTier as any, ...data },
      update: data,
    });
  },

  // ─── STAFF CRUD ──────────────────────────────────────────
  getStaff: async (cityId?: string) => db.staff.findMany({ where: cityId ? { cityId } : undefined, include: { city: { select: { nameEn: true } } }, orderBy: { createdAt: 'desc' } }),

  createStaff: async (data: any) => db.staff.create({ data }),

  updateStaff: async (staffId: string, data: any) => db.staff.update({ where: { id: staffId }, data }),

  deactivateStaff: async (staffId: string) => db.staff.update({ where: { id: staffId }, data: { isActive: false } }),

  // ─── APP VERSIONS ────────────────────────────────────────
  getAppVersions: async () => db.appVersion.findMany({ orderBy: { createdAt: 'desc' } }),

  createAppVersion: async (data: any) => db.appVersion.create({ data }),

  // ─── CAMPAIGNS ───────────────────────────────────────────
  getCampaigns: async (cityId?: string) => db.campaign.findMany({ where: cityId ? { cityId } : undefined, orderBy: { createdAt: 'desc' } }),

  createCampaign: async (data: any) => db.campaign.create({ data }),

  updateCampaignStatus: async (campaignId: string, status: string) => db.campaign.update({ where: { id: campaignId }, data: { status: status as any } }),

  // ─── UNIFORM CHECK REVIEW ────────────────────────────────
  getPendingUniformChecks: async (cityId?: string) => {
    const uniformWhere: any = { result: 'UNSURE' };
    if (cityId) uniformWhere.worker = { cityId };
    return db.uniformCheck.findMany({
      where: { status: 'PENDING_REVIEW' },
      include: { worker: { select: { id: true, name: true, mobile: true } } },
      orderBy: { createdAt: 'asc' },
    });
  },

  reviewUniformCheck: async (checkId: string, result: string, reviewedById: string, note?: string) => {
    return db.uniformCheck.update({
      where: { id: checkId },
      data: { adminOverride: result as any, reviewedById, reviewedAt: new Date(), adminNote: note },
    });
  },

  // ─── INCENTIVE PROGRAMS ──────────────────────────────────────
  getIncentivePrograms: async (params: { isActive?: boolean; cityId?: string; page?: number; limit?: number }) => {
    const { isActive, cityId, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (isActive !== undefined) where.isActive = isActive;
    if (cityId) where.targetCityIds = { has: cityId };

    const [items, total] = await Promise.all([
      db.incentiveProgram.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      db.incentiveProgram.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  createIncentiveProgram: async (data: any, createdById: string) => {
    return db.incentiveProgram.create({ data: { ...data, createdById } });
  },

  updateIncentiveProgram: async (programId: string, data: any) => {
    return db.incentiveProgram.update({ where: { id: programId }, data });
  },

  toggleIncentiveProgram: async (programId: string, isActive: boolean) => {
    return db.incentiveProgram.update({ where: { id: programId }, data: { isActive } });
  },

  getIncentiveProgramStats: async (programId: string) => {
    const [program, enrolled, completed] = await Promise.all([
      db.incentiveProgram.findUnique({ where: { id: programId }, select: { bonusAmount: true } }),
      db.incentiveProgramEnrollment.count({ where: { programId } }),
      db.incentiveProgramEnrollment.count({ where: { programId, completedAt: { not: null } } }),
    ]);
    return {
      enrolled,
      completed,
      totalBonusPaid: (program?.bonusAmount ?? 0) * completed, // paise mein
      completionRate: enrolled > 0 ? Math.round((completed / enrolled) * 100) : 0,
    };
  },

  // ─── FRAUD FLAGS ─────────────────────────────────────────────
  getFraudFlags: async (params: { severity?: string; status?: string; flagType?: string; page?: number; limit?: number }) => {
    const { severity, status, flagType, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (severity) where.severity = severity;
    if (status)   where.status   = status;
    if (flagType) where.type     = flagType;

    const [items, total] = await Promise.all([
      db.fraudFlag.findMany({
        where,
        include: {
          user:   { select: { name: true, mobile: true } },
          worker: { select: { name: true, mobile: true } },
        },
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      db.fraudFlag.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  reviewFraudFlag: async (flagId: string, action: 'confirm' | 'dismiss', reviewedById: string, note?: string) => {
    const status = action === 'confirm' ? 'reviewed' : 'dismissed';
    return db.fraudFlag.update({
      where: { id: flagId },
      data:  { status, reviewedById, reviewedAt: new Date(), reviewNote: note, actionTaken: action },
    });
  },

  // ─── BULK NOTIFICATIONS ──────────────────────────────────────
  getWorkerFcmTokensForBulk: async (cityId?: string, workerTier?: string) => {
    const where: any = { isActive: true, fcmToken: { not: null } };
    if (cityId)     where.cityId = cityId;
    if (workerTier) where.tier   = workerTier;
    return db.worker.findMany({ where, select: { id: true, fcmToken: true } });
  },

  getUserFcmTokensForBulk: async (cityId?: string) => {
    const where: any = { status: 'ACTIVE', fcmToken: { not: null } };
    // Users don't have cityId directly — filter by booking history if cityId provided
    if (cityId) {
      where.bookings = { some: { cityId } };
    }
    return db.user.findMany({ where, select: { id: true, fcmToken: true } });
  },

  createBulkNotificationRecords: async (notifications: Array<{ title: string; body: string; deepLink?: string }>) => {
    return db.notification.createMany({
      data: notifications.map(n => ({
        channel:  'PUSH' as any,
        title:    n.title,
        body:     n.body,
        deepLink: n.deepLink,
      })),
    });
  },

  // ─── ANALYTICS EXPORT ────────────────────────────────────────
  getAnalyticsExportData: async (params: { dateFrom: string; dateTo: string; metrics: string[]; cityId?: string }) => {
    const { dateFrom, dateTo, metrics, cityId } = params;
    const from = new Date(dateFrom);
    const to   = new Date(dateTo);
    const cityFilter = cityId ? { cityId } : {};

    const result: Record<string, any> = {};

    if (metrics.includes('bookings')) {
      result.bookings = await db.booking.findMany({
        where: { ...cityFilter, createdAt: { gte: from, lte: to } },
        select: {
          bookingNumber: true, status: true, finalAmount: true,
          commissionAmount: true, workerEarning: true,
          createdAt: true, completedAt: true,
          service: { select: { nameEn: true } },
          city:    { select: { nameEn: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (metrics.includes('revenue')) {
      result.revenue = await db.payment.findMany({
        where: { status: 'CAPTURED', createdAt: { gte: from, lte: to } },
        select: {
          amount: true, createdAt: true,
          booking: { select: { bookingNumber: true, cityId: true, commissionAmount: true, workerEarning: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (metrics.includes('workers')) {
      result.workers = await db.worker.findMany({
        where: { ...(cityId ? { cityId } : {}), createdAt: { lte: to } },
        select: {
          name: true, mobile: true, tier: true, status: true,
          totalJobs: true, rating: true, walletBalance: true,
          totalWithdrawn: true, createdAt: true,
          city: { select: { nameEn: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (metrics.includes('payouts')) {
      result.payouts = await db.workerPayout.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: {
          amount: true, status: true, utrNumber: true,
          processedAt: true, createdAt: true,
          worker: { select: { name: true, mobile: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
    }

    return result;
  },
};
