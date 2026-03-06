import IORedis from 'ioredis';
import { config } from '../config';

export const redis = new IORedis(config.REDIS_URL, {
  keyPrefix: config.REDIS_PREFIX,
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
  lazyConnect: true,
});

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => console.error('❌ Redis error:', err));

// Helper: cache get/set with JSON
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

// Redis keys — centralized to avoid typos
export const RedisKeys = {
  // OTP
  otp: (mobile: string, purpose: string) => `otp:${mobile}:${purpose}`,
  otpCooldown: (mobile: string) => `otp:cooldown:${mobile}`,

  // Sessions
  userSession: (token: string) => `session:user:${token}`,
  workerSession: (token: string) => `session:worker:${token}`,
  staffSession: (token: string) => `session:staff:${token}`,

  // Worker location (location-service se aayega)
  workerLocation: (workerId: string) => `loc:worker:${workerId}`,
  onlineWorkers: (cityId: string) => `online:city:${cityId}`,

  // Cache
  serviceCategories: () => `cache:service_categories`,
  cityList: () => `cache:cities`,
  servicePricing: (serviceId: string, cityId: string) =>
    `cache:pricing:${serviceId}:${cityId}`,
  featureFlags: () => `cache:feature_flags`,
  surgeMultiplier: (cityId: string) => `cache:surge:${cityId}`,
  commissionRate: (workerId: string) => `cache:commission:${workerId}`,

  // Rate limiting
  rateLimitOtp: (mobile: string) => `ratelimit:otp:${mobile}`,
} as const;