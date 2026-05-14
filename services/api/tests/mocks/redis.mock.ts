// ═══════════════════════════════════════════════════════════
// REDIS MOCK — ioredis-mock replacement for tests
// Drop-in for src/infrastructure/redis.ts
// ═══════════════════════════════════════════════════════════

// @ts-ignore — ioredis-mock types
import RedisMock from 'ioredis-mock';

export const redis = new RedisMock();

// Re-export cache helper (same as real implementation)
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const value = await redis.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await redis.setex(key, ttlSeconds, serialized);
    } else {
      await redis.set(key, serialized);
    }
  },

  async del(key: string): Promise<void> {
    await redis.del(key);
  },

  async delPattern(pattern: string): Promise<void> {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  },
};

// Centralized Redis key generators — identical to real implementation
export const RedisKeys = {
  otp: (mobile: string, purpose: string) => `otp:${mobile}:${purpose}`,
  otpCooldown: (mobile: string) => `otp:cooldown:${mobile}`,
  userSession: (token: string) => `session:user:${token}`,
  workerSession: (token: string) => `session:worker:${token}`,
  staffSession: (token: string) => `session:staff:${token}`,
  workerLocation: (workerId: string) => `loc:worker:${workerId}`,
  onlineWorkers: (cityId: string) => `online:city:${cityId}`,
  serviceCategories: () => `cache:service_categories`,
  cityList: () => `cache:cities`,
  servicePricing: (serviceId: string, cityId: string) =>
    `cache:pricing:${serviceId}:${cityId}`,
  featureFlags: () => `cache:feature_flags`,
  surgeMultiplier: (cityId: string) => `cache:surge:${cityId}`,
  commissionRate: (workerId: string) => `cache:commission:${workerId}`,
  rateLimitOtp: (mobile: string) => `ratelimit:otp:${mobile}`,
} as const;

// Helper to flush mock Redis between tests
export async function flushTestRedis() {
  await redis.flushall();
}
