import type { FastifyInstance } from 'fastify';
import {
  sendOtp, verifyOtp, refreshToken, logout, getMe,
} from './auth.controller';
import { staffAuthService } from './auth.service';
import { db } from '../../infrastructure/database';

function wrap(fn: Function) {
  return async (request: any, reply: any) => {
    try { return await fn(request, reply); }
    catch (err: any) {
      if (err.statusCode) return reply.status(err.statusCode).send({ success: false, error: { code: err.code ?? 'ERROR', message: err.message } });
      throw err;
    }
  };
}

export async function authRoutes(server: FastifyInstance) {

  // ─── USER / WORKER (OTP-based) ──────────────────────────

  server.post('/send-otp', {
    schema: { tags: ['Auth'], body: { type: 'object', required: ['mobile'], properties: { mobile: { type: 'string', pattern: '^[6-9][0-9]{9}$' } } } }
  }, wrap(sendOtp));

  server.post('/verify-otp', {
    schema: { tags: ['Auth'], body: { type: 'object', required: ['mobile', 'otp', 'userType'], properties: {
      mobile: { type: 'string', pattern: '^[6-9][0-9]{9}$' },
      otp: { type: 'string', minLength: 6, maxLength: 6 },
      userType: { type: 'string', enum: ['user', 'worker'] },
      deviceId: { type: 'string' }, deviceOs: { type: 'string' }, fcmToken: { type: 'string' },
    } } }
  }, wrap(verifyOtp));

  server.post('/refresh', {
    schema: { tags: ['Auth'], body: { type: 'object', properties: { refreshToken: { type: 'string' } } } }
  }, wrap(refreshToken));

  server.post('/logout', {
    schema: { tags: ['Auth'], body: { type: 'object', properties: { logoutAll: { type: 'boolean' }, refreshToken: { type: 'string' } } } }
  }, wrap(logout));

  server.get('/me', { schema: { tags: ['Auth'] } }, wrap(getMe));

  // ─── APP VERSION CHECK ──────────────────────────────────
  // GET /api/v1/auth/app-version?platform=android&version=1.2.3
  // Mobile app calls this on startup — check if update required
  server.get('/app-version', {
    schema: {
      tags: ['Auth'],
      querystring: {
        type: 'object',
        required: ['platform', 'version'],
        properties: {
          platform: { type: 'string', enum: ['android', 'ios'] },
          version:  { type: 'string' },
        },
      },
    },
  }, wrap(async (req: any, rep: any) => {
    const { platform, version } = req.query;

    const appVersion = await db.appVersion.findFirst({
      where:   { platform, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!appVersion) {
      return rep.send({
        success: true,
        data: {
          upToDate:     true,
          forceUpdate:  false,
          updateAvailable: false,
          currentVersion: version,
        },
      });
    }

    // Semantic version comparison
    const parseVer = (v: string) => v.split('.').map(Number);
    const [maj, min, pat]     = parseVer(version);
    const [cMaj, cMin, cPat]  = parseVer(appVersion.currentVersion);
    const [mMaj, mMin, mPat]  = parseVer(appVersion.minVersion);

    const clientVer = maj * 10000 + min * 100 + pat;
    const currVer   = cMaj * 10000 + cMin * 100 + cPat;
    const minVer    = mMaj * 10000 + mMin * 100 + mPat;

    const upToDate       = clientVer >= currVer;
    const updateAvailable = clientVer < currVer;
    const forceUpdate    = clientVer < minVer || appVersion.forceUpdate;

    return rep.send({
      success: true,
      data: {
        upToDate,
        updateAvailable,
        forceUpdate,
        currentVersion: appVersion.currentVersion,
        minVersion:     appVersion.minVersion,
        storeUrl:       appVersion.storeUrl,
        updateMessage:  appVersion.updateMessage ?? (
          forceUpdate
            ? 'Naya version available hai. Please update karein.'
            : 'Naya update available hai!'
        ),
        clientVersion:  version,
      },
    });
  }));

  // ─── STAFF (Email + Password) ────────────────────────────

  // POST /api/v1/auth/staff/login
  server.post('/staff/login', {
    schema: {
      tags: ['Auth - Staff'],
      body: { type: 'object', required: ['email', 'password'], properties: {
        email:    { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 6 },
      } },
    },
  }, wrap(async (req: any, rep: any) => {
    const { email, password } = req.body;
    const result = await staffAuthService.login(email, password, req.ip, req.headers['user-agent']);
    rep.setCookie('refreshToken', result.refreshToken, { httpOnly: true, secure: false, sameSite: 'strict', path: '/api/v1/auth' });
    return rep.send({ success: true, data: result });
  }));

  // POST /api/v1/auth/staff/refresh
  server.post('/staff/refresh', {
    schema: { tags: ['Auth - Staff'] },
  }, wrap(async (req: any, rep: any) => {
    const token = req.cookies?.refreshToken || (req.body as any)?.refreshToken;
    if (!token) return rep.status(401).send({ success: false, error: { code: 'NO_TOKEN' } });
    const result = await staffAuthService.refresh(token);
    rep.setCookie('refreshToken', result.refreshToken, { httpOnly: true, secure: false, sameSite: 'strict', path: '/api/v1/auth' });
    return rep.send({ success: true, data: result });
  }));

  // POST /api/v1/auth/staff/logout
  server.post('/staff/logout', wrap(async (req: any, rep: any) => {
    const token = req.cookies?.refreshToken || (req.body as any)?.refreshToken;
    if (token) await staffAuthService.logout(token);
    rep.clearCookie('refreshToken', { path: '/api/v1/auth' });
    return rep.send({ success: true, data: null });
  }));
}
