import { db } from '../../infrastructure/database';

export const adminRepo = {

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

  getDisputes: async (params: { status?: string; page?: number; limit?: number }) => {
    const { status, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;
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

  getPendingPayouts: async () => {
    return db.workerPayout.findMany({
      where: { status: 'PENDING' },
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
};
