// ═══════════════════════════════════════════════════════════
// UNIT TESTS — Config helpers & RedisKeys
// ═══════════════════════════════════════════════════════════

import { cache, flushTestRedis, redis, RedisKeys } from '../../mocks/redis.mock';

describe('Config helpers', () => {

  // Test the `required()` function logic inline
  function required(key: string): string {
    const value = process.env[key];
    if (!value) throw new Error(`Missing required env variable: ${key}`);
    return value;
  }

  function optional(key: string, fallback = ''): string {
    return process.env[key] ?? fallback;
  }

  function optionalInt(key: string, fallback: number): number {
    const value = process.env[key];
    return value ? parseInt(value, 10) : fallback;
  }

  describe('required()', () => {
    it('returns the value when env var is set', () => {
      process.env.TEST_REQUIRED_VAR = 'hello';
      expect(required('TEST_REQUIRED_VAR')).toBe('hello');
      delete process.env.TEST_REQUIRED_VAR;
    });

    it('throws when env var is not set', () => {
      delete process.env.TEST_MISSING_VAR;
      expect(() => required('TEST_MISSING_VAR')).toThrow('Missing required env variable: TEST_MISSING_VAR');
    });

    it('throws when env var is an empty string', () => {
      process.env.TEST_EMPTY_VAR = '';
      expect(() => required('TEST_EMPTY_VAR')).toThrow();
      delete process.env.TEST_EMPTY_VAR;
    });
  });

  describe('optional()', () => {
    it('returns env var value when set', () => {
      process.env.MY_OPT = 'value123';
      expect(optional('MY_OPT')).toBe('value123');
      delete process.env.MY_OPT;
    });

    it('returns fallback when env var is not set', () => {
      delete process.env.NOT_SET;
      expect(optional('NOT_SET', 'default_val')).toBe('default_val');
    });

    it('returns empty string as fallback by default', () => {
      delete process.env.NOT_SET_2;
      expect(optional('NOT_SET_2')).toBe('');
    });
  });

  describe('optionalInt()', () => {
    it('parses integer from env var', () => {
      process.env.INT_VAR = '4000';
      expect(optionalInt('INT_VAR', 0)).toBe(4000);
      delete process.env.INT_VAR;
    });

    it('returns fallback when env var is not set', () => {
      delete process.env.INT_MISSING;
      expect(optionalInt('INT_MISSING', 42)).toBe(42);
    });

    it('parses integer correctly ignoring trailing chars', () => {
      process.env.INT_FLOAT = '3.14';
      expect(optionalInt('INT_FLOAT', 0)).toBe(3);
      delete process.env.INT_FLOAT;
    });
  });
});

// ─── REDIS KEYS ────────────────────────────────────────────

describe('RedisKeys', () => {
  it('otp() generates correct key', () => {
    expect(RedisKeys.otp('9876543210', 'login')).toBe('otp:9876543210:login');
  });

  it('otpCooldown() generates correct key', () => {
    expect(RedisKeys.otpCooldown('9876543210')).toBe('otp:cooldown:9876543210');
  });

  it('userSession() generates correct key', () => {
    expect(RedisKeys.userSession('abc123')).toBe('session:user:abc123');
  });

  it('workerSession() generates correct key', () => {
    expect(RedisKeys.workerSession('tok789')).toBe('session:worker:tok789');
  });

  it('staffSession() generates correct key', () => {
    expect(RedisKeys.staffSession('staff-tok')).toBe('session:staff:staff-tok');
  });

  it('workerLocation() generates correct key', () => {
    expect(RedisKeys.workerLocation('worker-1')).toBe('loc:worker:worker-1');
  });

  it('onlineWorkers() generates correct key', () => {
    expect(RedisKeys.onlineWorkers('city-mumbai')).toBe('online:city:city-mumbai');
  });

  it('servicePricing() generates correct key', () => {
    expect(RedisKeys.servicePricing('svc-1', 'city-1')).toBe('cache:pricing:svc-1:city-1');
  });

  it('surgeMultiplier() generates correct key', () => {
    expect(RedisKeys.surgeMultiplier('city-blr')).toBe('cache:surge:city-blr');
  });

  it('rateLimitOtp() generates correct key', () => {
    expect(RedisKeys.rateLimitOtp('9999999999')).toBe('ratelimit:otp:9999999999');
  });
});

// ─── CACHE HELPER ──────────────────────────────────────────

describe('cache helper', () => {
  beforeEach(async () => {
    await flushTestRedis();
  });

  it('set and get a value', async () => {
    await cache.set('test-key', { foo: 'bar' });
    const result = await cache.get<{ foo: string }>('test-key');
    expect(result).toEqual({ foo: 'bar' });
  });

  it('returns null for a missing key', async () => {
    const result = await cache.get('nonexistent-key');
    expect(result).toBeNull();
  });

  it('set with TTL stores the value', async () => {
    await cache.set('ttl-key', { data: 123 }, 60);
    const result = await cache.get<{ data: number }>('ttl-key');
    expect(result?.data).toBe(123);
  });

  it('del removes the key', async () => {
    await cache.set('delete-me', 'value');
    await cache.del('delete-me');
    const result = await cache.get('delete-me');
    expect(result).toBeNull();
  });

  it('handles invalid JSON gracefully (returns null)', async () => {
    await redis.set('bad-json-key', 'not-valid-json{{{');
    const result = await cache.get('bad-json-key');
    expect(result).toBeNull();
  });
});
