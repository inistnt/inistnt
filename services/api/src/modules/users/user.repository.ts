import { db } from '../../infrastructure/database';
import type { Address } from '@prisma/client';

export const userProfileRepo = {

  // ─── Profile ──────────────────────────────────────────

  findById: async (id: string) => {
    return db.user.findUnique({
      where: { id },
      select: {
        id: true,
        mobile: true,
        name: true,
        email: true,
        profilePhoto: true,
        status: true,
        preferredLang: true,
        totalBookings: true,
        totalSpend: true,
        loyaltyPoints: true,
        referralCode: true,
        deviceOs: true,
        lastActiveAt: true,
        createdAt: true,
      },
    });
  },

  update: async (id: string, data: {
    name?: string;
    email?: string;
    preferredLang?: string;
  }) => {
    return db.user.update({
      where: { id },
      data,
      select: {
        id: true,
        mobile: true,
        name: true,
        email: true,
        profilePhoto: true,
        preferredLang: true,
        loyaltyPoints: true,
        referralCode: true,
      },
    });
  },

  updatePhoto: async (id: string, photoUrl: string) => {
    return db.user.update({
      where: { id },
      data: { profilePhoto: photoUrl },
    });
  },

  // ─── Addresses ────────────────────────────────────────

  getAddresses: async (userId: string) => {
    return db.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  },

  getAddressById: async (id: string, userId: string) => {
    return db.address.findFirst({ where: { id, userId } });
  },

  createAddress: async (userId: string, data: {
    tag: string;
    flat?: string;
    building?: string;
    street: string;
    area: string;
    city: string;
    state: string;
    pincode: string;
    lat: number;
    lng: number;
    isDefault?: boolean;
  }) => {
    // Agar isDefault true hai toh baki sab false karo
    if (data.isDefault) {
      await db.address.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    // Pehla address automatically default hoga
    const count = await db.address.count({ where: { userId } });
    const isDefault = data.isDefault ?? count === 0;

    return db.address.create({
      data: { ...data, userId, isDefault },
    });
  },

  updateAddress: async (id: string, userId: string, data: Partial<{
    tag: string;
    flat: string;
    building: string;
    street: string;
    area: string;
    city: string;
    state: string;
    pincode: string;
    lat: number;
    lng: number;
  }>) => {
    return db.address.update({
      where: { id },
      data,
    });
  },

  deleteAddress: async (id: string, userId: string) => {
    return db.address.delete({ where: { id } });
  },

  setDefaultAddress: async (id: string, userId: string) => {
    await db.address.updateMany({
      where: { userId },
      data: { isDefault: false },
    });
    return db.address.update({
      where: { id },
      data: { isDefault: true },
    });
  },

  // ─── Loyalty ──────────────────────────────────────────

  getLoyaltyPoints: async (userId: string) => {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { loyaltyPoints: true },
    });
    return user?.loyaltyPoints ?? 0;
  },

  getLoyaltyHistory: async (userId: string, page = 1, limit = 20) => {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      db.loyaltyHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.loyaltyHistory.count({ where: { userId } }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  // ─── Transactions ─────────────────────────────────────

  getTransactions: async (userId: string, page = 1, limit = 20) => {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      db.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.transaction.count({ where: { userId } }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  // ─── Notifications ────────────────────────────────────

  getNotifications: async (userId: string, page = 1, limit = 20) => {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      db.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.notification.count({ where: { userId } }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  getUnreadCount: async (userId: string) => {
    return db.notification.count({ where: { userId, isRead: false } });
  },

  markNotificationsRead: async (userId: string, ids?: string[]) => {
    return db.notification.updateMany({
      where: {
        userId,
        isRead: false,
        ...(ids && ids.length > 0 && { id: { in: ids } }),
      },
      data: { isRead: true, readAt: new Date() },
    });
  },

  // ─── Referral ─────────────────────────────────────────

  getReferralInfo: async (userId: string) => {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });

    const referrals = await db.referral.findMany({
      where: { referrerUserId: userId },
    });

    const totalEarned = referrals.reduce((sum, r) => sum + r.referrerBonusAmount, 0);
    const pendingRewards = referrals.filter(r => !r.referrerBonusPaid).length;

    return {
      code: user?.referralCode ?? '',
      shareUrl: `https://inistnt.in/refer/${user?.referralCode}`,
      totalReferred: referrals.length,
      totalEarned,
      pendingRewards,
      records: referrals,
    };
  },
};
