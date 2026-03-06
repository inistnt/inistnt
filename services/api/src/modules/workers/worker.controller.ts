import type { FastifyRequest, FastifyReply } from 'fastify';
import { workerRepo } from './worker.repository';
import { kafka, KafkaTopics } from '../../infrastructure/kafka';

// ─── PUBLIC ─────────────────────────────────────────────────

export async function getPublicProfile(req: FastifyRequest, rep: FastifyReply) {
  const { workerId } = req.params as { workerId: string };
  const profile = await workerRepo.findPublicProfile(workerId);
  if (!profile) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Worker nahi mila.' } });
  return rep.send({ success: true, data: profile });
}

export async function getWorkerReviews(req: FastifyRequest, rep: FastifyReply) {
  const { workerId } = req.params as { workerId: string };
  const { page = 1, limit = 20 } = req.query as any;
  const result = await workerRepo.getReviews(workerId, +page, +limit);
  return rep.send({ success: true, data: result.items, meta: { total: result.total, page: result.page, totalPages: result.totalPages } });
}

// ─── PRIVATE — Worker only ───────────────────────────────────

export async function getMe(req: FastifyRequest, rep: FastifyReply) {
  const worker = await workerRepo.findById(req.currentUser.id);
  if (!worker) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Worker nahi mila.' } });
  return rep.send({ success: true, data: worker });
}

export async function updateMe(req: FastifyRequest, rep: FastifyReply) {
  const worker = await workerRepo.update(req.currentUser.id, req.body as any);
  return rep.send({ success: true, data: worker });
}

export async function updateStatus(req: FastifyRequest, rep: FastifyReply) {
  const { status } = req.body as { status: 'online' | 'offline' };
  const isOnline = status === 'online';
  await workerRepo.updateStatus(req.currentUser.id, { isOnline, onlineSince: isOnline ? new Date() : null });
  await kafka.publish(isOnline ? KafkaTopics.WORKER_ONLINE : KafkaTopics.WORKER_OFFLINE, { workerId: req.currentUser.id });
  return rep.send({ success: true, data: { isOnline, message: isOnline ? 'Aap online hain.' : 'Aap offline hain.' } });
}

export async function updateLocation(req: FastifyRequest, rep: FastifyReply) {
  const { lat, lng, accuracy } = req.body as any;
  await workerRepo.updateLocation(req.currentUser.id, lat, lng, accuracy);
  await kafka.publish(KafkaTopics.WORKER_LOCATION_UPDATED, { workerId: req.currentUser.id, lat, lng });
  return rep.send({ success: true, data: null });
}

// ─── DOCUMENTS ────────────────────────────────────────────────

export async function getDocuments(req: FastifyRequest, rep: FastifyReply) {
  const docs = await workerRepo.getDocuments(req.currentUser.id);
  return rep.send({ success: true, data: docs });
}

export async function uploadDocument(req: FastifyRequest, rep: FastifyReply) {
  const { type, fileUrl } = req.body as { type: string; fileUrl: string };
  const doc = await workerRepo.createDocument(req.currentUser.id, type, fileUrl);
  return rep.status(201).send({ success: true, data: doc });
}

// ─── SKILLS ────────────────────────────────────────────────────

export async function getSkills(req: FastifyRequest, rep: FastifyReply) {
  const skills = await workerRepo.getSkills(req.currentUser.id);
  return rep.send({ success: true, data: skills });
}

export async function addSkill(req: FastifyRequest, rep: FastifyReply) {
  const { serviceCategoryId, experienceYears } = req.body as any;
  const skill = await workerRepo.addSkill(req.currentUser.id, serviceCategoryId, experienceYears);
  return rep.status(201).send({ success: true, data: skill });
}

export async function removeSkill(req: FastifyRequest, rep: FastifyReply) {
  const { skillId } = req.params as { skillId: string };
  await workerRepo.removeSkill(skillId, req.currentUser.id);
  return rep.send({ success: true, data: null });
}

