// ═══════════════════════════════════════════════════════════════════
// INISTNT — Elasticsearch Service
//
// Indices:
//   inistnt_services — service catalog search + autocomplete
//   inistnt_workers  — worker search (name, skills, city, rating)
//   inistnt_bookings — admin booking search (full-text on bookingNumber, notes)
//
// Install: pnpm add @elastic/elasticsearch
// ═══════════════════════════════════════════════════════════════════

import { Client } from '@elastic/elasticsearch';
import { db }     from '../../infrastructure/database';
import { logger } from '../../config/logger';

// ─── CLIENT ───────────────────────────────────────────────────────
let esClient: Client | null = null;

export function getEsClient(): Client {
  if (!esClient) {
    const url = process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200';
    esClient = new Client({ node: url });
  }
  return esClient;
}

const PREFIX = process.env.ELASTICSEARCH_INDEX_PREFIX ?? 'inistnt_';

export const INDICES = {
  SERVICES: `${PREFIX}services`,
  WORKERS:  `${PREFIX}workers`,
  BOOKINGS: `${PREFIX}bookings`,
};

// ─── INDEX SETUP (run once on startup) ────────────────────────────
export async function ensureIndices(): Promise<void> {
  const client = getEsClient();

  // Services index
  const servicesExists = await client.indices.exists({ index: INDICES.SERVICES });
  if (!servicesExists) {
    await client.indices.create({
      index: INDICES.SERVICES,
      body: {
        settings: {
          analysis: {
            analyzer: {
              hindi_english: {
                type:      'custom',
                tokenizer: 'standard',
                filter:    ['lowercase', 'stop', 'asciifolding'],
              },
            },
          },
        },
        mappings: {
          properties: {
            id:              { type: 'keyword' },
            nameEn:          { type: 'text',    analyzer: 'hindi_english', fields: { keyword: { type: 'keyword' }, suggest: { type: 'completion' } } },
            nameHi:          { type: 'text',    analyzer: 'hindi_english' },
            descriptionEn:   { type: 'text',    analyzer: 'hindi_english' },
            categoryId:      { type: 'keyword' },
            categoryName:    { type: 'keyword' },
            basePricePaise:  { type: 'integer' },
            isActive:        { type: 'boolean' },
            rating:          { type: 'float' },
            bookingCount:    { type: 'integer' },
            tags:            { type: 'keyword' },
          },
        },
      },
    });
    logger.info('[ES] Services index created');
  }

  // Workers index
  const workersExists = await client.indices.exists({ index: INDICES.WORKERS });
  if (!workersExists) {
    await client.indices.create({
      index: INDICES.WORKERS,
      body: {
        mappings: {
          properties: {
            id:           { type: 'keyword' },
            name:         { type: 'text',    fields: { keyword: { type: 'keyword' } } },
            mobile:       { type: 'keyword' },
            status:       { type: 'keyword' },
            tier:         { type: 'keyword' },
            cityId:       { type: 'keyword' },
            cityName:     { type: 'keyword' },
            areaId:       { type: 'keyword' },
            skills:       { type: 'keyword' },
            rating:       { type: 'float' },
            totalJobs:    { type: 'integer' },
            isOnline:     { type: 'boolean' },
            location:     { type: 'geo_point' },
            updatedAt:    { type: 'date' },
          },
        },
      },
    });
    logger.info('[ES] Workers index created');
  }
}

// ─── SYNC: Index a service ─────────────────────────────────────────
export async function indexService(serviceId: string): Promise<void> {
  const service = await db.service.findUnique({
    where:   { id: serviceId },
    include: { category: { select: { nameEn: true } } },
  });
  if (!service) return;

  await getEsClient().index({
    index: INDICES.SERVICES,
    id:    service.id,
    body: {
      id:             service.id,
      nameEn:         service.nameEn,
      nameHi:         service.nameHi,
      descriptionEn:  service.descriptionEn,
      categoryId:     service.categoryId,
      categoryName:   service.category?.nameEn,
      basePricePaise: service.basePrice,
      isActive:       service.isActive,
      rating:         service.avgRating ?? 0,
      bookingCount:   service.totalBookings ?? 0,
      tags:           service.tags ?? [],
    },
  });
}

// ─── SYNC: Index a worker ──────────────────────────────────────────
export async function indexWorker(workerId: string): Promise<void> {
  const worker = await db.worker.findUnique({
    where:   { id: workerId },
    include: {
      city:   { select: { nameEn: true } },
      skills: { select: { serviceId: true } },
    },
  });
  if (!worker) return;

  const doc: any = {
    id:        worker.id,
    name:      worker.name,
    mobile:    worker.mobile,
    status:    worker.status,
    tier:      worker.tier,
    cityId:    worker.cityId,
    cityName:  worker.city?.nameEn,
    areaId:    worker.areaId,
    skills:    worker.skills.map(s => s.serviceId),
    rating:    worker.rating ?? 0,
    totalJobs: worker.totalJobs ?? 0,
    isOnline:  worker.isOnline,
    updatedAt: worker.updatedAt.toISOString(),
  };

  if (worker.currentLat && worker.currentLng) {
    doc.location = { lat: worker.currentLat, lon: worker.currentLng };
  }

  await getEsClient().index({ index: INDICES.WORKERS, id: worker.id, body: doc });
}

// ─── FULL REINDEX ──────────────────────────────────────────────────
export async function fullReindex(type: 'services' | 'workers'): Promise<{ indexed: number }> {
  let indexed = 0;
  const batchSize = 100;

  if (type === 'services') {
    let skip = 0;
    while (true) {
      const services = await db.service.findMany({ take: batchSize, skip });
      if (!services.length) break;
      await Promise.all(services.map(s => indexService(s.id)));
      indexed += services.length;
      skip += batchSize;
    }
  } else {
    let skip = 0;
    while (true) {
      const workers = await db.worker.findMany({ take: batchSize, skip });
      if (!workers.length) break;
      await Promise.all(workers.map(w => indexWorker(w.id)));
      indexed += workers.length;
      skip += batchSize;
    }
  }

  logger.info({ type, indexed }, '[ES] Full reindex complete');
  return { indexed };
}
