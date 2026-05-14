// ═══════════════════════════════════════════════════════════════════
// INISTNT — Search Routes
//
// GET /api/v1/search/services?q=plumber&cityId=...&page=1
// GET /api/v1/search/workers?q=AC&cityId=...&near=lat,lng&radius=5
// GET /api/v1/search/autocomplete?q=plu&type=service
// POST /api/v1/admin/search/reindex?type=services|workers
// GET  /api/v1/admin/search/health
// ═══════════════════════════════════════════════════════════════════

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireStaff, requirePermission } from '../../plugins/auth.middleware';
import { getEsClient, INDICES, fullReindex, ensureIndices } from '../../infrastructure/elasticsearch';
import { db }     from '../../infrastructure/database';
import { logger } from '../../config/logger';

function wrap(fn: Function) {
  return async (req: any, rep: any) => {
    try { return await fn(req, rep); }
    catch (err: any) {
      // ES might not be available — fall back to Postgres
      if (err.message?.includes('ECONNREFUSED') || err.name === 'ConnectionError') {
        req.log?.warn('[Search] Elasticsearch unavailable — using Postgres fallback');
        return null; // Signal to caller to use fallback
      }
      if (err.statusCode) return rep.status(err.statusCode).send({ success: false, error: { code: err.code ?? 'ERROR', message: err.message } });
      req.log?.error(err);
      return rep.status(500).send({ success: false, error: { code: 'SERVER_ERROR', message: 'Kuch gadbad ho gayi.' } });
    }
  };
}

// ─── SERVICE SEARCH ───────────────────────────────────────────────
async function searchServices(req: FastifyRequest, rep: FastifyReply) {
  const q      = req.query as any;
  const query  = q.q?.trim();
  const cityId = q.cityId;
  const page   = parseInt(q.page ?? '1');
  const limit  = Math.min(parseInt(q.limit ?? '20'), 50);
  const from   = (page - 1) * limit;

  // Try Elasticsearch first
  try {
    const client = getEsClient();
    const esQuery: any = {
      bool: {
        must: query
          ? [{
              multi_match: {
                query,
                fields: ['nameEn^3', 'nameHi^2', 'descriptionEn', 'categoryName', 'tags'],
                type:   'best_fields',
                fuzziness: 'AUTO',
              },
            }]
          : [{ match_all: {} }],
        filter: [
          { term: { isActive: true } },
        ],
      },
    };

    const result = await client.search({
      index: INDICES.SERVICES,
      body:  {
        query:   esQuery,
        sort:    query ? ['_score', { bookingCount: { order: 'desc' } }] : [{ bookingCount: { order: 'desc' } }, { rating: { order: 'desc' } }],
        from,
        size:    limit,
        _source: ['id', 'nameEn', 'nameHi', 'categoryName', 'basePricePaise', 'rating', 'bookingCount'],
      },
    });

    const hits  = (result as any).hits;
    const items = hits.hits.map((h: any) => ({ ...h._source, score: h._score }));

    return rep.send({
      success: true,
      data:    items,
      total:   typeof hits.total === 'object' ? hits.total.value : hits.total,
      page,
      source:  'elasticsearch',
    });

  } catch (esErr) {
    logger.warn({ err: (esErr as any).message }, '[Search] ES unavailable, fallback to Postgres');

    // Postgres fallback
    const where: any = { isActive: true };
    if (query) where.OR = [
      { nameEn: { contains: query, mode: 'insensitive' } },
      { nameHi: { contains: query } },
      { descriptionEn: { contains: query, mode: 'insensitive' } },
    ];

    const [items, total] = await Promise.all([
      db.service.findMany({ where, skip: from, take: limit, orderBy: [{ totalBookings: 'desc' }] }),
      db.service.count({ where }),
    ]);

    return rep.send({ success: true, data: items, total, page, source: 'postgres_fallback' });
  }
}

