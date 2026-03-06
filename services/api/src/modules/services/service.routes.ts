import type { FastifyInstance } from 'fastify';
import { getCategories, getCategoryById, getServices, getServiceById, getServicePricing } from './service.controller';

function wrap(fn: Function) {
  return async (req: any, rep: any) => {
    try { return await fn(req, rep); }
    catch (err: any) {
      if (err.statusCode) return rep.status(err.statusCode).send({ success: false, error: { code: err.code ?? 'ERROR', message: err.message } });
      throw err;
    }
  };
}

export async function serviceRoutes(server: FastifyInstance) {
  server.get('/categories',       wrap(getCategories));
  server.get('/categories/:id',   wrap(getCategoryById));
  server.get('/',                 wrap(getServices));
  server.get('/:id',              wrap(getServiceById));
  server.get('/:id/pricing',      wrap(getServicePricing));
}