// ─── EARNINGS ──────────────────────────────────────────────────

export async function getEarnings(req: FastifyRequest, rep: FastifyReply) {
  const { period } = req.query as { period?: string };
  const earnings = await workerRepo.getEarnings(req.currentUser.id, period);
  return rep.send({ success: true, data: earnings });
}

export async function getTransactions(req: FastifyRequest, rep: FastifyReply) {
  const { page = 1, limit = 20 } = req.query as any;
  const result = await workerRepo.getTransactions(req.currentUser.id, +page, +limit);
  return rep.send({ success: true, data: result.items, meta: { total: result.total, page: result.page, totalPages: result.totalPages } });
}

// ─── PAYOUTS ─────────────────────────────────────────────────────

export async function getPayouts(req: FastifyRequest, rep: FastifyReply) {
  const { page = 1, limit = 20 } = req.query as any;
  const result = await workerRepo.getPayouts(req.currentUser.id, +page, +limit);
  return rep.send({ success: true, data: result.items, meta: { total: result.total, page: result.page, totalPages: result.totalPages } });
}

export async function requestPayout(req: FastifyRequest, rep: FastifyReply) {
  const { amount } = req.body as { amount: number };
  const worker = await workerRepo.findById(req.currentUser.id);
  const method = worker?.payoutMethod ?? 'bank';
  const payout = await workerRepo.requestPayout(req.currentUser.id, amount, method);
  return rep.send({ success: true, data: payout });
}

// ─── BANK DETAILS ────────────────────────────────────────────────

export async function getBankDetails(req: FastifyRequest, rep: FastifyReply) {
  const details = await workerRepo.getBankDetails(req.currentUser.id);
  if (details?.bankAccountNo) {
    const acc = details.bankAccountNo;
    (details as any).bankAccountNo = '*'.repeat(acc.length - 4) + acc.slice(-4);
  }
  return rep.send({ success: true, data: details });
}

export async function updateBankDetails(req: FastifyRequest, rep: FastifyReply) {
  await workerRepo.updateBankDetails(req.currentUser.id, req.body as any);
  return rep.send({ success: true, data: { message: 'Bank details save ho gayi.' } });
}

// ─── STATS ────────────────────────────────────────────────────────

export async function getStats(req: FastifyRequest, rep: FastifyReply) {
  const stats = await workerRepo.getStats(req.currentUser.id);
  return rep.send({ success: true, data: stats });
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────

export async function getNotifications(req: FastifyRequest, rep: FastifyReply) {
  const { page = 1, limit = 20 } = req.query as any;
  const result = await workerRepo.getNotifications(req.currentUser.id, +page, +limit);
  return rep.send({ success: true, data: result.items, meta: { total: result.total, page: result.page, totalPages: result.totalPages } });
}

export async function getUnreadNotificationCount(req: FastifyRequest, rep: FastifyReply) {
  const count = await workerRepo.getUnreadCount(req.currentUser.id);
  return rep.send({ success: true, data: { count } });
}

export async function markNotificationsRead(req: FastifyRequest, rep: FastifyReply) {
  const { notificationIds } = req.body as { notificationIds?: string[] };
  await workerRepo.markNotificationsRead(req.currentUser.id, notificationIds);
  return rep.send({ success: true, data: null });
}

// ─── REWARDS & INCENTIVES ─────────────────────────────────────────

export async function getRewards(req: FastifyRequest, rep: FastifyReply) {
  const rewards = await workerRepo.getRewards(req.currentUser.id);
  return rep.send({ success: true, data: rewards });
}

export async function getIncentivePrograms(req: FastifyRequest, rep: FastifyReply) {
  const programs = await workerRepo.getAvailablePrograms(req.currentUser.id);
  return rep.send({ success: true, data: programs });
}

export async function getSubscription(req: FastifyRequest, rep: FastifyReply) {
  const sub = await workerRepo.getSubscription(req.currentUser.id);
  return rep.send({ success: true, data: sub });
}
