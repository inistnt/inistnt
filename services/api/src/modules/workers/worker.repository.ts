import { db } from '../../infrastructure/database';

export const workerRepo = {

  // ─── PROFILE ────────────────────────────────────────────

  findById: async (id: string) => {
    return db.worker.findUnique({
      where: { id },
      include: {
        city: { select: { id: true, nameHi: true, nameEn: true, slug: true } },
        area: { select: { id: true, nameHi: true, nameEn: true } },
        skills: { include: { serviceCategory: true } },
        subscription: true,
      },
    });
  },

  findPublicProfile: async (id: string) => {
    return db.worker.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        profilePhoto: true,
        tier: true,
        rating: true,
        totalReviews: true,
        totalJobs: true,
        completedJobs: true,
        isOnline: true,
        city: { select: { nameHi: true, nameEn: true } },
        area: { select: { nameHi: true, nameEn: true } },
        skills: {
          include: { serviceCategory: { select: { nameHi: true, nameEn: true, iconUrl: true } } },
        },
        createdAt: true,
      },
    });
  },

  update: async (id: string, data: {
    name?: string;
    email?: string;
    preferredLang?: string;
    tshirtSize?: string;
    profilePhoto?: string;
  }) => {
    return db.worker.update({ where: { id }, data });
  },

  updateStatus: async (id: string, data: {
    status?: string;
    isOnline?: boolean;
    onlineSince?: Date | null;
  }) => {
    return db.worker.update({ where: { id }, data });
  },

  // ─── DOCUMENTS ──────────────────────────────────────────

  getDocuments: async (workerId: string) => {
    return db.workerDocument.findMany({
      where: { workerId },
      orderBy: { createdAt: 'desc' },
    });
  },

  createDocument: async (workerId: string, type: string, fileUrl: string) => {
    // Purana same type ka document reject karo
    await db.workerDocument.updateMany({
      where: { workerId, type: type as any, status: 'PENDING' },
      data: { status: 'REJECTED', rejectionNote: 'Naya document upload kiya' },
    });

    return db.workerDocument.create({
      data: { workerId, type: type as any, fileUrl },
    });
  },

  // ─── SKILLS ─────────────────────────────────────────────

  getSkills: async (workerId: string) => {
    return db.workerSkill.findMany({
      where: { workerId },
      include: { serviceCategory: true },
    });
  },

  addSkill: async (workerId: string, serviceCategoryId: string, experienceYears = 0) => {
    return db.workerSkill.upsert({
      where: { workerId_serviceCategoryId: { workerId, serviceCategoryId } },
      create: { workerId, serviceCategoryId, experienceYears },
      update: { experienceYears },
    });
  },

  removeSkill: async (skillId: string, workerId: string) => {
    return db.workerSkill.deleteMany({ where: { id: skillId, workerId } });
  },

  // ─── EARNINGS ───────────────────────────────────────────

  getEarnings: async (workerId: string, period?: string) => {
    const now = new Date();
    let dateFrom: Date;

    if (period === 'week') {
      dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'month') {
      dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      dateFrom = new Date(now.getFullYear(), now.getMonth(), 1); // Default: this month
    }

    const [earnings, wallet] = await Promise.all([
      db.workerEarning.findMany({
        where: { workerId, createdAt: { gte: dateFrom } },
        orderBy: { createdAt: 'desc' },
      }),
      db.worker.findUnique({
        where: { id: workerId },
        select: { walletBalance: true, pendingPayout: true, totalEarned: true, totalWithdrawn: true },
      }),
    ]);

    const total = earnings.reduce((sum, e) => sum + e.finalAmount, 0);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEarnings = earnings
      .filter(e => e.createdAt >= todayStart)
      .reduce((sum, e) => sum + e.finalAmount, 0);

    return {
      totalEarnings: wallet?.totalEarned ?? 0,
      pendingPayout: wallet?.pendingPayout ?? 0,
      walletBalance: wallet?.walletBalance ?? 0,
      thisPeriod: total,
      todayEarnings,
      breakdown: earnings.map(e => ({
        date: e.createdAt,
        grossAmount: e.grossAmount,
        commission: e.commission,
        bonus: e.bonusAmount,
        penalty: e.penaltyAmount,
        uniformDeduction: e.uniformDeduction,
        finalAmount: e.finalAmount,
      })),
    };
  },

  getTransactions: async (workerId: string, page = 1, limit = 20) => {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      db.transaction.findMany({
        where: { workerId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.transaction.count({ where: { workerId } }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  // ─── PAYOUTS ────────────────────────────────────────────

  getPayouts: async (workerId: string, page = 1, limit = 20) => {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      db.workerPayout.findMany({
        where: { workerId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.workerPayout.count({ where: { workerId } }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  // ─── BANK DETAILS ────────────────────────────────────────

  getBankDetails: async (workerId: string) => {
    return db.worker.findUnique({
      where: { id: workerId },
      select: {
        payoutMethod: true,
        bankAccountNo: true,
        bankIfsc: true,
        bankName: true,
        upiId: true,
      },
    });
  },

  updateBankDetails: async (workerId: string, data: {
    payoutMethod: string;
    bankAccountNo?: string;
    bankIfsc?: string;
    bankName?: string;
    upiId?: string;
  }) => {
    return db.worker.update({ where: { id: workerId }, data });
  },

  // ─── REVIEWS ────────────────────────────────────────────

  getReviews: async (workerId: string, page = 1, limit = 20) => {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      db.review.findMany({
        where: { workerId, isVisible: true },
        include: {
          reviewer: { select: { id: true, name: true, profilePhoto: true } },
          booking: { select: { id: true, bookingNumber: true, service: { select: { nameHi: true, nameEn: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.review.count({ where: { workerId, isVisible: true } }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  // ─── SUBSCRIPTION ────────────────────────────────────────

  getSubscription: async (workerId: string) => {
    return db.workerSubscription.findUnique({ where: { workerId } });
  },

  // ─── STATS ──────────────────────────────────────────────

  getStats: async (workerId: string) => {
    return db.worker.findUnique({
      where: { id: workerId },
      select: {
        totalJobs: true,
        completedJobs: true,
        cancelledJobs: true,
        rating: true,
        totalReviews: true,
        completionRate: true,
        acceptanceRate: true,
        trustScore: true,
        consecutiveFiveStars: true,
        uniformComplianceScore: true,
        onboardedAt: true,
      },
    });
  },

  // ─── NOTIFICATIONS ───────────────────────────────────────

  getNotifications: async (workerId: string, page = 1, limit = 20) => {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      db.notification.findMany({
        where: { workerId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.notification.count({ where: { workerId } }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  getUnreadCount: async (workerId: string) => {
    return db.notification.count({ where: { workerId, isRead: false } });
  },

  markNotificationsRead: async (workerId: string, ids?: string[]) => {
    return db.notification.updateMany({
      where: {
        workerId,
        isRead: false,
        ...(ids && ids.length > 0 && { id: { in: ids } }),
      },
      data: { isRead: true, readAt: new Date() },
    });
  },

  // ─── REWARDS ────────────────────────────────────────────

  getRewards: async (workerId: string) => {
    return db.workerReward.findMany({
      where: { workerId },
      orderBy: { createdAt: 'desc' },
    });
  },

  // ─── INCENTIVE PROGRAMS ──────────────────────────────────

  getAvailablePrograms: async (workerId: string) => {
    const worker = await db.worker.findUnique({
      where: { id: workerId },
      select: { tier: true, cityId: true },
    });

    return db.incentiveProgram.findMany({
      where: {
        isActive: true,
        validFrom: { lte: new Date() },
        validTo: { gte: new Date() },
        OR: [
          { target: 'ALL_WORKERS' },
          { target: 'SPECIFIC_TIER', targetTier: worker?.tier },
        ],
      },
      include: {
        enrollments: {
          where: { workerId },
          select: { id: true, progress: true, isCompleted: true },
        },
      },
    });
  },
};
