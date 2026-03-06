import { Client } from '@elastic/elasticsearch';
import { config } from '../config';

// ─────────────────────────────────────────────────────────────
// ELASTICSEARCH CLIENT
// ─────────────────────────────────────────────────────────────

export const es = new Client({
  node: config.ELASTICSEARCH_URL ?? 'http://localhost:9200',
});

export const ES_INDEX = {
  WORKERS:  'inistnt_workers',
  SERVICES: 'inistnt_services',
} as const;

// ─── INDEX MAPPING ────────────────────────────────────────────

export async function createWorkerIndex() {
  const exists = await es.indices.exists({ index: ES_INDEX.WORKERS });
  if (exists) return;

  await es.indices.create({
    index: ES_INDEX.WORKERS,
    body: {
      settings: {
        number_of_shards:   1,
        number_of_replicas: 0,
        analysis: {
          analyzer: {
            hindi_english: {
              type:      'custom',
              tokenizer: 'standard',
              filter:    ['lowercase', 'asciifolding'],
            },
          },
        },
      },
      mappings: {
        properties: {
          id:                     { type: 'keyword' },
          name:                   { type: 'text', analyzer: 'hindi_english' },
          mobile:                 { type: 'keyword' },
          cityId:                 { type: 'keyword' },
          cityName:               { type: 'keyword' },
          tier:                   { type: 'keyword' },
          status:                 { type: 'keyword' },
          isOnline:               { type: 'boolean' },
          rating:                 { type: 'float' },
          totalBookings:          { type: 'integer' },
          acceptanceRate:         { type: 'float' },
          uniformComplianceScore: { type: 'float' },
          // Geo point for distance queries
          location: { type: 'geo_point' },
          // Skills / categories
          skillCategoryIds:   { type: 'keyword' },
          skillCategoryNames: { type: 'text' },
          // Timestamps
          lastLocationAt: { type: 'date' },
          updatedAt:      { type: 'date' },
        },
      },
    },
  });

  console.log(`[ES] ✅ Index created: ${ES_INDEX.WORKERS}`);
}

// ─── SYNC WORKER TO ES ────────────────────────────────────────

export interface WorkerESDoc {
  id:                     string;
  name:                   string;
  mobile:                 string;
  cityId:                 string;
  cityName:               string;
  tier:                   string;
  status:                 string;
  isOnline:               boolean;
  rating:                 number;
  totalBookings:          number;
  acceptanceRate:         number;
  uniformComplianceScore: number;
  location?:              { lat: number; lon: number };
  skillCategoryIds:       string[];
  skillCategoryNames:     string[];
  lastLocationAt?:        string;
  updatedAt:              string;
}

export async function upsertWorker(doc: WorkerESDoc): Promise<void> {
  await es.index({
    index: ES_INDEX.WORKERS,
    id:    doc.id,
    body:  doc,
  });
}

export async function removeWorker(workerId: string): Promise<void> {
  await es.delete({ index: ES_INDEX.WORKERS, id: workerId }).catch(() => {});
}

// ─── SEARCH NEARBY WORKERS ────────────────────────────────────

export interface WorkerSearchParams {
  lat:              number;
  lng:              number;
  radiusKm:         number;
  categoryId?:      string;
  cityId?:          string;
  onlineOnly?:      boolean;
  verifiedOnly?:    boolean;
  tier?:            string;
  minRating?:       number;
  page?:            number;
  limit?:           number;
}

export interface WorkerSearchResult {
  workers: Array<WorkerESDoc & { distanceKm: number }>;
  total:   number;
}

