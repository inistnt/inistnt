import type { FastifyRequest, FastifyReply } from 'fastify';
import { userProfileRepo } from './user.repository';
import { db } from '../../infrastructure/database';

// ─── PROFILE ────────────────────────────────────────────────

export async function getMe(req: FastifyRequest, rep: FastifyReply) {
  const user = await userProfileRepo.findById(req.currentUser.id);
  if (!user) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User nahi mila.' } });
  return rep.send({ success: true, data: user });
}

export async function updateMe(req: FastifyRequest, rep: FastifyReply) {
  const data = req.body as { name?: string; email?: string; preferredLang?: string };
  const user = await userProfileRepo.update(req.currentUser.id, data);
  return rep.send({ success: true, data: user });
}

export async function deleteMe(req: FastifyRequest, rep: FastifyReply) {
  await db.user.update({ where: { id: req.currentUser.id }, data: { status: 'DELETED', deletedAt: new Date() } });
  return rep.send({ success: true, data: { message: 'Account delete ho gaya.' } });
}

// ─── ADDRESSES ──────────────────────────────────────────────

export async function getAddresses(req: FastifyRequest, rep: FastifyReply) {
  const addresses = await userProfileRepo.getAddresses(req.currentUser.id);
  return rep.send({ success: true, data: addresses });
}

export async function createAddress(req: FastifyRequest, rep: FastifyReply) {
  const address = await userProfileRepo.createAddress(req.currentUser.id, req.body as any);
  return rep.status(201).send({ success: true, data: address });
}

export async function updateAddress(req: FastifyRequest, rep: FastifyReply) {
  const { addressId } = req.params as { addressId: string };
  const existing = await userProfileRepo.getAddressById(addressId, req.currentUser.id);
  if (!existing) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Address nahi mila.' } });
  const updated = await userProfileRepo.updateAddress(addressId, req.currentUser.id, req.body as any);
  return rep.send({ success: true, data: updated });
}

export async function deleteAddress(req: FastifyRequest, rep: FastifyReply) {
  const { addressId } = req.params as { addressId: string };
  const existing = await userProfileRepo.getAddressById(addressId, req.currentUser.id);
  if (!existing) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Address nahi mila.' } });
  await userProfileRepo.deleteAddress(addressId, req.currentUser.id);
  return rep.send({ success: true, data: null });
}

export async function setDefaultAddress(req: FastifyRequest, rep: FastifyReply) {
  const { addressId } = req.params as { addressId: string };
  const existing = await userProfileRepo.getAddressById(addressId, req.currentUser.id);
  if (!existing) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Address nahi mila.' } });
  await userProfileRepo.setDefaultAddress(addressId, req.currentUser.id);
  return rep.send({ success: true, data: { message: 'Default address set ho gaya.' } });
}

// ─── LOYALTY ────────────────────────────────────────────────

export async function getLoyaltyPoints(req: FastifyRequest, rep: FastifyReply) {
  const points = await userProfileRepo.getLoyaltyPoints(req.currentUser.id);
  return rep.send({ success: true, data: { points } });
}

export async function getLoyaltyHistory(req: FastifyRequest, rep: FastifyReply) {
  const { page = 1, limit = 20 } = req.query as { page?: number; limit?: number };
  const result = await userProfileRepo.getLoyaltyHistory(req.currentUser.id, +page, +limit);
  return rep.send({ success: true, data: result.items, meta: { total: result.total, page: result.page, totalPages: result.totalPages } });
}

// ─── TRANSACTIONS ────────────────────────────────────────────

export async function getTransactions(req: FastifyRequest, rep: FastifyReply) {
  const { page = 1, limit = 20 } = req.query as { page?: number; limit?: number };
  const result = await userProfileRepo.getTransactions(req.currentUser.id, +page, +limit);
  return rep.send({ success: true, data: result.items, meta: { total: result.total, page: result.page, totalPages: result.totalPages } });
}

// ─── NOTIFICATIONS ────────────────────────────────────────────

export async function getNotifications(req: FastifyRequest, rep: FastifyReply) {
  const { page = 1, limit = 20 } = req.query as { page?: number; limit?: number };
  const result = await userProfileRepo.getNotifications(req.currentUser.id, +page, +limit);
  return rep.send({ success: true, data: result.items, meta: { total: result.total, page: result.page, totalPages: result.totalPages } });
}

export async function getUnreadNotificationCount(req: FastifyRequest, rep: FastifyReply) {
  const count = await userProfileRepo.getUnreadCount(req.currentUser.id);
  return rep.send({ success: true, data: { count } });
}

export async function markNotificationsRead(req: FastifyRequest, rep: FastifyReply) {
  const { notificationIds } = req.body as { notificationIds?: string[] };
  await userProfileRepo.markNotificationsRead(req.currentUser.id, notificationIds);
  return rep.send({ success: true, data: null });
}

export async function markAllNotificationsRead(req: FastifyRequest, rep: FastifyReply) {
  await userProfileRepo.markNotificationsRead(req.currentUser.id);
  return rep.send({ success: true, data: null });
}

// ─── REFERRAL ────────────────────────────────────────────────

export async function getReferralInfo(req: FastifyRequest, rep: FastifyReply) {
  const info = await userProfileRepo.getReferralInfo(req.currentUser.id);
  return rep.send({ success: true, data: info });
}

// ─── DISPUTES ────────────────────────────────────────────────

export async function createDispute(req: FastifyRequest, rep: FastifyReply) {
  const { bookingId, category, description } = req.body as any;
  const booking = await db.booking.findFirst({ where: { id: bookingId, userId: req.currentUser.id } });
  if (!booking) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Booking nahi mili.' } });
  const dispute = await db.dispute.create({
    data: {
      bookingId, userId: req.currentUser.id, workerId: booking.workerId,
      category, description, status: 'OPEN',
      priority: category === 'PAYMENT' ? 'HIGH' : 'MEDIUM',
    },
  });
  return rep.status(201).send({ success: true, data: dispute });
}

export async function getMyDisputes(req: FastifyRequest, rep: FastifyReply) {
  const disputes = await db.dispute.findMany({
    where: { userId: req.currentUser.id },
    include: { booking: { select: { bookingNumber: true } }, notes: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { createdAt: 'desc' },
  });
  return rep.send({ success: true, data: disputes });
}
