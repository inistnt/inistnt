import { db } from '../../infrastructure/database';

export const geoRepo = {

  // ─── STATES ─────────────────────────────────────────────

  getStates: async () => {
    return db.state.findMany({
      where: { isActive: true },
      orderBy: { nameEn: 'asc' },
    });
  },

  // ─── CITIES ─────────────────────────────────────────────

  getCities: async (onlyActive = true) => {
    return db.city.findMany({
      where: onlyActive ? { isActive: true } : {},
      include: { state: { select: { nameHi: true, nameEn: true, code: true } } },
      orderBy: { nameEn: 'asc' },
    });
  },

  getCityById: async (id: string) => {
    return db.city.findUnique({
      where: { id },
      include: {
        state: true,
        areas: { where: { isActive: true }, orderBy: { nameEn: 'asc' } },
      },
    });
  },

  getCityBySlug: async (slug: string) => {
    return db.city.findUnique({
      where: { slug },
      include: { state: true },
    });
  },

  // ─── AREAS ──────────────────────────────────────────────

  getAreas: async (cityId: string) => {
    return db.area.findMany({
      where: { cityId, isActive: true },
      orderBy: { nameEn: 'asc' },
    });
  },

  getAreaByPincode: async (pincode: string) => {
    return db.area.findFirst({
      where: { isActive: true, pincodes: { hasSome: [pincode] } },
      include: { city: true },
    });
  },

  getNearestCity: async (lat: number, lng: number) => {
    const cities = await db.city.findMany({ where: { isActive: true } });
    let nearest = null;
    let minDist = Infinity;
    for (const city of cities) {
      const dist = Math.sqrt(Math.pow(city.lat - lat, 2) + Math.pow(city.lng - lng, 2));
      if (dist < minDist) { minDist = dist; nearest = city; }
    }
    return nearest;
  },

  // ─── SURGE ──────────────────────────────────────────────

  getSurgeZones: async (cityId: string) => {
    return db.surgeZone.findMany({ where: { cityId }, orderBy: { createdAt: 'desc' } });
  },

  getActiveSurge: async (cityId: string) => {
    const zone = await db.surgeZone.findFirst({ where: { cityId, isActive: true } });
    return { isActive: !!zone, multiplier: zone?.multiplier ?? 1.0, zone: zone ?? null };
  },
};
