import { db } from '../../infrastructure/database';
import type { User, Worker, Staff, UserSession, WorkerSession } from '@prisma/client';

// ──────────────────────────────────────────────────────────
// OTP
// ──────────────────────────────────────────────────────────

export const otpRepo = {
  create: async (mobile: string, otp: string, purpose: string, expiresAt: Date) => {
    // Purana OTP invalidate karo pehle
    await db.otpStore.updateMany({
      where: { mobile, purpose, isUsed: false },
      data: { isUsed: true },
    });

    return db.otpStore.create({
      data: { mobile, otp, purpose, expiresAt },
    });
  },

  findValid: async (mobile: string, purpose: string) => {
    return db.otpStore.findFirst({
      where: {
        mobile,
        purpose,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  incrementAttempts: async (id: string) => {
    return db.otpStore.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  },

  markUsed: async (id: string) => {
    return db.otpStore.update({
      where: { id },
      data: { isUsed: true, usedAt: new Date() },
    });
  },
};

// ──────────────────────────────────────────────────────────
// USER
// ──────────────────────────────────────────────────────────

export const userRepo = {
  findByMobile: async (mobile: string) => {
    return db.user.findUnique({ where: { mobile } });
  },

  findById: async (id: string) => {
    return db.user.findUnique({ where: { id } });
  },

  create: async (mobile: string): Promise<User> => {
    // Unique referral code generate karo
    const referralCode = `USR${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    return db.user.create({
      data: {
        mobile,
        referralCode,
        status: 'ACTIVE',
      },
    });
  },

  updateLastActive: async (id: string) => {
    return db.user.update({
      where: { id },
      data: { lastActiveAt: new Date() },
    });
  },

  createSession: async (data: {
    userId: string;
    refreshToken: string;
    deviceId?: string;
    deviceOs?: string;
    ipAddress?: string;
    fcmToken?: string;
    expiresAt: Date;
  }) => {
    return db.userSession.create({ data });
  },

  findSession: async (refreshToken: string) => {
    return db.userSession.findUnique({
      where: { refreshToken },
      include: { user: true },
    });
  },

  revokeSession: async (refreshToken: string) => {
    return db.userSession.updateMany({
      where: { refreshToken },
      data: { isActive: false, revokedAt: new Date() },
    });
  },

  revokeAllSessions: async (userId: string, exceptToken?: string) => {
    return db.userSession.updateMany({
      where: {
        userId,
        isActive: true,
        ...(exceptToken && { refreshToken: { not: exceptToken } }),
      },
      data: { isActive: false, revokedAt: new Date() },
    });
  },

  getSessions: async (userId: string) => {
    return db.userSession.findMany({
      where: { userId, isActive: true },
      orderBy: { lastUsedAt: 'desc' },
    });
  },

  updateFcmToken: async (userId: string, fcmToken: string, deviceId?: string) => {
    return db.userSession.updateMany({
      where: { userId, isActive: true, ...(deviceId && { deviceId }) },
      data: { fcmToken },
    });
  },
};

// ──────────────────────────────────────────────────────────
// WORKER
// ──────────────────────────────────────────────────────────

export const workerRepo = {
  findByMobile: async (mobile: string) => {
    return db.worker.findUnique({ where: { mobile } });
  },

  findById: async (id: string) => {
    return db.worker.findUnique({ where: { id } });
  },

  create: async (mobile: string): Promise<Worker> => {
    const referralCode = `WRK${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    return db.worker.create({
      data: {
        mobile,
        name: '',
        referralCode,
        status: 'PENDING_VERIFICATION',
      },
    });
  },

  updateLastActive: async (id: string) => {
    return db.worker.update({
      where: { id },
      data: { lastActiveAt: new Date() },
    });
  },

  createSession: async (data: {
    workerId: string;
    refreshToken: string;
    deviceId?: string;
    deviceOs?: string;
    ipAddress?: string;
    fcmToken?: string;
    expiresAt: Date;
  }) => {
    return db.workerSession.create({ data });
  },

  findSession: async (refreshToken: string) => {
    return db.workerSession.findUnique({
      where: { refreshToken },
      include: { worker: true },
    });
  },

  revokeSession: async (refreshToken: string) => {
    return db.workerSession.updateMany({
      where: { refreshToken },
      data: { isActive: false, revokedAt: new Date() },
    });
  },

  revokeAllSessions: async (workerId: string, exceptToken?: string) => {
    return db.workerSession.updateMany({
      where: {
        workerId,
        isActive: true,
        ...(exceptToken && { refreshToken: { not: exceptToken } }),
      },
      data: { isActive: false, revokedAt: new Date() },
    });
  },
};

// ──────────────────────────────────────────────────────────
// STAFF
// ──────────────────────────────────────────────────────────

export const staffRepo = {
  findByEmail: async (email: string) => {
    return db.staff.findUnique({ where: { email } });
  },

  findById: async (id: string) => {
    return db.staff.findUnique({ where: { id } });
  },

  createSession: async (data: {
    staffId: string;
    refreshToken: string;
    ipAddress?: string;
    userAgent?: string;
    expiresAt: Date;
  }) => {
    return db.staffSession.create({ data });
  },

  findSession: async (refreshToken: string) => {
    return db.staffSession.findUnique({
      where: { refreshToken },
      include: { staff: true },
    });
  },

  revokeSession: async (refreshToken: string) => {
    return db.staffSession.updateMany({
      where: { refreshToken },
      data: { isActive: false, revokedAt: new Date() },
    });
  },
};
