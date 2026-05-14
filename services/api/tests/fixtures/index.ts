// ═══════════════════════════════════════════════════════════
// FIXTURE FACTORIES — Deterministic test data with @faker-js
// ═══════════════════════════════════════════════════════════

import { faker } from '@faker-js/faker';

// Seed faker for deterministic IDs in snapshots
faker.seed(42);

// ─── USER ──────────────────────────────────────────────────

export function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id:           faker.string.uuid(),
    mobile:       `9${faker.string.numeric(9)}`,
    name:         faker.person.fullName(),
    email:        faker.internet.email(),
    referralCode: `USR${faker.string.alphanumeric(6).toUpperCase()}`,
    status:       'ACTIVE',
    walletBalance: 0,
    totalBookings: 0,
    totalSpend:   0,
    loyaltyPoints: 0,
    createdAt:    new Date(),
    updatedAt:    new Date(),
    lastActiveAt: new Date(),
    ...overrides,
  };
}

export function makeUserSession(userId: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id:           faker.string.uuid(),
    userId,
    refreshToken: faker.string.hex(64),
    deviceId:     faker.string.uuid(),
    deviceOs:     'android',
    ipAddress:    faker.internet.ip(),
    fcmToken:     null,
    isActive:     true,
    createdAt:    new Date(),
    lastUsedAt:   new Date(),
    expiresAt:    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    revokedAt:    null,
    user: makeUser({ id: userId }),
    ...overrides,
  };
}

// ─── WORKER ────────────────────────────────────────────────

export function makeWorker(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id:               faker.string.uuid(),
    mobile:           `9${faker.string.numeric(9)}`,
    name:             faker.person.fullName(),
    email:            faker.internet.email(),
    referralCode:     `WRK${faker.string.alphanumeric(6).toUpperCase()}`,
    status:           'ACTIVE',
    isVerified:       true,
    isOnline:         false,
    walletBalance:    0,
    pendingPayout:    0,
    totalEarned:      0,
    completedJobs:    0,
    totalJobs:        0,
    rating:           4.5,
    ratingCount:      10,
    createdAt:        new Date(),
    updatedAt:        new Date(),
    lastActiveAt:     new Date(),
    ...overrides,
  };
}

export function makeWorkerSession(workerId: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id:           faker.string.uuid(),
    workerId,
    refreshToken: faker.string.hex(64),
    deviceId:     faker.string.uuid(),
    deviceOs:     'android',
    isActive:     true,
    createdAt:    new Date(),
    lastUsedAt:   new Date(),
    expiresAt:    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    revokedAt:    null,
    worker: makeWorker({ id: workerId }),
    ...overrides,
  };
}

// ─── STAFF ─────────────────────────────────────────────────

export function makeStaff(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id:           faker.string.uuid(),
    email:        faker.internet.email(),
    name:         faker.person.fullName(),
    role:         'ADMIN',
    isActive:     true,
    passwordHash: '$2a$12$testHashForTestingPurposesOnly.salt',
    createdAt:    new Date(),
    updatedAt:    new Date(),
    ...overrides,
  };
}

// ─── OTP STORE ─────────────────────────────────────────────

export function makeOtpRecord(mobile: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id:        faker.string.uuid(),
    mobile,
    otp:       '123456',
    purpose:   'login',
    attempts:  0,
    isUsed:    false,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    usedAt:    null,
    createdAt: new Date(),
    ...overrides,
  };
}

// ─── SERVICE ───────────────────────────────────────────────

export function makeService(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id:          faker.string.uuid(),
    name:        'Home Cleaning',
    slug:        'home-cleaning',
    description: 'Professional home cleaning service',
    categoryId:  faker.string.uuid(),
    isActive:    true,
    createdAt:   new Date(),
    updatedAt:   new Date(),
    ...overrides,
  };
}

export function makeServicePricing(serviceId: string, cityId: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id:         faker.string.uuid(),
    serviceId,
    cityId,
    basePrice:  50000, // ₹500 in paise
    isActive:   true,
    createdAt:  new Date(),
    ...overrides,
  };
}

// ─── BOOKING ───────────────────────────────────────────────

export function makeBooking(userId: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id:              faker.string.uuid(),
    bookingNumber:   `BK${Date.now()}`,
    userId,
    workerId:        null,
    serviceId:       faker.string.uuid(),
    cityId:          faker.string.uuid(),
    areaId:          null,
    addressId:       faker.string.uuid(),
    lat:             12.9716,
    lng:             77.5946,
    type:            'INSTANT',
    status:          'SEARCHING',
    baseAmount:      50000,
    surgeMultiplier: 1.0,
    surgeAmount:     0,
    discountAmount:  0,
    finalAmount:     50000,
    commissionRate:  12.0,
    commissionAmount: 6000,
    workerEarning:   44000,
    couponCode:      null,
    couponId:        null,
    scheduledFor:    null,
    userNotes:       null,
    cancelledAt:     null,
    cancelReason:    null,
    completedAt:     null,
    review:          null,
    createdAt:       new Date(),
    updatedAt:       new Date(),
    ...overrides,
  };
}

// ─── PAYMENT ───────────────────────────────────────────────

export function makePayment(bookingId: string, userId: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id:                  faker.string.uuid(),
    bookingId,
    userId,
    amount:              50000,
    status:              'INITIATED',
    razorpayOrderId:     `order_${faker.string.alphanumeric(14)}`,
    razorpayPaymentId:   null,
    razorpaySignature:   null,
    razorpayRefundId:    null,
    method:              null,
    capturedAt:          null,
    refundAmount:        null,
    refundReason:        null,
    refundedAt:          null,
    refundedById:        null,
    failureReason:       null,
    createdAt:           new Date(),
    updatedAt:           new Date(),
    booking: makeBooking(userId, { id: bookingId }),
    ...overrides,
  };
}

// ─── COUPON ────────────────────────────────────────────────

export function makeCoupon(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id:            faker.string.uuid(),
    code:          'SAVE10',
    discountType:  'percentage',
    discountValue: 10,
    maxDiscount:   10000, // ₹100
    minOrderAmount: 20000, // ₹200
    isActive:      true,
    validFrom:     new Date(Date.now() - 86400000),
    validTo:       new Date(Date.now() + 86400000),
    usedCount:     0,
    maxUses:       100,
    createdAt:     new Date(),
    ...overrides,
  };
}

// ─── COMMISSION RULE ───────────────────────────────────────

export function makeCommissionRule(cityId: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id:        faker.string.uuid(),
    cityId,
    serviceId: null,
    value:     12.0,
    level:     1,
    isActive:  true,
    createdAt: new Date(),
    ...overrides,
  };
}

// ─── APP VERSION ───────────────────────────────────────────

export function makeAppVersion(platform: 'android' | 'ios', overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id:             faker.string.uuid(),
    platform,
    currentVersion: '2.0.0',
    minVersion:     '1.5.0',
    forceUpdate:    false,
    isActive:       true,
    storeUrl:       platform === 'android'
      ? 'https://play.google.com/store/apps/details?id=com.inistnt'
      : 'https://apps.apple.com/app/inistnt/id123456789',
    updateMessage:  null,
    createdAt:      new Date(),
    ...overrides,
  };
}
