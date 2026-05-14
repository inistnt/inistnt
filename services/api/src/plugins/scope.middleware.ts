// ═══════════════════════════════════════════════════════════════════
// INISTNT — Scope Middleware
//
// Kaam: Staff ke JWT ke baad unka geographic scope DB se fetch karo
//       aur request pe attach karo. Controllers isko use karte hain
//       taaki City Manager sirf apne city ka data dekhe.
//
// Flow:
//   requireStaff → injectScope → controller
//
// Scope rules:
//   SUPER_ADMIN       → no restriction (cityId = undefined)
//   STATE_MANAGER     → sirf apne state ki cities
//   CITY_MANAGER      → sirf apni city (cityId forced)
//   AREA_MANAGER      → sirf apna area (areaId + cityId forced)
//   FIELD_SUPERVISOR  → sirf apni city (cityId forced)
//   FINANCE_ADMIN     → all cities (no geo restriction, route-level only)
//   SUPPORT_AGENT     → all cities (no geo restriction)
//   MARKETING_MANAGER → all cities (no geo restriction)
//   QA_ANALYST        → all cities (no geo restriction)
//   TECH_ADMIN        → all cities (no geo restriction)
//
// Caching: Redis mein 30 min — har request pe DB hit nahi hoga
// ═══════════════════════════════════════════════════════════════════

import type { FastifyRequest, FastifyReply } from 'fastify';
import { db }    from '../infrastructure/database';
import { redis } from '../infrastructure/redis';

// ─── Roles jinka geo scope restricted hai ─────────────────────────
const CITY_SCOPED_ROLES  = ['CITY_MANAGER', 'FIELD_SUPERVISOR'] as const;
const AREA_SCOPED_ROLES  = ['AREA_MANAGER'] as const;
const STATE_SCOPED_ROLES = ['STATE_MANAGER'] as const;

export type ScopedRole =
  | typeof CITY_SCOPED_ROLES[number]
  | typeof AREA_SCOPED_ROLES[number]
  | typeof STATE_SCOPED_ROLES[number];

// Cache key
const scopeCacheKey = (staffId: string) => `scope:staff:${staffId}`;

interface StaffScope {
  cityId?:  string;
  areaId?:  string;
  stateId?: string;
  assignedCityIds: string[];
  role: string;
}

// ─── Fetch + cache scope ───────────────────────────────────────────
async function getStaffScope(staffId: string): Promise<StaffScope> {
  // Try Redis first
  const cached = await redis.get(scopeCacheKey(staffId));
  if (cached) return JSON.parse(cached) as StaffScope;

  // Fetch from DB
  const staff = await db.staff.findUnique({
    where:  { id: staffId },
    select: { role: true, cityId: true, areaId: true, stateId: true, assignedCityIds: true },
  });

  const scope: StaffScope = {
    role:            staff?.role ?? '',
    cityId:          staff?.cityId ?? undefined,
    areaId:          staff?.areaId ?? undefined,
    stateId:         staff?.stateId ?? undefined,
    assignedCityIds: staff?.assignedCityIds ?? [],
  };

  // Cache for 30 min
  await redis.set(scopeCacheKey(staffId), JSON.stringify(scope), 'EX', 1800);

  return scope;
}

// ─── Invalidate scope cache (call after staff update) ────────────
export async function invalidateScopeCache(staffId: string) {
  await redis.del(scopeCacheKey(staffId));
}

// ═══════════════════════════════════════════════════════════════════
// MAIN MIDDLEWARE — use as preHandler after requireStaff
// ═══════════════════════════════════════════════════════════════════

export async function injectScope(request: FastifyRequest, _reply: FastifyReply) {
  const user = request.currentUser;
  if (!user || user.userType !== 'staff') return;

  const scope = await getStaffScope(user.id);

  // Attach scope to currentUser
  (request.currentUser as any).cityId  = scope.cityId;
  (request.currentUser as any).areaId  = scope.areaId;
  (request.currentUser as any).stateId = scope.stateId;
  (request.currentUser as any).assignedCityIds = scope.assignedCityIds;
}

// ═══════════════════════════════════════════════════════════════════
// SCOPE HELPERS — Use in controllers
// ═══════════════════════════════════════════════════════════════════

/**
 * City filter for list queries.
 * City-scoped roles → their cityId forced (ignore query param)
 * National roles   → query param cityId used (can be undefined = all)
 */
export function getEffectiveCityId(req: FastifyRequest): string | undefined {
  const user = req.currentUser as any;
  const role = user?.role ?? '';

  if (CITY_SCOPED_ROLES.includes(role) || AREA_SCOPED_ROLES.includes(role)) {
    // These roles MUST be scoped — ignore query param
    return user.cityId ?? undefined;
  }

  if (STATE_SCOPED_ROLES.includes(role)) {
    // State managers can filter by city within their state
    // Query param cityId allowed, but validated elsewhere
    return (req.query as any)?.cityId;
  }

  // National roles (SUPER_ADMIN, FINANCE_ADMIN, etc.)
  return (req.query as any)?.cityId;
}

/**
 * Area filter — Area Managers see only their area
 */
export function getEffectiveAreaId(req: FastifyRequest): string | undefined {
  const user = req.currentUser as any;
  if (AREA_SCOPED_ROLES.includes(user?.role)) {
    return user.areaId ?? undefined;
  }
  return (req.query as any)?.areaId;
}

/**
 * State filter — State Managers see only their state
 */
export function getEffectiveStateId(req: FastifyRequest): string | undefined {
  const user = req.currentUser as any;
  if (STATE_SCOPED_ROLES.includes(user?.role)) {
    return user.stateId ?? undefined;
  }
  return (req.query as any)?.stateId;
}

/**
 * Cross-city check: kya yeh staff member is cityId ko access kar sakta hai?
 * Returns false agar city-scoped role hai aur cityId match nahi karta.
 */
export function canAccessCity(req: FastifyRequest, targetCityId: string): boolean {
  const user = req.currentUser as any;
  const role = user?.role ?? '';

  if (role === 'SUPER_ADMIN') return true;
  if (STATE_SCOPED_ROLES.includes(role)) return true; // TODO: validate against state
  if (CITY_SCOPED_ROLES.includes(role) || AREA_SCOPED_ROLES.includes(role)) {
    return user.cityId === targetCityId;
  }
  return true; // National roles
}

/**
 * Build Prisma cityId filter object based on scope
 */
export function cityFilter(req: FastifyRequest): { cityId?: string } | {} {
  const cityId = getEffectiveCityId(req);
  return cityId ? { cityId } : {};
}
