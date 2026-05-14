// ═══════════════════════════════════════════════════════════
// UNIT TESTS — staffAuthService (email + password login)
// ═══════════════════════════════════════════════════════════

jest.mock('../../../src/infrastructure/database', () => require('../../mocks/database.mock'));
jest.mock('../../../src/infrastructure/redis', () => require('../../mocks/redis.mock'));
jest.mock('../../../src/infrastructure/kafka', () => require('../../mocks/kafka.mock'));

import { staffAuthService } from '../../../src/modules/auth/auth.service';
import { db } from '../../mocks/database.mock';
import { makeStaff } from '../../fixtures';
import bcrypt from 'bcryptjs';

beforeEach(() => jest.clearAllMocks());

describe('staffAuthService.login', () => {
  const password = 'Secure@123';

  it('returns tokens for valid credentials', async () => {
    const hash = await bcrypt.hash(password, 12);
    const staff = makeStaff({ passwordHash: hash, isActive: true });

    (db.staff.findUnique as jest.Mock).mockResolvedValue(staff);
    (db.staffSession.create as jest.Mock).mockResolvedValue({ id: 'session-1' });

    const result = await staffAuthService.login(staff.email as string, password, '127.0.0.1');

    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect(result).toHaveProperty('expiresIn');
    expect(result.staff.id).toBe(staff.id);
  });

  it('throws 401 INVALID_CREDENTIALS when staff not found', async () => {
    (db.staff.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      staffAuthService.login('notexist@test.com', password),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('throws 403 ACCOUNT_DISABLED when isActive=false', async () => {
    const staff = makeStaff({ isActive: false });
    (db.staff.findUnique as jest.Mock).mockResolvedValue(staff);

    await expect(
      staffAuthService.login(staff.email as string, password),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'ACCOUNT_DISABLED',
    });
  });

  it('throws 401 INVALID_CREDENTIALS when passwordHash is null', async () => {
    const staff = makeStaff({ passwordHash: null, isActive: true });
    (db.staff.findUnique as jest.Mock).mockResolvedValue(staff);

    await expect(
      staffAuthService.login(staff.email as string, password),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('throws 401 INVALID_CREDENTIALS for wrong password', async () => {
    const hash = await bcrypt.hash(password, 12);
    const staff = makeStaff({ passwordHash: hash, isActive: true });
    (db.staff.findUnique as jest.Mock).mockResolvedValue(staff);

    await expect(
      staffAuthService.login(staff.email as string, 'WrongPass123'),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('creates a staff session with ipAddress and userAgent', async () => {
    const hash = await bcrypt.hash(password, 12);
    const staff = makeStaff({ passwordHash: hash, isActive: true });
    (db.staff.findUnique as jest.Mock).mockResolvedValue(staff);
    (db.staffSession.create as jest.Mock).mockResolvedValue({ id: 'session-2' });

    await staffAuthService.login(staff.email as string, password, '10.0.0.1', 'Mozilla/5.0');

    expect(db.staffSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          staffId: staff.id,
          ipAddress: '10.0.0.1',
          userAgent: 'Mozilla/5.0',
        }),
      }),
    );
  });
});

describe('staffAuthService.hashPassword', () => {
  it('produces a bcrypt hash that verifies correctly', async () => {
    const hash = await staffAuthService.hashPassword('TestPass@456');
    expect(hash).toMatch(/^\$2[ab]\$12\$/);
    const valid = await bcrypt.compare('TestPass@456', hash);
    expect(valid).toBe(true);
  });

  it('uses cost factor 12', async () => {
    const hash = await staffAuthService.hashPassword('anypassword');
    expect(hash.startsWith('$2b$12$')).toBe(true);
  });
});

describe('staffAuthService.logout', () => {
  it('revokes the staff session', async () => {
    (db.staffSession.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    await staffAuthService.logout('some-refresh-token');
    expect(db.staffSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { refreshToken: 'some-refresh-token' },
      }),
    );
  });
});
