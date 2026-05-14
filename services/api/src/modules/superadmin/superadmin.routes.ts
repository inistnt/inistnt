// ═══════════════════════════════════════════════════════════════════
// INISTNT — SuperAdmin Routes
// Prefix: /api/v1/superadmin
//
// AUTH FLOW (2-step):
//   POST /superadmin/auth/login         → Step 1: email+password → OTP sent
//   POST /superadmin/auth/verify-otp    → Step 2: OTP → JWT
//   POST /superadmin/auth/resend-otp    → Resend OTP
//   POST /superadmin/auth/logout        → Logout
//   POST /superadmin/auth/change-password
//   GET  /superadmin/auth/sessions      → Active sessions
//   POST /superadmin/auth/sessions/:id/revoke
//   POST /superadmin/auth/sessions/revoke-all
//   GET  /superadmin/auth/login-history
//
// STAFF MANAGEMENT (SuperAdmin only):
//   GET    /superadmin/staff            → List all staff
//   POST   /superadmin/staff            → Create staff with permissions
//   GET    /superadmin/staff/:id        → Staff detail + permissions
//   PATCH  /superadmin/staff/:id        → Update info
//   PATCH  /superadmin/staff/:id/permissions → Set permissions
//   PATCH  /superadmin/staff/:id/role        → Change role
//   POST   /superadmin/staff/:id/toggle-active → Enable/disable
//   POST   /superadmin/staff/:id/reset-password → Force reset
//   POST   /superadmin/staff/:id/revoke-sessions → Kick all sessions
//   GET    /superadmin/staff/:id/login-history
//
// PERMISSIONS:
//   GET /superadmin/permissions/roles   → All roles + default perms
//   GET /superadmin/permissions/all     → All available permissions
// ═══════════════════════════════════════════════════════════════════

import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { superAdminAuthService } from './superadmin-auth.service';
import { ROLE_PERMISSIONS, ALL_PERMISSIONS, getEffectivePermissions } from './permissions.config';
import { db }     from '../../infrastructure/database';
import { config } from '../../config';
import { requireRoles } from '../../plugins/auth.middleware';

function wrap(fn: Function) {
  return async (req: any, rep: any) => {
    try { return await fn(req, rep); }
    catch (err: any) {
      if (err.statusCode) return rep.status(err.statusCode).send({ success: false, error: { code: err.code ?? 'ERROR', message: err.message } });
      req.log.error(err);
      return rep.status(500).send({ success: false, error: { code: 'SERVER_ERROR', message: 'Kuch gadbad ho gayi.' } });
    }
  };
}

// ─── Middleware: Require SuperAdmin role ───────────────────────────
const requireSuperAdmin = requireRoles(['SUPER_ADMIN']);

