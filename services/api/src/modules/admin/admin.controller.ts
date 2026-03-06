import type { FastifyRequest, FastifyReply } from 'fastify';
import { adminRepo } from './admin.repository';
import { paymentService } from '../payments/payment.service';
import { staffAuthService } from '../auth/auth.service';

// ─── DASHBOARD ───────────────────────────────────────────────

export async function getDashboard(req: FastifyRequest, rep: FastifyReply) {
  const { cityId } = req.query as { cityId?: string };
  const stats = await adminRepo.getDashboardStats(cityId);
  return rep.send({ success: true, data: stats });
}

export async function getLiveOps(req: FastifyRequest, rep: FastifyReply) {
  const { cityId } = req.query as { cityId?: string };
  const ops = await adminRepo.getLiveOps(cityId);
  return rep.send({ success: true, data: ops });
}

// ─── USERS ───────────────────────────────────────────────────

export async function getUsers(req: FastifyRequest, rep: FastifyReply) {
  const { search, status, page = 1, limit = 20 } = req.query as any;
  const result = await adminRepo.getUsers({ search, status, page: +page, limit: +limit });
  return rep.send({ success: true, data: result.items, meta: { total: result.total, page: result.page, totalPages: result.totalPages } });
}

export async function suspendUser(req: FastifyRequest, rep: FastifyReply) {
  const { userId } = req.params as { userId: string };
  const { reason } = req.body as { reason: string };
  const user = await adminRepo.suspendUser(userId, reason, req.currentUser.id);
  return rep.send({ success: true, data: user });
}

// ─── WORKERS ─────────────────────────────────────────────────

export async function getWorkers(req: FastifyRequest, rep: FastifyReply) {
  const { cityId, status, search, page = 1, limit = 20 } = req.query as any;
  const result = await adminRepo.getWorkers({ cityId, status, search, page: +page, limit: +limit });
  return rep.send({ success: true, data: result.items, meta: { total: result.total, page: result.page, totalPages: result.totalPages } });
}

export async function verifyWorker(req: FastifyRequest, rep: FastifyReply) {
  const { workerId } = req.params as { workerId: string };
  const worker = await adminRepo.verifyWorker(workerId);
  return rep.send({ success: true, data: worker });
}

export async function suspendWorker(req: FastifyRequest, rep: FastifyReply) {
  const { workerId } = req.params as { workerId: string };
  const { reason } = req.body as { reason: string };
  const worker = await adminRepo.suspendWorker(workerId, reason, req.currentUser.id);
  return rep.send({ success: true, data: worker });
}

export async function changeWorkerTier(req: FastifyRequest, rep: FastifyReply) {
  const { workerId } = req.params as { workerId: string };
  const { tier } = req.body as { tier: string };
  const worker = await adminRepo.updateWorkerTier(workerId, tier, req.currentUser.id);
  return rep.send({ success: true, data: worker });
}

// ─── DOCUMENTS ───────────────────────────────────────────────

export async function approveDocument(req: FastifyRequest, rep: FastifyReply) {
  const { documentId } = req.params as { documentId: string };
  const doc = await adminRepo.approveDocument(documentId, req.currentUser.id);
  return rep.send({ success: true, data: doc });
}

export async function rejectDocument(req: FastifyRequest, rep: FastifyReply) {
  const { documentId } = req.params as { documentId: string };
  const { note } = req.body as { note: string };
  const doc = await adminRepo.rejectDocument(documentId, req.currentUser.id, note);
  return rep.send({ success: true, data: doc });
}

// ─── BOOKINGS ────────────────────────────────────────────────

export async function getBookings(req: FastifyRequest, rep: FastifyReply) {
  const { cityId, status, search, page = 1, limit = 20 } = req.query as any;
  const result = await adminRepo.getBookings({ cityId, status, search, page: +page, limit: +limit });
  return rep.send({ success: true, data: result.items, meta: { total: result.total, page: result.page, totalPages: result.totalPages } });
}

export async function refundBooking(req: FastifyRequest, rep: FastifyReply) {
  const { bookingId } = req.params as { bookingId: string };
  const { amount, reason } = req.body as any;
  const refund = await paymentService.refund(bookingId, amount, reason, req.currentUser.id);
  return rep.send({ success: true, data: refund });
}

