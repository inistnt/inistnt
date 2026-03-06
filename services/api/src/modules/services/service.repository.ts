import { db } from '../../infrastructure/database';

export const serviceRepo = {

  // ─── CATEGORIES ─────────────────────────────────────────

  getCategories: async () => {
    return db.serviceCategory.findMany({
      where: { isActive: true, parentId: null },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  },

  getCategoryById: async (id: string) => {
    return db.serviceCategory.findUnique({
      where: { id },
      include: { children: true },
    });
  },

  // ─── SERVICES ───────────────────────────────────────────

  getAll: async (params?: {
    categoryId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) => {
    const { categoryId, search, page = 1, limit = 20 } = params ?? {};
    const skip = (page - 1) * limit;

    const where: any = { isActive: true };
    if (categoryId) where.categoryId = categoryId;
    if (search) {
      where.OR = [
        { nameHi: { contains: search, mode: 'insensitive' } },
        { nameEn: { contains: search, mode: 'insensitive' } },
        { searchKeywords: { hasSome: [search] } },
      ];
    }

    const [items, total] = await Promise.all([
      db.service.findMany({
        where,
        include: { category: true },
        orderBy: { sortOrder: 'asc' },
        skip,
        take: limit,
      }),
      db.service.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  getById: async (id: string) => {
    return db.service.findUnique({
      where: { id },
      include: { category: true },
    });
  },

  getBySlug: async (slug: string) => {
    return db.service.findUnique({
      where: { slug },
      include: { category: true },
    });
  },

  // ─── PRICING ────────────────────────────────────────────

  getPricing: async (serviceId: string, cityId: string) => {
    return db.servicePricing.findMany({
      where: { serviceId, cityId, isActive: true },
      orderBy: { workerTier: 'asc' },
    });
  },

  getSurgMultiplier: async (cityId: string, lat?: number, lng?: number): Promise<number> => {
    // Active surge zones check karo
    if (lat && lng) {
      const activeZone = await db.surgeZone.findFirst({
        where: { cityId, isActive: true },
      });
      if (activeZone) return activeZone.multiplier;
    }
    return 1.0;
  },
};
