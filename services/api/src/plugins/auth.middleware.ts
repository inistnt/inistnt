import type { FastifyRequest, FastifyReply } from 'fastify';
import { tokenService, type UserType } from '../modules/auth/auth.service';
import { userRepo, workerRepo, staffRepo } from '../modules/auth/auth.repository';

// ──────────────────────────────────────────────────────────
// REQUEST AUGMENTATION
// Request object pe user info attach karo
// ──────────────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: {
      id: string;
      userType: UserType;
      mobile?: string;
      role?: string;
    };
  }
}

// ──────────────────────────────────────────────────────────
// EXTRACT TOKEN
// ──────────────────────────────────────────────────────────

function extractToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.replace('Bearer ', '').trim();
}

// ──────────────────────────────────────────────────────────
// AUTHENTICATE — Koi bhi logged in user
// ──────────────────────────────────────────────────────────

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const token = extractToken(request);

  if (!token) {
    return reply.status(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Login required.' },
    });
  }

  const payload = tokenService.verifyAccess(token);
  if (!payload) {
    return reply.status(401).send({
      success: false,
      error: { code: 'TOKEN_EXPIRED', message: 'Session expire ho gayi. Dobara login karein.' },
    });
  }

  request.currentUser = {
    id: payload.sub,
    userType: payload.userType,
    mobile: payload.mobile,
    role: payload.role,
  };
}

// ──────────────────────────────────────────────────────────
// REQUIRE USER — Sirf customers
// ──────────────────────────────────────────────────────────

export async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  await authenticate(request, reply);
  if (reply.sent) return;

  if (request.currentUser.userType !== 'user') {
    return reply.status(403).send({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Sirf customers ke liye.' },
    });
  }
}

// ──────────────────────────────────────────────────────────
// REQUIRE WORKER — Sirf workers
// ──────────────────────────────────────────────────────────

export async function requireWorker(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  await authenticate(request, reply);
  if (reply.sent) return;

  if (request.currentUser.userType !== 'worker') {
    return reply.status(403).send({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Sirf workers ke liye.' },
    });
  }
}

// ──────────────────────────────────────────────────────────
// REQUIRE STAFF — Sirf admin panel users
// ──────────────────────────────────────────────────────────

export async function requireStaff(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  await authenticate(request, reply);
  if (reply.sent) return;

  if (request.currentUser.userType !== 'staff') {
    return reply.status(403).send({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Staff only.' },
    });
  }
}

// ──────────────────────────────────────────────────────────
// REQUIRE ROLES — Specific staff roles
// Usage: requireRoles(['SUPER_ADMIN', 'CITY_MANAGER'])
// ──────────────────────────────────────────────────────────

export function requireRoles(allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireStaff(request, reply);
    if (reply.sent) return;

    if (!request.currentUser.role || !allowedRoles.includes(request.currentUser.role)) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Required roles: ${allowedRoles.join(', ')}`,
        },
      });
    }
  };
}

// ──────────────────────────────────────────────────────────
// OPTIONAL AUTH — Token ho toh attach karo, na ho toh chalega
// Public routes ke liye jo logged in users ko extra data de
// ──────────────────────────────────────────────────────────

export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
) {
  const token = extractToken(request);
  if (!token) return;

  const payload = tokenService.verifyAccess(token);
  if (!payload) return;

  request.currentUser = {
    id: payload.sub,
    userType: payload.userType,
    mobile: payload.mobile,
    role: payload.role,
  };
}