export async function superAdminRoutes(server: FastifyInstance) {

  // ═══════════════════════════════════════════════════════════════
  // AUTH ROUTES — No JWT needed (2-step login)
  // ═══════════════════════════════════════════════════════════════

  // STEP 1: POST /superadmin/auth/login
  server.post('/auth/login', {
    schema: {
      body: {
        type: 'object', required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
        },
      },
    },
  }, wrap(async (req: any, rep: any) => {
    const { email, password } = req.body;
    const result = await superAdminAuthService.initiateLogin(email, password, req.ip, req.headers['user-agent']);
    return rep.send({ success: true, data: result });
  }));

  // STEP 2: POST /superadmin/auth/verify-otp
  server.post('/auth/verify-otp', {
    schema: {
      body: {
        type: 'object', required: ['email', 'otp'],
        properties: {
          email: { type: 'string', format: 'email' },
          otp:   { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' },
        },
      },
    },
  }, wrap(async (req: any, rep: any) => {
    const { email, otp } = req.body;
    const result = await superAdminAuthService.verifyOtp(email, otp, req.ip, req.headers['user-agent']);

    // HttpOnly cookie + body token (for Postman testing)
    rep.setCookie('sa_refresh', result.refreshToken, {
      httpOnly:  true,
      secure:    config.NODE_ENV === 'production',
      sameSite:  'strict',
      path:      '/api/v1/superadmin',
      maxAge:    7 * 24 * 60 * 60, // 7 days
    });

    return rep.send({ success: true, data: result });
  }));

  // POST /superadmin/auth/resend-otp
  server.post('/auth/resend-otp', {
    schema: {
      body: {
        type: 'object', required: ['email'],
        properties: { email: { type: 'string', format: 'email' } },
      },
    },
  }, wrap(async (req: any, rep: any) => {
    const result = await superAdminAuthService.resendOtp(req.body.email, req.ip);
    return rep.send({ success: true, data: result });
  }));

  // ═══════════════════════════════════════════════════════════════
  // PROTECTED ROUTES — JWT required from here
  // ═══════════════════════════════════════════════════════════════

  // POST /superadmin/auth/logout
  server.post('/auth/logout', { preHandler: [requireSuperAdmin] }, wrap(async (req: any, rep: any) => {
    const token = req.cookies?.sa_refresh || req.body?.refreshToken;
    if (token) {
      const session = await db.staffSession.findUnique({ where: { refreshToken: token } });
      if (session) await db.staffSession.update({ where: { id: session.id }, data: { isActive: false, revokedAt: new Date() } });
    }
    rep.clearCookie('sa_refresh', { path: '/api/v1/superadmin' });
    return rep.send({ success: true, data: { message: 'Logout ho gaye.' } });
  }));

  // POST /superadmin/auth/change-password
  server.post('/auth/change-password', {
    preHandler: [requireSuperAdmin],
    schema: {
      body: {
        type: 'object', required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string' },
          newPassword:     { type: 'string', minLength: 12 },
        },
      },
    },
  }, wrap(async (req: any, rep: any) => {
    const { currentPassword, newPassword } = req.body;
    const result = await superAdminAuthService.changePassword(req.currentUser.id, currentPassword, newPassword);
    return rep.send({ success: true, data: result });
  }));

  // GET /superadmin/auth/sessions — My active sessions
  server.get('/auth/sessions', { preHandler: [requireSuperAdmin] }, wrap(async (req: any, rep: any) => {
    const sessions = await superAdminAuthService.getSessions(req.currentUser.id);
    return rep.send({ success: true, data: sessions });
  }));

  // POST /superadmin/auth/sessions/:sessionId/revoke
  server.post('/auth/sessions/:sessionId/revoke', { preHandler: [requireSuperAdmin] }, wrap(async (req: any, rep: any) => {
    const result = await superAdminAuthService.revokeSession(req.params.sessionId, req.currentUser.id);
    return rep.send({ success: true, data: result });
  }));

  // POST /superadmin/auth/sessions/revoke-all
  server.post('/auth/sessions/revoke-all', { preHandler: [requireSuperAdmin] }, wrap(async (req: any, rep: any) => {
    const result = await superAdminAuthService.revokeAllSessions(req.currentUser.id);
    return rep.send({ success: true, data: result });
  }));

  // GET /superadmin/auth/login-history
  server.get('/auth/login-history', { preHandler: [requireSuperAdmin] }, wrap(async (req: any, rep: any) => {
    const { limit = 30 } = req.query as any;
    const history = await superAdminAuthService.getLoginHistory(req.currentUser.id, +limit);
    return rep.send({ success: true, data: history });
  }));

  // ═══════════════════════════════════════════════════════════════
  // STAFF MANAGEMENT — SUPER_ADMIN only
  // ═══════════════════════════════════════════════════════════════

  // GET /superadmin/staff — List all staff with their permissions
  server.get('/staff', { preHandler: [requireSuperAdmin] }, wrap(async (req: any, rep: any) => {
    const { role, isActive, page = 1, limit = 50 } = req.query as any;
    const where: any = {};
    if (role)     where.role     = role;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const [staff, total] = await Promise.all([
      db.staff.findMany({
        where,
        select: {
          id: true, name: true, email: true, mobile: true, role: true,
          isActive: true, cityId: true, stateId: true, areaId: true,
          permissions: true, lastLoginAt: true, lastLoginIp: true,
          loginCount: true, invitedById: true, createdAt: true,
          invitedBy: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip:    (+page - 1) * +limit,
        take:    +limit,
      }),
      db.staff.count({ where }),
    ]);

    // Attach effective permissions
    const enriched = staff.map(s => ({
      ...s,
      effectivePermissions: getEffectivePermissions(s.role, s.permissions as any),
    }));

    return rep.send({ success: true, data: enriched, meta: { total, page: +page, totalPages: Math.ceil(total / +limit) } });
  }));

  // GET /superadmin/staff/:id — Single staff detail
  server.get('/staff/:id', { preHandler: [requireSuperAdmin] }, wrap(async (req: any, rep: any) => {
    const staff = await db.staff.findUnique({
      where:  { id: req.params.id },
      select: {
        id: true, name: true, email: true, mobile: true, role: true,
        isActive: true, cityId: true, stateId: true, areaId: true,
        permissions: true, lastLoginAt: true, lastLoginIp: true,
        loginCount: true, failedLoginAttempts: true, lockedUntil: true,
        invitedById: true, createdAt: true, updatedAt: true,
        invitedBy:  { select: { name: true, email: true } },
        sessions:   { where: { isActive: true }, select: { id: true, ipAddress: true, userAgent: true, createdAt: true }, take: 5, orderBy: { createdAt: 'desc' } },
        loginLogs:  { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!staff) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Staff nahi mila.' } });

    return rep.send({ success: true, data: {
      ...staff,
      effectivePermissions: getEffectivePermissions(staff.role, staff.permissions as any),
    }});
  }));

  // POST /superadmin/staff — Create new staff
  server.post('/staff', {
    preHandler: [requireSuperAdmin],
    schema: {
      body: {
        type: 'object', required: ['name', 'email', 'password', 'role'],
        properties: {
          name:        { type: 'string', minLength: 2 },
          email:       { type: 'string', format: 'email' },
          mobile:      { type: 'string', pattern: '^[6-9][0-9]{9}$' },
          password:    { type: 'string', minLength: 12 },
          role:        { type: 'string', enum: ['STATE_MANAGER','CITY_MANAGER','AREA_MANAGER','FINANCE_ADMIN','SUPPORT_AGENT','FIELD_SUPERVISOR','QA_ANALYST','MARKETING_MANAGER','TECH_ADMIN'] },
          cityId:      { type: 'string' },
          stateId:     { type: 'string' },
          areaId:      { type: 'string' },
          permissions: { type: 'object' }, // Override map: {perm: true/false}
        },
      },
    },
  }, wrap(async (req: any, rep: any) => {
    const { name, email, mobile, password, role, cityId, stateId, areaId, permissions } = req.body;

    // Password strength check
    if (password.length < 12 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[!@#$%^&*]/.test(password)) {
      return rep.status(400).send({ success: false, error: { code: 'WEAK_PASSWORD', message: 'Password: 12+ chars, 1 uppercase, 1 number, 1 special char.' } });
    }

    const existing = await db.staff.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return rep.status(409).send({ success: false, error: { code: 'DUPLICATE_EMAIL', message: 'Yeh email pehle se registered hai.' } });

    const passwordHash = await bcrypt.hash(password, 12);
    const staff = await db.staff.create({
      data: {
        name, email: email.toLowerCase(), mobile, passwordHash,
        role, cityId, stateId, areaId,
        permissions: permissions ?? {},
        invitedById: req.currentUser.id,
        isActive: true,
      },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    });

    // Log in audit
    await db.auditLog.create({
      data: {
        staffId:      req.currentUser.id,
        action:       'STAFF_CREATED',
        resourceType: 'Staff',
        resourceId:   staff.id,
        newValues:    { name, email, role, permissions } as any,
      },
    }).catch(() => {});

    return rep.status(201).send({ success: true, data: {
      ...staff,
      message:              `Staff account banaya gaya. Login karein: ${email}`,
      effectivePermissions: getEffectivePermissions(role, permissions ?? {}),
    }});
  }));

  // PATCH /superadmin/staff/:id — Update basic info
  server.patch('/staff/:id', {
    preHandler: [requireSuperAdmin],
  }, wrap(async (req: any, rep: any) => {
    const { id } = req.params;
    const { name, mobile, cityId, stateId, areaId } = req.body as any;

    // Prevent editing own SuperAdmin (could lock self out)
    if (id === req.currentUser.id) {
      return rep.status(400).send({ success: false, error: { code: 'SELF_EDIT', message: 'Apni profile edit karne ke liye /auth/change-password use karo.' } });
    }

    const staff = await db.staff.update({
      where: { id },
      data:  { name, mobile, cityId, stateId, areaId },
      select: { id: true, name: true, email: true, role: true },
    });

    return rep.send({ success: true, data: staff });
  }));

  // PATCH /superadmin/staff/:id/permissions — Set granular permissions
  server.patch('/staff/:id/permissions', {
    preHandler: [requireSuperAdmin],
    schema: {
      body: {
        type: 'object', required: ['permissions'],
        properties: {
          permissions: {
            type: 'object',
            description: '{"view:users": true, "manage:users": false} — true=grant, false=revoke from role defaults',
          },
        },
      },
    },
  }, wrap(async (req: any, rep: any) => {
    const { id } = req.params;
    const { permissions } = req.body;

    const target = await db.staff.findUnique({ where: { id }, select: { role: true, name: true } });
    if (!target) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Staff nahi mila.' } });
    if (target.role === 'SUPER_ADMIN') {
      return rep.status(400).send({ success: false, error: { code: 'FORBIDDEN', message: 'SuperAdmin ki permissions change nahi ho sakti.' } });
    }

    // Validate permission keys
    const validKeys = new Set(ALL_PERMISSIONS.map(p => p.key));
    const invalidKeys = Object.keys(permissions).filter(k => !validKeys.has(k as any));
    if (invalidKeys.length > 0) {
      return rep.status(400).send({ success: false, error: { code: 'INVALID_PERMISSIONS', message: `Invalid permissions: ${invalidKeys.join(', ')}` } });
    }

    const staff = await db.staff.update({
      where: { id },
      data:  { permissions },
      select: { id: true, name: true, role: true, permissions: true },
    });

    // Audit log
    await db.auditLog.create({
      data: { staffId: req.currentUser.id, action: 'PERMISSIONS_UPDATED', resourceType: 'Staff', resourceId: id, newValues: { permissions } as any },
    }).catch(() => {});

    return rep.send({ success: true, data: {
      ...staff,
      effectivePermissions: getEffectivePermissions(staff.role, staff.permissions as any),
      message: `${target.name} ki permissions update ho gayi.`,
    }});
  }));

  // PATCH /superadmin/staff/:id/role — Change role
  server.patch('/staff/:id/role', {
    preHandler: [requireSuperAdmin],
    schema: {
      body: {
        type: 'object', required: ['role'],
        properties: {
          role: { type: 'string', enum: ['STATE_MANAGER','CITY_MANAGER','AREA_MANAGER','FINANCE_ADMIN','SUPPORT_AGENT','FIELD_SUPERVISOR','QA_ANALYST','MARKETING_MANAGER','TECH_ADMIN'] },
        },
      },
    },
  }, wrap(async (req: any, rep: any) => {
    const { id } = req.params;
    const { role } = req.body;

    const target = await db.staff.findUnique({ where: { id }, select: { role: true, name: true } });
    if (!target) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Staff nahi mila.' } });
    if (target.role === 'SUPER_ADMIN') return rep.status(400).send({ success: false, error: { code: 'FORBIDDEN', message: 'SuperAdmin ka role change nahi ho sakta.' } });

    const staff = await db.staff.update({
      where: { id },
      data:  { role },
      select: { id: true, name: true, email: true, role: true },
    });

    // Revoke sessions — force re-login with new permissions
    await db.staffSession.updateMany({ where: { staffId: id, isActive: true }, data: { isActive: false, revokedAt: new Date() } });

    await db.auditLog.create({
      data: { staffId: req.currentUser.id, action: 'ROLE_CHANGED', resourceType: 'Staff', resourceId: id, newValues: { oldRole: target.role, newRole: role } as any },
    }).catch(() => {});

    return rep.send({ success: true, data: { ...staff, message: `${target.name} ka role ${role} ho gaya. Unhe dobara login karna hoga.` } });
  }));

  // POST /superadmin/staff/:id/toggle-active — Enable/Disable
  server.post('/staff/:id/toggle-active', { preHandler: [requireSuperAdmin] }, wrap(async (req: any, rep: any) => {
    const { id } = req.params;
    if (id === req.currentUser.id) return rep.status(400).send({ success: false, error: { code: 'SELF_DISABLE', message: 'Apna account disable nahi kar sakte.' } });

    const target = await db.staff.findUnique({ where: { id }, select: { isActive: true, name: true, role: true } });
    if (!target) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Staff nahi mila.' } });
    if (target.role === 'SUPER_ADMIN') return rep.status(400).send({ success: false, error: { code: 'FORBIDDEN', message: 'SuperAdmin ko disable nahi kar sakte.' } });

    const newActive = !target.isActive;
    await db.staff.update({ where: { id }, data: { isActive: newActive } });

    if (!newActive) {
      // Disable all sessions immediately
      await db.staffSession.updateMany({ where: { staffId: id, isActive: true }, data: { isActive: false, revokedAt: new Date() } });
    }

    return rep.send({ success: true, data: { id, isActive: newActive, message: `${target.name} ka account ${newActive ? 'enable' : 'disable'} ho gaya.` } });
  }));

  // POST /superadmin/staff/:id/reset-password — Force reset
  server.post('/staff/:id/reset-password', {
    preHandler: [requireSuperAdmin],
    schema: {
      body: {
        type: 'object', required: ['newPassword'],
        properties: { newPassword: { type: 'string', minLength: 12 } },
      },
    },
  }, wrap(async (req: any, rep: any) => {
    const { id } = req.params;
    const { newPassword } = req.body;

    const target = await db.staff.findUnique({ where: { id }, select: { name: true, email: true, role: true } });
    if (!target) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Staff nahi mila.' } });

    if (newPassword.length < 12 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[!@#$%^&*]/.test(newPassword)) {
      return rep.status(400).send({ success: false, error: { code: 'WEAK_PASSWORD', message: 'Password: 12+ chars, 1 uppercase, 1 number, 1 special.' } });
    }

    await db.staff.update({
      where: { id },
      data:  { passwordHash: await bcrypt.hash(newPassword, 12), failedLoginAttempts: 0, lockedUntil: null },
    });

    // Kill all sessions
    await db.staffSession.updateMany({ where: { staffId: id, isActive: true }, data: { isActive: false, revokedAt: new Date() } });

    await db.auditLog.create({
      data: { staffId: req.currentUser.id, action: 'PASSWORD_RESET', resourceType: 'Staff', resourceId: id },
    }).catch(() => {});

    return rep.send({ success: true, data: { message: `${target.name} ka password reset ho gaya. Unhe dobara login karna hoga.` } });
  }));

  // POST /superadmin/staff/:id/revoke-sessions — Emergency kick
  server.post('/staff/:id/revoke-sessions', { preHandler: [requireSuperAdmin] }, wrap(async (req: any, rep: any) => {
    const result = await superAdminAuthService.revokeAllSessions(req.params.id);
    return rep.send({ success: true, data: result });
  }));

  // GET /superadmin/staff/:id/login-history
  server.get('/staff/:id/login-history', { preHandler: [requireSuperAdmin] }, wrap(async (req: any, rep: any) => {
    const history = await superAdminAuthService.getLoginHistory(req.params.id, 50);
    return rep.send({ success: true, data: history });
  }));

  // ═══════════════════════════════════════════════════════════════
  // PERMISSIONS INFO — For admin panel UI
  // ═══════════════════════════════════════════════════════════════

  // GET /superadmin/permissions/roles — All roles with their default permissions
  server.get('/permissions/roles', { preHandler: [requireSuperAdmin] }, wrap(async (_req: any, rep: any) => {
    const roles = Object.entries(ROLE_PERMISSIONS).map(([role, perms]) => ({ role, defaultPermissions: perms }));
    return rep.send({ success: true, data: roles });
  }));

  // GET /superadmin/permissions/all — All permissions for UI dropdown
  server.get('/permissions/all', { preHandler: [requireSuperAdmin] }, wrap(async (_req: any, rep: any) => {
    // Group by category
    const grouped = ALL_PERMISSIONS.reduce((acc, p) => {
      if (!acc[p.group]) acc[p.group] = [];
      acc[p.group].push({ key: p.key, label: p.label });
      return acc;
    }, {} as Record<string, { key: string; label: string }[]>);

    return rep.send({ success: true, data: { grouped, flat: ALL_PERMISSIONS } });
  }));
}
