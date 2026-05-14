// ═══════════════════════════════════════════════════════════
// UNIT TESTS — otpService (send & verify)
// All external deps (redis, db) are mocked
// ═══════════════════════════════════════════════════════════

jest.mock('../../../src/infrastructure/database', () => require('../../mocks/database.mock'));
jest.mock('../../../src/infrastructure/redis', () => require('../../mocks/redis.mock'));
jest.mock('../../../src/infrastructure/kafka', () => require('../../mocks/kafka.mock'));

import { otpService } from '../../../src/modules/auth/auth.service';
import { db } from '../../mocks/database.mock';
import { redis, flushTestRedis } from '../../mocks/redis.mock';
import { makeOtpRecord } from '../../fixtures';

beforeEach(async () => {
  await flushTestRedis();
  jest.clearAllMocks();
});

describe('otpService.send', () => {
  it('creates an OTP record and returns expiresIn when no cooldown', async () => {
    (db.otpStore.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (db.otpStore.create as jest.Mock).mockResolvedValue(makeOtpRecord('9876543210'));

    const result = await otpService.send('9876543210', 'login');

    expect(result).toHaveProperty('expiresIn');
    expect(result.expiresIn).toBe(300); // OTP_EXPIRY_SECONDS from test env
    expect(db.otpStore.create).toHaveBeenCalledTimes(1);
  });

  it('throws 429 OTP_COOLDOWN when mobile is on cooldown', async () => {
    // Set a cooldown key in mock Redis
    await redis.setex('test:otp:cooldown:9876543210', 55, '1');

    await expect(otpService.send('9876543210', 'login')).rejects.toMatchObject({
      statusCode: 429,
      code: 'OTP_COOLDOWN',
    });

    expect(db.otpStore.create).not.toHaveBeenCalled();
  });

  it('invalidates old OTP records before creating a new one', async () => {
    (db.otpStore.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (db.otpStore.create as jest.Mock).mockResolvedValue(makeOtpRecord('9999999999'));

    await otpService.send('9999999999', 'login');

    expect(db.otpStore.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ mobile: '9999999999', isUsed: false }),
      }),
    );
  });

  it('sets a cooldown key in Redis after sending', async () => {
    (db.otpStore.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (db.otpStore.create as jest.Mock).mockResolvedValue(makeOtpRecord('8888888888'));

    await otpService.send('8888888888', 'login');

    const cooldown = await redis.get('test:otp:cooldown:8888888888');
    expect(cooldown).toBe('1');
  });
});

describe('otpService.verify', () => {
  it('returns true for a correct OTP', async () => {
    const record = makeOtpRecord('9876543210', { otp: '123456' });
    (db.otpStore.findFirst as jest.Mock).mockResolvedValue(record);
    (db.otpStore.update as jest.Mock).mockResolvedValue({ ...record, isUsed: true });

    const result = await otpService.verify('9876543210', '123456', 'login');
    expect(result).toBe(true);
    expect(db.otpStore.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isUsed: true }),
      }),
    );
  });

  it('throws 400 OTP_INVALID when no valid record found', async () => {
    (db.otpStore.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(otpService.verify('9876543210', '111111', 'login')).rejects.toMatchObject({
      statusCode: 400,
      code: 'OTP_INVALID',
    });
  });

  it('throws 429 OTP_MAX_ATTEMPTS when attempts exceeded', async () => {
    const record = makeOtpRecord('9876543210', { attempts: 3 }); // at max
    (db.otpStore.findFirst as jest.Mock).mockResolvedValue(record);

    await expect(otpService.verify('9876543210', '123456', 'login')).rejects.toMatchObject({
      statusCode: 429,
      code: 'OTP_MAX_ATTEMPTS',
    });
  });

  it('throws 400 OTP_WRONG and increments attempts for wrong OTP', async () => {
    const record = makeOtpRecord('9876543210', { otp: '123456', attempts: 0 });
    (db.otpStore.findFirst as jest.Mock).mockResolvedValue(record);
    (db.otpStore.update as jest.Mock).mockResolvedValue({ ...record, attempts: 1 });

    await expect(otpService.verify('9876543210', '999999', 'login')).rejects.toMatchObject({
      statusCode: 400,
      code: 'OTP_WRONG',
    });

    expect(db.otpStore.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      }),
    );
  });

  it('includes remaining attempts in the error message', async () => {
    const record = makeOtpRecord('9876543210', { otp: '123456', attempts: 1 });
    (db.otpStore.findFirst as jest.Mock).mockResolvedValue(record);
    (db.otpStore.update as jest.Mock).mockResolvedValue(record);

    const error = await otpService.verify('9876543210', '000000', 'login').catch((e) => e);
    expect(error.message).toContain('1 attempts'); // 3 max - 1 used - 1 current = 1 remaining
  });
});