// ─── DISPUTES ────────────────────────────────────────────────

export async function getDisputes(req: FastifyRequest, rep: FastifyReply) {
  const { status, page = 1, limit = 20 } = req.query as any;
  const result = await adminRepo.getDisputes({ status, page: +page, limit: +limit });
  return rep.send({ success: true, data: result.items, meta: { total: result.total, page: result.page, totalPages: result.totalPages } });
}

export async function resolveDispute(req: FastifyRequest, rep: FastifyReply) {
  const { disputeId } = req.params as { disputeId: string };
  const { resolution, refundAmount } = req.body as any;
  const dispute = await adminRepo.resolveDispute(disputeId, resolution, refundAmount, req.currentUser.id);
  if (refundAmount && dispute.bookingId) {
    await paymentService.refund(dispute.bookingId, refundAmount * 100, resolution, req.currentUser.id);
  }
  return rep.send({ success: true, data: dispute });
}

export async function addDisputeNote(req: FastifyRequest, rep: FastifyReply) {
  const { disputeId } = req.params as { disputeId: string };
  const { note } = req.body as { note: string };
  const result = await adminRepo.addDisputeNote(disputeId, req.currentUser.id, req.currentUser.role ?? 'staff', note);
  return rep.send({ success: true, data: result });
}

// ─── SOS ─────────────────────────────────────────────────────

export async function getSosIncidents(req: FastifyRequest, rep: FastifyReply) {
  const { status, page = 1, limit = 20 } = req.query as any;
  const result = await adminRepo.getSosIncidents({ status, page: +page, limit: +limit });
  return rep.send({ success: true, data: result.items, meta: { total: result.total, page: result.page, totalPages: result.totalPages } });
}

export async function resolveSos(req: FastifyRequest, rep: FastifyReply) {
  const { sosId } = req.params as { sosId: string };
  const { resolution } = req.body as { resolution: string };
  const sos = await adminRepo.resolveSos(sosId, resolution, req.currentUser.id);
  return rep.send({ success: true, data: sos });
}

// ─── COMMISSION ──────────────────────────────────────────────

export async function getCommissionRules(req: FastifyRequest, rep: FastifyReply) {
  const { cityId } = req.query as { cityId?: string };
  const rules = await adminRepo.getCommissionRules(cityId);
  return rep.send({ success: true, data: rules });
}

export async function createCommissionRule(req: FastifyRequest, rep: FastifyReply) {
  const rule = await adminRepo.createCommissionRule({ ...(req.body as any), setById: req.currentUser.id });
  return rep.status(201).send({ success: true, data: rule });
}

// ─── SURGE ───────────────────────────────────────────────────

export async function activateSurge(req: FastifyRequest, rep: FastifyReply) {
  const { cityId } = req.params as { cityId: string };
  const { multiplier, reason, deactivatesAt } = req.body as any;
  const zone = await adminRepo.activateSurge(cityId, multiplier, reason, req.currentUser.id, deactivatesAt ? new Date(deactivatesAt) : undefined);
  return rep.send({ success: true, data: zone });
}

export async function deactivateSurge(req: FastifyRequest, rep: FastifyReply) {
  const { cityId } = req.params as { cityId: string };
  await adminRepo.deactivateSurge(cityId);
  return rep.send({ success: true, data: { message: 'Surge deactivate ho gaya.' } });
}

// ─── BANNERS ─────────────────────────────────────────────────

export async function getBanners(req: FastifyRequest, rep: FastifyReply) {
  const { cityId } = req.query as { cityId?: string };
  const banners = await adminRepo.getBanners(cityId);
  return rep.send({ success: true, data: banners });
}

export async function createBanner(req: FastifyRequest, rep: FastifyReply) {
  const banner = await adminRepo.createBanner(req.body, req.currentUser.id);
  return rep.status(201).send({ success: true, data: banner });
}

export async function updateBannerStatus(req: FastifyRequest, rep: FastifyReply) {
  const { bannerId } = req.params as { bannerId: string };
  const { status } = req.body as { status: string };
  const banner = await adminRepo.updateBannerStatus(bannerId, status, req.currentUser.id);
  return rep.send({ success: true, data: banner });
}

