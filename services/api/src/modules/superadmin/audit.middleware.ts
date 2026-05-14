// ═══════════════════════════════════════════════════════════════════
// INISTNT — Audit Log Middleware
//
// Automatically logs EVERY admin action to audit_logs table.
// FastifyPlugin ke roop mein use karo:
//
//   server.addHook('onSend', auditHook)
//
// Ya specific routes pe:
//   preHandler: [requireStaff, auditAction('USER_SUSPENDED')]
//
// AuditLog model mein yeh store hota hai:
//   staffId, action, resourceType, resourceId,
//   oldValues, newValues, ipAddress, userAgent
// ═══════════════════════════════════════════════════════════════════

import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../infrastructure/database';
import { logger } from '../../config/logger';

// ─── Route → action mapping ───────────────────────────────────────
// Pattern: [METHOD, path-contains, action-name]
const ROUTE_ACTION_MAP: [string, string, string][] = [
  // Staff
  ['POST',   '/superadmin/staff',              'STAFF_CREATED'],
  ['PATCH',  '/superadmin/staff',              'STAFF_UPDATED'],
  ['PATCH',  '/superadmin/staff',              'PERMISSIONS_UPDATED'],
  ['POST',   'toggle-active',                  'STAFF_TOGGLED'],
  ['POST',   'reset-password',                 'PASSWORD_RESET'],
  ['POST',   'revoke-sessions',                'SESSIONS_REVOKED'],
  // Users
  ['POST',   'users',                          'USER_UPDATED'],
  ['POST',   'suspend',                        'USER_SUSPENDED'],
  // Workers
  ['POST',   'verify',                         'WORKER_VERIFIED'],
  ['POST',   'suspend',                        'WORKER_SUSPENDED'],
  ['PATCH',  '/admin/workers',                 'WORKER_UPDATED'],
  // Bookings
  ['POST',   'refund',                         'REFUND_ISSUED'],
  // Disputes
  ['POST',   'resolve',                        'DISPUTE_RESOLVED'],
  // Payouts
  ['PATCH',  'payouts',                        'PAYOUT_UPDATED'],
  // Campaigns
  ['POST',   'campaigns',                      'CAMPAIGN_CREATED'],
  ['POST',   'approve',                        'CAMPAIGN_APPROVED'],
  ['POST',   'send',                           'CAMPAIGN_SENT'],
  // Commission
  ['POST',   'commission-rules',               'COMMISSION_RULE_CREATED'],
  // Surge
  ['POST',   'surge/activate',                 'SURGE_ACTIVATED'],
  ['POST',   'surge/deactivate',               'SURGE_DEACTIVATED'],
  // Feature flags
  ['PATCH',  'feature-flags',                  'FEATURE_FLAG_TOGGLED'],
  // Uniform
  ['POST',   'uniform-checks',                 'UNIFORM_CHECK_REVIEWED'],
  // SOS
  ['POST',   'sos',                            'SOS_RESOLVED'],
  // Documents
  ['POST',   'approve',                        'DOCUMENT_APPROVED'],
  ['POST',   'reject',                         'DOCUMENT_REJECTED'],
];

function inferAction(method: string, url: string): string | null {
  for (const [m, path, action] of ROUTE_ACTION_MAP) {
    if (method === m && url.includes(path)) return action;
  }
  return null;
}

function extractResourceId(url: string): string | null {
  // Extract ID from URL like /admin/users/clxyz123/suspend
  const parts = url.split('/').filter(Boolean);
  // Find known prefixes and take the next segment as ID
  const knownPrefixes = ['users','workers','bookings','disputes','staff','campaigns','payouts','sos','documents','uniform-checks'];
  for (let i = 0; i < parts.length - 1; i++) {
    if (knownPrefixes.includes(parts[i]) && parts[i+1] && !parts[i+1].includes('-') === false || parts[i+1]?.length > 10) {
      return parts[i+1];
    }
  }
  return null;
}

function extractResourceType(url: string): string {
  const map: Record<string, string> = {
    'users':           'User',
    'workers':         'Worker',
    'bookings':        'Booking',
    'disputes':        'Dispute',
    'staff':           'Staff',
    'campaigns':       'Campaign',
    'payouts':         'Payout',
    'sos':             'SosIncident',
    'documents':       'Document',
    'uniform-checks':  'UniformCheck',
    'feature-flags':   'FeatureFlag',
    'commission-rules':'CommissionRule',
    'coupons':         'Coupon',
    'banners':         'Banner',
  };
  for (const [key, type] of Object.entries(map)) {
    if (url.includes(`/${key}`)) return type;
  }
  return 'Unknown';
}

// ─── Manual audit log creator (use in controllers) ────────────────
export async function createAuditLog(opts: {
  staffId:      string;
  action:       string;
  resourceType: string;
  resourceId?:  string;
  oldValues?:   object;
  newValues?:   object;
  ipAddress?:   string;
  userAgent?:   string;
}) {
  try {
    await db.auditLog.create({
      data: {
        staffId:      opts.staffId,
        action:       opts.action,
        resourceType: opts.resourceType,
        resourceId:   opts.resourceId,
        oldValues:    opts.oldValues as any,
        newValues:    opts.newValues as any,
        ipAddress:    opts.ipAddress,
        userAgent:    opts.userAgent,
      },
    });
  } catch (err) {
    logger.warn({ err }, '[Audit] Failed to create audit log');
  }
}

// ─── Auto-hook: logs after successful admin responses ─────────────
export async function auditHook(
  request:  FastifyRequest,
  reply:    FastifyReply,
  payload:  unknown,
) {
  try {
    const user = (request as any).currentUser;
    if (!user || user.userType !== 'staff') return payload;

    // Only log mutating actions
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return payload;

    // Only log successful responses
    if (reply.statusCode >= 400) return payload;

    const action       = inferAction(request.method, request.url);
    if (!action) return payload;

    const resourceId   = extractResourceId(request.url) ?? (request.params as any)?.id;
    const resourceType = extractResourceType(request.url);

    await db.auditLog.create({
      data: {
        staffId:      user.id,
        action,
        resourceType,
        resourceId,
        newValues:    (request.body && typeof request.body === 'object') ? request.body as any : undefined,
        ipAddress:    request.ip,
        userAgent:    request.headers['user-agent'],
      },
    });
  } catch (err) {
    logger.warn({ err }, '[Audit] Hook failed');
  }
  return payload;
}

// ─── Decorator: explicit audit for specific routes ────────────────
export function auditAction(action: string, resourceType = 'Unknown') {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const user = (request as any).currentUser;
    if (!user) return;

    await createAuditLog({
      staffId:      user.id,
      action,
      resourceType,
      resourceId:   (request.params as any)?.id,
      newValues:    request.body as object,
      ipAddress:    request.ip,
      userAgent:    request.headers['user-agent'],
    });
  };
}
