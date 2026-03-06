import type { FastifyRequest, FastifyReply } from 'fastify';
import { serviceRepo } from './service.repository';

export async function getCategories(_req: FastifyRequest, rep: FastifyReply) {
  const categories = await serviceRepo.getCategories();
  return rep.send({ success: true, data: categories });
}

export async function getCategoryById(req: FastifyRequest, rep: FastifyReply) {
  const { id } = req.params as { id: string };
  const category = await serviceRepo.getCategoryById(id);
  if (!category) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Category nahi mili.' } });
  return rep.send({ success: true, data: category });
}

export async function getServices(req: FastifyRequest, rep: FastifyReply) {
  const { categoryId, search, page = 1, limit = 20 } = req.query as any;
  const result = await serviceRepo.getAll({ categoryId, search, page: +page, limit: +limit });
  return rep.send({ success: true, data: result.items, meta: { total: result.total, page: result.page, totalPages: result.totalPages } });
}

export async function getServiceById(req: FastifyRequest, rep: FastifyReply) {
  const { id } = req.params as { id: string };
  const service = await serviceRepo.getById(id);
  if (!service) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Service nahi mili.' } });
  return rep.send({ success: true, data: service });
}

export async function getServicePricing(req: FastifyRequest, rep: FastifyReply) {
  const { id } = req.params as { id: string };
  const { cityId } = req.query as { cityId: string };
  if (!cityId) return rep.status(400).send({ success: false, error: { code: 'MISSING_CITY', message: 'cityId required hai.' } });
  const [pricing, surge] = await Promise.all([
    serviceRepo.getPricing(id, cityId),
    serviceRepo.getSurgMultiplier(cityId),
  ]);
  return rep.send({ success: true, data: { pricing, surgeMultiplier: surge, isSurgeActive: surge > 1.0 } });
}