export async function searchNearbyWorkers(params: WorkerSearchParams): Promise<WorkerSearchResult> {
  const {
    lat, lng, radiusKm,
    categoryId, cityId, onlineOnly = false, verifiedOnly = true,
    tier, minRating,
    page = 1, limit = 20,
  } = params;

  const must: any[]    = [];
  const filter: any[]  = [];

  // Geo distance filter
  filter.push({
    geo_distance: {
      distance:  `${radiusKm}km`,
      location:  { lat, lon: lng },
    },
  });

  if (cityId)       filter.push({ term: { cityId } });
  if (onlineOnly)   filter.push({ term: { isOnline: true } });
  if (verifiedOnly) filter.push({ term: { status: 'VERIFIED' } });
  if (tier)         filter.push({ term: { tier } });
  if (categoryId)   filter.push({ term: { skillCategoryIds: categoryId } });
  if (minRating)    filter.push({ range: { rating: { gte: minRating } } });

  const result = await es.search({
    index: ES_INDEX.WORKERS,
    body: {
      from: (page - 1) * limit,
      size: limit,
      query: {
        bool: { must, filter },
      },
      sort: [
        // Sort by score (rating + compliance) then distance
        { rating:                 { order: 'desc' } },
        { uniformComplianceScore: { order: 'desc' } },
        {
          _geo_distance: {
            location:         { lat, lon: lng },
            order:            'asc',
            unit:             'km',
            distance_type:    'arc',
          },
        },
      ],
      // Include distance in response
      script_fields: {},
    },
  });

  const hits = result.hits.hits as any[];

  const workers = hits.map(hit => ({
    ...hit._source as WorkerESDoc,
    distanceKm: hit.sort?.[2] ?? 0,
  }));

  return {
    workers,
    total: typeof result.hits.total === 'number'
      ? result.hits.total
      : (result.hits.total as any)?.value ?? 0,
  };
}

// ─── FULL SYNC (run once or scheduled) ────────────────────────

export async function fullWorkerSync(db: any): Promise<number> {
  await createWorkerIndex();

  const workers = await db.worker.findMany({
    include: {
      city:   { select: { nameEn: true } },
      skills: { include: { serviceCategory: { select: { nameEn: true } } } },
    },
  });

  let synced = 0;
  const ops: any[] = [];

  for (const w of workers) {
    const doc: WorkerESDoc = {
      id:                     w.id,
      name:                   w.name,
      mobile:                 w.mobile,
      cityId:                 w.cityId,
      cityName:               w.city?.nameEn ?? '',
      tier:                   w.tier,
      status:                 w.status,
      isOnline:               w.isOnline,
      rating:                 w.rating,
      totalBookings:          w.totalBookings,
      acceptanceRate:         w.acceptanceRate,
      uniformComplianceScore: w.uniformComplianceScore,
      skillCategoryIds:       w.skills.map((s: any) => s.serviceCategoryId),
      skillCategoryNames:     w.skills.map((s: any) => s.serviceCategory.nameEn),
      lastLocationAt:         w.lastLocationAt?.toISOString(),
      updatedAt:              w.updatedAt.toISOString(),
      ...(w.currentLat && w.currentLng && {
        location: { lat: w.currentLat, lon: w.currentLng },
      }),
    };

    ops.push({ index: { _index: ES_INDEX.WORKERS, _id: w.id } });
    ops.push(doc);
    synced++;
  }

  if (ops.length > 0) {
    await es.bulk({ body: ops });
    await es.indices.refresh({ index: ES_INDEX.WORKERS });
  }

  console.log(`[ES] ✅ Full sync complete: ${synced} workers`);
  return synced;
}

// ─── UPDATE WORKER LOCATION (called on WORKER_LOCATION event) ─

export async function updateWorkerLocation(
  workerId: string,
  lat: number,
  lng: number,
): Promise<void> {
  await es.update({
    index: ES_INDEX.WORKERS,
    id:    workerId,
    body: {
      doc: {
        location:       { lat, lon: lng },
        lastLocationAt: new Date().toISOString(),
        isOnline:       true,
      },
    },
  }).catch(() => {}); // Worker may not be in ES yet
}

// ─── UPDATE WORKER STATUS ─────────────────────────────────────

export async function updateWorkerStatus(
  workerId: string,
  isOnline: boolean,
  status?: string,
): Promise<void> {
  const doc: any = { isOnline };
  if (status) doc.status = status;

  await es.update({
    index: ES_INDEX.WORKERS,
    id:    workerId,
    body:  { doc },
  }).catch(() => {});
}
