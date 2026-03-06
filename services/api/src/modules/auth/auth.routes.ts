import type { FastifyInstance } from 'fastify';
import {
  sendOtp,
  verifyOtp,
  refreshToken,
  logout,
  getMe,
} from './auth.controller';

// ──────────────────────────────────────────────────────────
// INPUT SCHEMAS — Validation
// ──────────────────────────────────────────────────────────

const sendOtpSchema = {
  schema: {
    tags: ['Auth'],
    summary: 'Send OTP to mobile',
    body: {
      type: 'object',
      required: ['mobile'],
      properties: {
        mobile: {
          type: 'string',
          pattern: '^[6-9][0-9]{9}$',
          description: '10 digit Indian mobile number',
        },
      },
    },
  },
};

const verifyOtpSchema = {
  schema: {
    tags: ['Auth'],
    summary: 'Verify OTP and get tokens',
    body: {
      type: 'object',
      required: ['mobile', 'otp', 'userType'],
      properties: {
        mobile: {
          type: 'string',
          pattern: '^[6-9][0-9]{9}$',
        },
        otp: {
          type: 'string',
          minLength: 6,
          maxLength: 6,
          pattern: '^[0-9]{6}$',
        },
        userType: {
          type: 'string',
          enum: ['user', 'worker'],
        },
        deviceId:  { type: 'string' },
        deviceOs:  { type: 'string', enum: ['android', 'ios', 'web'] },
        fcmToken:  { type: 'string' },
      },
    },
  },
};

const refreshSchema = {
  schema: {
    tags: ['Auth'],
    summary: 'Refresh access token',
    body: {
      type: 'object',
      properties: {
        refreshToken: { type: 'string' },
      },
    },
  },
};

const logoutSchema = {
  schema: {
    tags: ['Auth'],
    summary: 'Logout',
    body: {
      type: 'object',
      properties: {
        logoutAll:    { type: 'boolean' },
        refreshToken: { type: 'string' },
      },
    },
  },
};

// ──────────────────────────────────────────────────────────
// ERROR WRAPPER — Async errors catch karo
// ──────────────────────────────────────────────────────────

function wrap(fn: Function) {
  return async (request: any, reply: any) => {
    try {
      return await fn(request, reply);
    } catch (err: any) {
      if (err.statusCode) {
        return reply.status(err.statusCode).send({
          success: false,
          error: { code: err.code ?? 'ERROR', message: err.message },
        });
      }
      throw err; // Global error handler pe jaayega
    }
  };
}

// ──────────────────────────────────────────────────────────
// ROUTES
// ──────────────────────────────────────────────────────────

export async function authRoutes(server: FastifyInstance) {
  // POST /api/v1/auth/send-otp
  server.post('/send-otp', sendOtpSchema, wrap(sendOtp));

  // POST /api/v1/auth/verify-otp
  server.post('/verify-otp', verifyOtpSchema, wrap(verifyOtp));

  // POST /api/v1/auth/refresh
  server.post('/refresh', refreshSchema, wrap(refreshToken));

  // POST /api/v1/auth/logout
  server.post('/logout', logoutSchema, wrap(logout));

  // GET /api/v1/auth/me
  server.get('/me', { schema: { tags: ['Auth'] } }, wrap(getMe));
}