// ─── COUPONS ─────────────────────────────────────────────────

export async function getCoupons(_req: FastifyRequest, rep: FastifyReply) {
  const coupons = await adminRepo.getCoupons();
  return rep.send({ success: true, data: coupons });
}

export async function createCoupon(req: FastifyRequest, rep: FastifyReply) {
  const body = req.body as any;
  const coupon = await adminRepo.createCoupon({
    ...body,
    code: body.code.toUpperCase(),
    validFrom: new Date(body.validFrom),
    validTo: new Date(body.validTo),
  }, req.currentUser.id);
  return rep.status(201).send({ success: true, data: coupon });
}

export async function toggleCoupon(req: FastifyRequest, rep: FastifyReply) {
  const { couponId } = req.params as { couponId: string };
  const { isActive } = req.body as { isActive: boolean };
  const coupon = await adminRepo.toggleCoupon(couponId, isActive);
  return rep.send({ success: true, data: coupon });
}

// ─── PAYOUTS ─────────────────────────────────────────────────

export async function getPendingPayouts(_req: FastifyRequest, rep: FastifyReply) {
  const payouts = await adminRepo.getPendingPayouts();
  return rep.send({ success: true, data: payouts });
}

export async function processPayout(req: FastifyRequest, rep: FastifyReply) {
  const { payoutId } = req.params as { payoutId: string };
  const { utrNumber } = req.body as { utrNumber: string };
  const payout = await adminRepo.processPayout(payoutId, utrNumber, req.currentUser.id);
  return rep.send({ success: true, data: payout });
}

// ─── FEATURE FLAGS ───────────────────────────────────────────

export async function getFeatureFlags(_req: FastifyRequest, rep: FastifyReply) {
  const flags = await adminRepo.getFeatureFlags();
  return rep.send({ success: true, data: flags });
}

export async function toggleFeatureFlag(req: FastifyRequest, rep: FastifyReply) {
  const { key } = req.params as { key: string };
  const { isEnabled } = req.body as { isEnabled: boolean };
  const flag = await adminRepo.toggleFeatureFlag(key, isEnabled, req.currentUser.id);
  return rep.send({ success: true, data: flag });
}

// ─── AUDIT LOGS ──────────────────────────────────────────────

export async function getAuditLogs(req: FastifyRequest, rep: FastifyReply) {
  const { entityType, entityId, page = 1, limit = 50 } = req.query as any;
  const result = await adminRepo.getAuditLogs({ entityType, entityId, page: +page, limit: +limit });
  return rep.send({ success: true, data: result.items, meta: { total: result.total, page: result.page, totalPages: result.totalPages } });
}

// ─── CITIES & AREAS ──────────────────────────────────────────

export async function getCities(_req: FastifyRequest, rep: FastifyReply) {
  const cities = await adminRepo.getCities();
  return rep.send({ success: true, data: cities });
}

export async function createCity(req: FastifyRequest, rep: FastifyReply) {
  const city = await adminRepo.createCity(req.body);
  return rep.status(201).send({ success: true, data: city });
}

export async function updateCity(req: FastifyRequest, rep: FastifyReply) {
  const { cityId } = req.params as { cityId: string };
  const city = await adminRepo.updateCity(cityId, req.body);
  return rep.send({ success: true, data: city });
}

export async function getAreas(req: FastifyRequest, rep: FastifyReply) {
  const { cityId } = req.params as { cityId: string };
  const areas = await adminRepo.getAreas(cityId);
  return rep.send({ success: true, data: areas });
}

export async function createArea(req: FastifyRequest, rep: FastifyReply) {
  const { cityId } = req.params as { cityId: string };
  const area = await adminRepo.createArea({ ...(req.body as any), cityId });
  return rep.status(201).send({ success: true, data: area });
}

export async function updateArea(req: FastifyRequest, rep: FastifyReply) {
  const { areaId } = req.params as { areaId: string };
  const area = await adminRepo.updateArea(areaId, req.body);
  return rep.send({ success: true, data: area });
}

// ─── SERVICES & CATEGORIES ───────────────────────────────────

