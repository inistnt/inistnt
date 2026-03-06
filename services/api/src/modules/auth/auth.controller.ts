import type { FastifyRequest, FastifyReply } from 'fastify';
import { authService, tokenService } from './auth.service';
import { config } from '../../config';

// Cookie settings — HttpOnly, Secure in production
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
  maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
};

// ──────────────────────────────────────────────────────────
// SEND OTP
// POST /api/v1/auth/send-otp
// ──────────────────────────────────────────────────────────

export async function sendOtp(request: FastifyRequest, reply: FastifyReply) {
  const { mobile } = request.body as { mobile: string };

  const result = await authService.sendOtp(mobile);

  return reply.send({
    success: true,
    data: {
      mobile,
      expiresIn: result.expiresIn,
      message: config.NODE_ENV === 'development'
        ? 'OTP console mein print hua hai (dev mode)'
        : 'OTP aapke mobile pe bheja gaya hai.',
    },
  });
}

// ──────────────────────────────────────────────────────────
// VERIFY OTP
// POST /api/v1/auth/verify-otp
// ──────────────────────────────────────────────────────────

export async function verifyOtp(request: FastifyRequest, reply: FastifyReply) {
  const {
    mobile,
    otp,
    userType,
    deviceId,
    deviceOs,
    fcmToken,
  } = request.body as {
    mobile: string;
    otp: string;
    userType: 'user' | 'worker';
    deviceId?: string;
    deviceOs?: string;
    fcmToken?: string;
  };

  const ipAddress = request.ip;

  const result = await authService.verifyOtp(
    mobile,
    otp,
    userType,
    { deviceId, deviceOs, fcmToken },
    ipAddress,
  );

  // Web ke liye: Refresh token HttpOnly cookie mein
  // React Native ke liye: Response body mein bhi bhejo
  reply.setCookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTS);

  return reply.send({
    success: true,
    data: {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken, // RN ke liye
      expiresIn: result.expiresIn,
      isNewUser: result.isNewUser,
      userType,
      [userType]: result[userType],
    },
  });
}

// ──────────────────────────────────────────────────────────
// REFRESH TOKEN
// POST /api/v1/auth/refresh
// ──────────────────────────────────────────────────────────

export async function refreshToken(request: FastifyRequest, reply: FastifyReply) {
  // Web: Cookie se lo | React Native: Body se lo
  const tokenFromCookie = request.cookies?.refreshToken;
  const { refreshToken: tokenFromBody } = (request.body as { refreshToken?: string }) ?? {};
  const refreshToken = tokenFromCookie || tokenFromBody;

  if (!refreshToken) {
    return reply.status(401).send({
      success: false,
      error: { code: 'NO_REFRESH_TOKEN', message: 'Session expire ho gayi.' },
    });
  }

  const result = await authService.refresh(refreshToken);

  // New cookie set karo
  reply.setCookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTS);

  return reply.send({
    success: true,
    data: {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    },
  });
}

// ──────────────────────────────────────────────────────────
// LOGOUT
// POST /api/v1/auth/logout
// ──────────────────────────────────────────────────────────

export async function logout(request: FastifyRequest, reply: FastifyReply) {
  const { logoutAll = false } = (request.body as { logoutAll?: boolean }) ?? {};

  const tokenFromCookie = request.cookies?.refreshToken;
  const { refreshToken: tokenFromBody } = (request.body as { refreshToken?: string }) ?? {};
  const refreshToken = tokenFromCookie || tokenFromBody || '';

  // JWT se user info nikalo
  const authHeader = request.headers.authorization;
  const accessToken = authHeader?.replace('Bearer ', '');
  const payload = accessToken ? tokenService.verifyAccess(accessToken) : null;

  await authService.logout(
    refreshToken,
    logoutAll,
    payload?.sub,
    payload?.userType,
  );

  // Cookie clear karo
  reply.clearCookie('refreshToken', { path: '/api/v1/auth' });

  return reply.send({
    success: true,
    data: { message: 'Logout successful.' },
  });
}

// ──────────────────────────────────────────────────────────
// GET ME — Current user info from JWT
// GET /api/v1/auth/me
// ──────────────────────────────────────────────────────────

export async function getMe(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return reply.status(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Token required.' },
    });
  }

  const payload = tokenService.verifyAccess(token);
  if (!payload) {
    return reply.status(401).send({
      success: false,
      error: { code: 'TOKEN_INVALID', message: 'Token invalid ya expire ho gaya.' },
    });
  }

  return reply.send({
    success: true,
    data: {
      id: payload.sub,
      userType: payload.userType,
      mobile: payload.mobile,
      role: payload.role,
    },
  });
}
