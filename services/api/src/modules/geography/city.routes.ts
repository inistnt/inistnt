import type { FastifyInstance } from 'fastify';
import {
  getCities, getStates, getNearestCity, getAreaByPincode,
  getCityById, getCityAreas, getActiveSurge, getSurgeZones,
} from './city.controller';

function wrap(fn: Function) {
  return async (req: any, rep: any) => {
    try { return await fn(req, rep); }
    catch (err: any) {
      if (err.statusCode) return rep.status(err.statusCode).send({ success: false, error: { code: err.code ?? 'ERROR', message: err.message } });
      throw err;
    }
  };
}

export async function cityRoutes(server: FastifyInstance) {
  server.get('/',                    wrap(getCities));
  server.get('/states',              wrap(getStates));
  server.get('/nearest',             wrap(getNearestCity));
  server.get('/pincode/:pincode',    wrap(getAreaByPincode));
  server.get('/:id',                 wrap(getCityById));
  server.get('/:id/areas',           wrap(getCityAreas));
  server.get('/:id/surge',           wrap(getActiveSurge));
  server.get('/:id/surge-zones',     wrap(getSurgeZones));
}
