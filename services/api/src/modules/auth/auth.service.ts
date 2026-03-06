import crypto from 'crypto';
import { config } from '../../config';
import { redis, RedisKeys } from '../../infrastructure/redis';
import { kafka, KafkaTopics } from '../../infrastructure/kafka';
import { otpRepo, userRepo, workerRepo, staffRepo } from './auth.repository';

// ──────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────

export type UserType = 'user' | 'worker' | 'staff';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  sub: string;          // user/worker/staff id
  userType: UserType;
  mobile?: string;
  role?: string;        // staff role
  iat: number;
  exp: number;
}

// ──────────────────────────────────────────────────────────
// JWT — Simple implementation (no external library needed)
// Production mein @fastify/jwt handle karega
// ──────────────────────────────────────────────────────────

function base64url(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function signJwt(payload: Record<string, unknown>, secret: string, expirySeconds: number): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64url(JSON.stringify({ ...payload, iat: now, exp: now + expirySeconds }));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyJwt(token: string, secret: string): JwtPayload | null {
  try {
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) return null;

    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${body}`)
      .digest('base64url');

    if (expectedSig !== signature) return null;

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as JwtPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

function parseExpiry(expiry: string): number {
  const unit = expiry.slice(-1);
  const value = parseInt(expiry.slice(0, -1));
  if (unit === 'm') return value * 60;
  if (unit === 'h') return value * 3600;
  if (unit === 'd') return value * 86400;
  return 900; // default 15 min
}

// ──────────────────────────────────────────────────────────
// OTP SERVICE
// ──────────────────────────────────────────────────────────

export const otpService = {
  send: async (mobile: string, purpose = 'login'): Promise<{ expiresIn: number }> => {
    // Rate limit check — ek minute mein ek hi OTP
    const cooldownKey = RedisKeys.otpCooldown(mobile);
    const onCooldown = await redis.get(cooldownKey);
    if (onCooldown) {
      const ttl = await redis.ttl(cooldownKey);
      throw { statusCode: 429, message: `${ttl} second baad dobara try karein.`, code: 'OTP_COOLDOWN' };
    }

    // OTP generate karo
    const otp = config.OTP_DEV_BYPASS || Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + config.OTP_EXPIRY_SECONDS * 1000);

    // Database mein save karo
    await otpRepo.create(mobile, otp, purpose, expiresAt);

    // Cooldown set karo
    await redis.setex(cooldownKey, config.OTP_RESEND_COOLDOWN_SECONDS, '1');

    // SMS bhejo (dev mein console pe print hoga)
    if (config.NODE_ENV === 'development') {
      console.log(`\n📱 OTP for ${mobile}: ${otp}\n`);
    } else {
      // Production mein Kafka event publish karo
      await kafka.publish(KafkaTopics.SMS_SEND, {
        mobile,
        message: `${otp} is your Inistnt OTP. Valid for ${config.OTP_EXPIRY_SECONDS / 60} minutes. Do not share with anyone.`,
        templateId: config.MSG91_TEMPLATE_ID_OTP,
      });
    }

    return { expiresIn: config.OTP_EXPIRY_SECONDS };
  },

  verify: async (mobile: string, otp: string, purpose = 'login'): Promise<boolean> => {
    const record = await otpRepo.findValid(mobile, purpose);

    if (!record) {
      throw { statusCode: 400, message: 'OTP expire ho gaya ya galat hai.', code: 'OTP_INVALID' };
    }

    if (record.attempts >= config.OTP_MAX_ATTEMPTS) {
      throw { statusCode: 429, message: 'Bahut zyada galat attempts. Naya OTP mangaein.', code: 'OTP_MAX_ATTEMPTS' };
    }

    if (record.otp !== otp) {
      await otpRepo.incrementAttempts(record.id);
      const remaining = config.OTP_MAX_ATTEMPTS - record.attempts - 1;
      throw { statusCode: 400, message: `Galat OTP. ${remaining} attempts baaki hain.`, code: 'OTP_WRONG' };
    }

    // OTP sahi hai — mark as used
    await otpRepo.markUsed(record.id);
    return true;
  },
};

// ──────────────────────────────────────────────────────────
// TOKEN SERVICE
// ──────────────────────────────────────────────────────────

export const tokenService = {
  generatePair: (sub: string, userType: UserType, extra?: Record<string, unknown>): TokenPair => {
    const payload = { sub, userType, ...extra };

    const accessToken = signJwt(payload, config.JWT_ACCESS_SECRET, parseExpiry(config.JWT_ACCESS_EXPIRY));
    const refreshToken = crypto.randomBytes(64).toString('hex'); // Opaque token (random)

    return { accessToken, refreshToken };
  },

  verifyAccess: (token: string): JwtPayload | null => {
    return verifyJwt(token, config.JWT_ACCESS_SECRET);
  },

  refreshExpiryDate: (): Date => {
    return new Date(Date.now() + parseExpiry(config.JWT_REFRESH_EXPIRY) * 1000);
  },
};

// ──────────────────────────────────────────────────────────
// AUTH SERVICE
// ──────────────────────────────────────────────────────────

export const authService = {

  // ─── OTP Send ─────────────────────────────────────────
  sendOtp: async (mobile: string) => {
    return otpService.send(mobile, 'login');
  },

  // ─── OTP Verify + Login / Register ────────────────────
  verifyOtp: async (
    mobile: string,
    otp: string,
    userType: 'user' | 'worker',
    deviceInfo?: { deviceId?: string; deviceOs?: string; fcmToken?: string },
    ipAddress?: string,
  ) => {
    // OTP verify karo
    await otpService.verify(mobile, otp, 'login');

    let entity: Awaited<ReturnType<typeof userRepo.findByMobile>> | Awaited<ReturnType<typeof workerRepo.findByMobile>>;
    let isNewUser = false;

    if (userType === 'user') {
      entity = await userRepo.findByMobile(mobile);
      if (!entity) {
        entity = await userRepo.create(mobile);
        isNewUser = true;

        // New user event
        await kafka.publish(KafkaTopics.USER_REGISTERED, {
          userId: entity.id,
          mobile,
        });
      }
      await userRepo.updateLastActive(entity.id);
    } else {
      entity = await workerRepo.findByMobile(mobile);
      if (!entity) {
        entity = await workerRepo.create(mobile);
        isNewUser = true;

        await kafka.publish(KafkaTopics.WORKER_REGISTERED, {
          workerId: entity.id,
          mobile,
        });
      }
      await workerRepo.updateLastActive(entity.id);
    }

    // Tokens generate karo
    const { accessToken, refreshToken } = tokenService.generatePair(
      entity.id,
      userType,
      { mobile }
    );

    const expiresAt = tokenService.refreshExpiryDate();

    // Session save karo
    if (userType === 'user') {
      await userRepo.createSession({
        userId: entity.id,
        refreshToken,
        expiresAt,
        ...deviceInfo,
        ipAddress,
      });
    } else {
      await workerRepo.createSession({
        workerId: entity.id,
        refreshToken,
        expiresAt,
        ...deviceInfo,
        ipAddress,
      });
    }

    return {
      accessToken,
      refreshToken,
      expiresIn: parseExpiry(config.JWT_ACCESS_EXPIRY),
      isNewUser,
      [userType]: entity,
    };
  },

  // ─── Token Refresh ─────────────────────────────────────
  refresh: async (refreshToken: string) => {
    // User session check karo
    const userSession = await userRepo.findSession(refreshToken);
    if (userSession && userSession.isActive) {
      const { accessToken, refreshToken: newRefreshToken } = tokenService.generatePair(
        userSession.userId,
        'user',
        { mobile: userSession.user.mobile }
      );

      // Rotate refresh token
      await userRepo.revokeSession(refreshToken);
      await userRepo.createSession({
        userId: userSession.userId,
        refreshToken: newRefreshToken,
        expiresAt: tokenService.refreshExpiryDate(),
        deviceId: userSession.deviceId ?? undefined,
        deviceOs: userSession.deviceOs ?? undefined,
      });

      return { accessToken, refreshToken: newRefreshToken };
    }

    // Worker session check karo
    const workerSession = await workerRepo.findSession(refreshToken);
    if (workerSession && workerSession.isActive) {
      const { accessToken, refreshToken: newRefreshToken } = tokenService.generatePair(
        workerSession.workerId,
        'worker',
        { mobile: workerSession.worker.mobile }
      );

      await workerRepo.revokeSession(refreshToken);
      await workerRepo.createSession({
        workerId: workerSession.workerId,
        refreshToken: newRefreshToken,
        expiresAt: tokenService.refreshExpiryDate(),
        deviceId: workerSession.deviceId ?? undefined,
        deviceOs: workerSession.deviceOs ?? undefined,
      });

      return { accessToken, refreshToken: newRefreshToken };
    }

    throw { statusCode: 401, message: 'Session expire ho gayi. Dobara login karein.', code: 'SESSION_EXPIRED' };
  },

  // ─── Logout ────────────────────────────────────────────
  logout: async (refreshToken: string, logoutAll = false, userId?: string, userType?: UserType) => {
    if (userType === 'user' && userId) {
      if (logoutAll) {
        await userRepo.revokeAllSessions(userId);
      } else {
        await userRepo.revokeSession(refreshToken);
      }
    } else if (userType === 'worker' && userId) {
      if (logoutAll) {
        await workerRepo.revokeAllSessions(userId);
      } else {
        await workerRepo.revokeSession(refreshToken);
      }
    }
  },
};

// ──────────────────────────────────────────────────────────
// STAFF AUTH SERVICE
// Admin panel ke liye email + password login
// ──────────────────────────────────────────────────────────

import bcrypt from 'bcryptjs';

export const staffAuthService = {

  login: async (email: string, password: string, ipAddress?: string, userAgent?: string) => {
    const staff = await staffRepo.findByEmail(email);
    if (!staff) throw { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Email ya password galat hai.' };
    if (!staff.isActive) throw { statusCode: 403, code: 'ACCOUNT_DISABLED', message: 'Account disabled hai. Admin se contact karo.' };

    const valid = await bcrypt.compare(password, staff.passwordHash);
    if (!valid) throw { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Email ya password galat hai.' };

    const { accessToken, refreshToken } = tokenService.generatePair(staff.id, 'staff', { role: staff.role });
    const expiresAt = tokenService.refreshExpiryDate();

    await staffRepo.createSession({ staffId: staff.id, refreshToken, ipAddress, userAgent, expiresAt });

    return { accessToken, refreshToken, expiresIn: parseExpiry(config.JWT_ACCESS_EXPIRY), staff };
  },

  refresh: async (refreshToken: string) => {
    const session = await staffRepo.findSession(refreshToken);
    if (!session || !session.isActive) throw { statusCode: 401, code: 'SESSION_EXPIRED', message: 'Session expire ho gayi.' };

    const { accessToken, refreshToken: newToken } = tokenService.generatePair(session.staffId, 'staff', { role: session.staff.role });
    await staffRepo.revokeSession(refreshToken);
    await staffRepo.createSession({ staffId: session.staffId, refreshToken: newToken, expiresAt: tokenService.refreshExpiryDate() });

    return { accessToken, refreshToken: newToken };
  },

  logout: async (refreshToken: string) => {
    await staffRepo.revokeSession(refreshToken);
  },

  hashPassword: async (password: string) => bcrypt.hash(password, 12),
};