export async function getServicesAdmin(_req: FastifyRequest, rep: FastifyReply) {
  const services = await adminRepo.getServicesAdmin();
  return rep.send({ success: true, data: services });
}

export async function createService(req: FastifyRequest, rep: FastifyReply) {
  const service = await adminRepo.createService(req.body);
  return rep.status(201).send({ success: true, data: service });
}

export async function updateService(req: FastifyRequest, rep: FastifyReply) {
  const { serviceId } = req.params as { serviceId: string };
  const service = await adminRepo.updateService(serviceId, req.body);
  return rep.send({ success: true, data: service });
}

export async function setServicePricing(req: FastifyRequest, rep: FastifyReply) {
  const { serviceId } = req.params as { serviceId: string };
  const { cityId, workerTier, ...data } = req.body as any;
  const pricing = await adminRepo.setPricing(serviceId, cityId, workerTier, data);
  return rep.send({ success: true, data: pricing });
}

export async function createCategory(req: FastifyRequest, rep: FastifyReply) {
  const category = await adminRepo.createCategory(req.body);
  return rep.status(201).send({ success: true, data: category });
}

export async function updateCategory(req: FastifyRequest, rep: FastifyReply) {
  const { categoryId } = req.params as { categoryId: string };
  const category = await adminRepo.updateCategory(categoryId, req.body);
  return rep.send({ success: true, data: category });
}

// ─── STAFF ───────────────────────────────────────────────────

export async function getStaff(_req: FastifyRequest, rep: FastifyReply) {
  const staff = await adminRepo.getStaff();
  return rep.send({ success: true, data: staff });
}

export async function createStaff(req: FastifyRequest, rep: FastifyReply) {
  const { password, ...data } = req.body as any;
  const passwordHash = await staffAuthService.hashPassword(password);
  const staff = await adminRepo.createStaff({ ...data, passwordHash });
  const { passwordHash: _, ...safeStaff } = staff as any;
  return rep.status(201).send({ success: true, data: safeStaff });
}

export async function updateStaff(req: FastifyRequest, rep: FastifyReply) {
  const { staffId } = req.params as { staffId: string };
  const staff = await adminRepo.updateStaff(staffId, req.body);
  return rep.send({ success: true, data: staff });
}

export async function deactivateStaff(req: FastifyRequest, rep: FastifyReply) {
  const { staffId } = req.params as { staffId: string };
  await adminRepo.deactivateStaff(staffId);
  return rep.send({ success: true, data: null });
}

// ─── APP VERSIONS ────────────────────────────────────────────

export async function getAppVersions(_req: FastifyRequest, rep: FastifyReply) {
  const versions = await adminRepo.getAppVersions();
  return rep.send({ success: true, data: versions });
}

export async function createAppVersion(req: FastifyRequest, rep: FastifyReply) {
  const version = await adminRepo.createAppVersion(req.body);
  return rep.status(201).send({ success: true, data: version });
}

// ─── CAMPAIGNS ───────────────────────────────────────────────

export async function getCampaigns(_req: FastifyRequest, rep: FastifyReply) {
  const campaigns = await adminRepo.getCampaigns();
  return rep.send({ success: true, data: campaigns });
}

export async function createCampaign(req: FastifyRequest, rep: FastifyReply) {
  const campaign = await adminRepo.createCampaign(req.body);
  return rep.status(201).send({ success: true, data: campaign });
}

export async function updateCampaignStatus(req: FastifyRequest, rep: FastifyReply) {
  const { campaignId } = req.params as { campaignId: string };
  const { status } = req.body as { status: string };
  const campaign = await adminRepo.updateCampaignStatus(campaignId, status);
  return rep.send({ success: true, data: campaign });
}

// ─── UNIFORM CHECKS ──────────────────────────────────────────

export async function getPendingUniformChecks(_req: FastifyRequest, rep: FastifyReply) {
  const checks = await adminRepo.getPendingUniformChecks();
  return rep.send({ success: true, data: checks });
}

export async function reviewUniformCheck(req: FastifyRequest, rep: FastifyReply) {
  const { checkId } = req.params as { checkId: string };
  const { result, note } = req.body as any;
  const check = await adminRepo.reviewUniformCheck(checkId, result, req.currentUser.id, note);
  return rep.send({ success: true, data: check });
}