// ─── WORKER SEARCH ────────────────────────────────────────────────
async function searchWorkers(req: FastifyRequest, rep: FastifyReply) {
  const q      = req.query as any;
  const query  = q.q?.trim();
  const cityId = q.cityId;
  const near   = q.near; // "lat,lng"
  const radius = parseFloat(q.radius ?? '10'); // km
  const page   = parseInt(q.page ?? '1');
  const limit  = Math.min(parseInt(q.limit ?? '20'), 50);
  const from   = (page - 1) * limit;

  try {
    const client = getEsClient();
    const mustClauses: any[] = [];
    const filterClauses: any[] = [{ term: { status: 'VERIFIED' } }];

    if (query) {
      mustClauses.push({
        multi_match: {
          query,
          fields:    ['name^2', 'cityName', 'skills'],
          fuzziness: 'AUTO',
        },
      });
    } else {
      mustClauses.push({ match_all: {} });
    }

    if (cityId) filterClauses.push({ term: { cityId } });
    if (q.tier)     filterClauses.push({ term: { tier: q.tier } });
    if (q.isOnline) filterClauses.push({ term: { isOnline: true } });
    if (q.serviceId) filterClauses.push({ term: { skills: q.serviceId } });

    const esQuery: any = { bool: { must: mustClauses, filter: filterClauses } };

    // Geo filter
    if (near) {
      const [lat, lng] = near.split(',').map(Number);
      filterClauses.push({
        geo_distance: {
          distance: `${radius}km`,
          location: { lat, lon: lng },
        },
      });
    }

    const sort: any[] = near
      ? [{ _geo_distance: { location: { lat: Number(near.split(',')[0]), lon: Number(near.split(',')[1]) }, order: 'asc', unit: 'km' } }, { rating: { order: 'desc' } }]
      : [{ rating: { order: 'desc' } }, { totalJobs: { order: 'desc' } }];

    const result = await client.search({
      index: INDICES.WORKERS,
      body:  { query: esQuery, sort, from, size: limit, _source: true },
    });

    const hits  = (result as any).hits;
    const items = hits.hits.map((h: any) => ({
      ...h._source,
      distance: h.sort?.[0] != null && near ? `${Number(h.sort[0]).toFixed(1)} km` : undefined,
      score: h._score,
    }));

    return rep.send({
      success: true,
      data:    items,
      total:   typeof hits.total === 'object' ? hits.total.value : hits.total,
      page,
      source:  'elasticsearch',
    });

  } catch {
    // Postgres fallback
    const where: any = { status: 'VERIFIED' };
    if (cityId) where.cityId = cityId;
    if (q.tier) where.tier   = q.tier;
    if (query)  where.name   = { contains: query, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      db.worker.findMany({
        where, skip: from, take: limit,
        orderBy: [{ rating: 'desc' }, { totalJobs: 'desc' }],
        select:  { id: true, name: true, mobile: true, rating: true, tier: true, totalJobs: true, isOnline: true, cityId: true },
      }),
      db.worker.count({ where }),
    ]);

    return rep.send({ success: true, data: items, total, page, source: 'postgres_fallback' });
  }
}

// ─── AUTOCOMPLETE ─────────────────────────────────────────────────
async function autocomplete(req: FastifyRequest, rep: FastifyReply) {
  const q    = req.query as any;
  const text = q.q?.trim();
  const type = q.type ?? 'service'; // 'service' | 'worker'

  if (!text || text.length < 2) {
    return rep.send({ success: true, data: [] });
  }

  try {
    const client = getEsClient();
    const index  = type === 'worker' ? INDICES.WORKERS : INDICES.SERVICES;

    const result = await client.search({
      index,
      body: {
        suggest: {
          suggestions: {
            prefix:     text,
            completion: {
              field: 'nameEn.suggest',
              size:  8,
              skip_duplicates: true,
            },
          },
        },
        _source: ['id', 'nameEn', 'nameHi', 'categoryName', 'basePricePaise'],
        size:    0,
      },
    });

    const suggestions = (result as any).suggest?.suggestions?.[0]?.options ?? [];
    const data        = suggestions.map((s: any) => ({
      id:          s._source?.id,
      text:        s._source?.nameEn,
      textHi:      s._source?.nameHi,
      category:    s._source?.categoryName,
      price:       s._source?.basePricePaise,
      score:       s._score,
    }));

    return rep.send({ success: true, data });

  } catch {
    // Postgres fallback — simple prefix search
    const where: any = { isActive: true, nameEn: { startsWith: text, mode: 'insensitive' } };
    const items = await db.service.findMany({
      where,
      take: 8,
      select: { id: true, nameEn: true, nameHi: true, basePrice: true },
    });
    return rep.send({ success: true, data: items.map(s => ({ id: s.id, text: s.nameEn, textHi: s.nameHi, price: s.basePrice })), source: 'postgres_fallback' });
  }
}

// ─── ADMIN ────────────────────────────────────────────────────────
async function triggerReindex(req: FastifyRequest, rep: FastifyReply) {
  const { type } = req.query as any;
  if (!type || !['services', 'workers'].includes(type)) {
    return rep.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'type=services|workers required' } });
  }

  // Run async — don't wait
  fullReindex(type as 'services' | 'workers')
    .then(r => logger.info(r, '[ES] Reindex complete'))
    .catch(err => logger.error({ err: err.message }, '[ES] Reindex failed'));

  return rep.send({ success: true, data: { message: `Reindex started for ${type}. Check logs.` } });
}

async function searchHealth(_req: FastifyRequest, rep: FastifyReply) {
  try {
    const health = await getEsClient().cluster.health({});
    return rep.send({ success: true, data: { status: (health as any).status, available: true } });
  } catch (err: any) {
    return rep.send({ success: true, data: { status: 'unavailable', available: false, error: err.message } });
  }
}

// ─── ROUTE REGISTRATION ───────────────────────────────────────────

export async function searchPublicRoutes(server: FastifyInstance) {
  server.get('/services',     wrap(searchServices));
  server.get('/workers',      wrap(searchWorkers));
  server.get('/autocomplete', wrap(autocomplete));
}

export async function searchAdminRoutes(server: FastifyInstance) {
  const perm = [requireStaff, requirePermission('view:analytics' as any)];
  server.post('/reindex', { preHandler: perm }, wrap(triggerReindex));
  server.get('/health',   { preHandler: perm }, wrap(searchHealth));
}
