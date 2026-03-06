import type { FastifyRequest, FastifyReply } from 'fastify';
import { geoRepo } from './city.repository';

export async function getCities(req: FastifyRequest, rep: FastifyReply) {
  const { active = 'true' } = req.query as { active?: string };
  const cities = await geoRepo.getCities(active !== 'false');
  return rep.send({ success: true, data: cities });
}

export async function getStates(_req: FastifyRequest, rep: FastifyReply) {
  const states = await geoRepo.getStates();
  return rep.send({ success: true, data: states });
}

export async function getNearestCity(req: FastifyRequest, rep: FastifyReply) {
  const { lat, lng } = req.query as { lat: string; lng: string };
  if (!lat || !lng) return rep.status(400).send({ success: false, error: { code: 'MISSING_COORDS', message: 'lat aur lng required hain.' } });
  const city = await geoRepo.getNearestCity(+lat, +lng);
  if (!city) return rep.status(404).send({ success: false, error: { code: 'NO_CITY', message: 'Aapke paas koi city nahi hai.' } });
  return rep.send({ success: true, data: city });
}

export async function getAreaByPincode(req: FastifyRequest, rep: FastifyReply) {
  const { pincode } = req.params as { pincode: string };
  const area = await geoRepo.getAreaByPincode(pincode);
  if (!area) return rep.status(404).send({ success: false, error: { code: 'NOT_SERVICEABLE', message: 'Yeh pincode available nahi hai.' } });
  return rep.send({ success: true, data: area });
}

export async function getCityById(req: FastifyRequest, rep: FastifyReply) {
  const { id } = req.params as { id: string };
  const city = await geoRepo.getCityById(id);
  if (!city) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'City nahi mili.' } });
  return rep.send({ success: true, data: city });
}

export async function getCityAreas(req: FastifyRequest, rep: FastifyReply) {
  const { id } = req.params as { id: string };
  const areas = await geoRepo.getAreas(id);
  return rep.send({ success: true, data: areas });
}

export async function getActiveSurge(req: FastifyRequest, rep: FastifyReply) {
  const { id } = req.params as { id: string };
  const surge = await geoRepo.getActiveSurge(id);
  return rep.send({ success: true, data: surge });
}

export async function getSurgeZones(req: FastifyRequest, rep: FastifyReply) {
  const { id } = req.params as { id: string };
  const zones = await geoRepo.getSurgeZones(id);
  return rep.send({ success: true, data: zones });
}
