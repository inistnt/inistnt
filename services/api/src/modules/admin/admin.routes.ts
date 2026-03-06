import type { FastifyInstance } from 'fastify';
import { requireStaff } from '../../plugins/auth.middleware';
import {
  getDashboard, getLiveOps,
  getUsers, suspendUser,
  getWorkers, verifyWorker, suspendWorker, changeWorkerTier,
  approveDocument, rejectDocument,
  getBookings, refundBooking,
  getDisputes, resolveDispute, addDisputeNote,
  getSosIncidents, resolveSos,
  getCommissionRules, createCommissionRule,
  activateSurge, deactivateSurge,
  getBanners, createBanner, updateBannerStatus,
  getCoupons, createCoupon, toggleCoupon,
  getPendingPayouts, processPayout,
  getFeatureFlags, toggleFeatureFlag,
  getAuditLogs,
  getCities, createCity, updateCity,
  getAreas, createArea, updateArea,
  getServicesAdmin, createService, updateService, setServicePricing,
  createCategory, updateCategory,
  getStaff, createStaff, updateStaff, deactivateStaff,
  getAppVersions, createAppVersion,
  getCampaigns, createCampaign, updateCampaignStatus,
  getPendingUniformChecks, reviewUniformCheck,
} from './admin.controller';

function wrap(fn: Function) {
  return async (req: any, rep: any) => {
    try { return await fn(req, rep); }
    catch (err: any) {
      if (err.statusCode) return rep.status(err.statusCode).send({ success: false, error: { code: err.code ?? 'ERROR', message: err.message } });
      throw err;
    }
  };
}

// Schemas
const reasonSchema  = { schema: { body: { type: 'object', required: ['reason'],     properties: { reason:     { type: 'string' } } } } };
const noteSchema    = { schema: { body: { type: 'object', required: ['note'],       properties: { note:       { type: 'string' } } } } };
const statusSchema  = { schema: { body: { type: 'object', required: ['status'],     properties: { status:     { type: 'string' } } } } };
const enableSchema  = { schema: { body: { type: 'object', required: ['isEnabled'],  properties: { isEnabled:  { type: 'boolean' } } } } };
const activeSchema  = { schema: { body: { type: 'object', required: ['isActive'],   properties: { isActive:   { type: 'boolean' } } } } };
const tierSchema    = { schema: { body: { type: 'object', required: ['tier'],       properties: { tier:       { type: 'string', enum: ['BASIC','SILVER','GOLD','PLATINUM'] } } } } };
const utrSchema     = { schema: { body: { type: 'object', required: ['utrNumber'],  properties: { utrNumber:  { type: 'string' } } } } };
const surgeSchema   = { schema: { body: { type: 'object', required: ['multiplier','reason'], properties: { multiplier: { type: 'number', minimum: 1.0, maximum: 3.0 }, reason: { type: 'string' }, deactivatesAt: { type: 'string' } } } } };
const uniformSchema = { schema: { body: { type: 'object', required: ['result'],     properties: { result: { type: 'string', enum: ['PASS','FAIL'] }, note: { type: 'string' } } } } };

export async function adminRoutes(server: FastifyInstance) {

  server.addHook('preHandler', requireStaff);

  // Dashboard
  server.get('/dashboard',  wrap(getDashboard));
  server.get('/live-ops',   wrap(getLiveOps));

  // Users
  server.get('/users',                   wrap(getUsers));
  server.post('/users/:userId/suspend',  reasonSchema, wrap(suspendUser));

  // Workers
  server.get('/workers',                         wrap(getWorkers));
  server.post('/workers/:workerId/verify',        wrap(verifyWorker));
  server.post('/workers/:workerId/suspend',       reasonSchema, wrap(suspendWorker));
  server.patch('/workers/:workerId/tier',         tierSchema,   wrap(changeWorkerTier));

  // Documents
  server.post('/documents/:documentId/approve',  wrap(approveDocument));
  server.post('/documents/:documentId/reject',   noteSchema, wrap(rejectDocument));

  // Bookings
  server.get('/bookings',                         wrap(getBookings));
  server.post('/bookings/:bookingId/refund', {
    schema: { body: { type: 'object', required: ['reason'], properties: { amount: { type: 'number' }, reason: { type: 'string' } } } },
  }, wrap(refundBooking));

  // Disputes
  server.get('/disputes',                           wrap(getDisputes));
  server.post('/disputes/:disputeId/resolve', {
    schema: { body: { type: 'object', required: ['resolution'], properties: { resolution: { type: 'string' }, refundAmount: { type: 'number' } } } },
  }, wrap(resolveDispute));
  server.post('/disputes/:disputeId/notes',         noteSchema, wrap(addDisputeNote));

  // SOS
  server.get('/sos',                   wrap(getSosIncidents));
  server.post('/sos/:sosId/resolve',   reasonSchema, wrap(resolveSos));

  // Commission
  server.get('/commission-rules',  wrap(getCommissionRules));
  server.post('/commission-rules', {
    schema: { body: { type: 'object', required: ['level','value'], properties: { level: { type: 'string', enum: ['NATIONAL','STATE','CITY','AREA','WORKER'] }, value: { type: 'number', minimum: 0, maximum: 50 }, cityId: { type: 'string' }, areaId: { type: 'string' }, workerId: { type: 'string' }, reason: { type: 'string' } } } },
  }, wrap(createCommissionRule));

  // Surge
  server.post('/cities/:cityId/surge/activate',    surgeSchema, wrap(activateSurge));
  server.post('/cities/:cityId/surge/deactivate',              wrap(deactivateSurge));

  // Banners
  server.get('/banners',                           wrap(getBanners));
  server.post('/banners', {
    schema: { body: { type: 'object', required: ['imageUrl'], properties: { title: { type: 'string' }, imageUrl: { type: 'string', format: 'uri' }, deepLink: { type: 'string' }, cityId: { type: 'string' }, sortOrder: { type: 'integer' } } } },
  }, wrap(createBanner));
  server.patch('/banners/:bannerId/status',        statusSchema, wrap(updateBannerStatus));

  // Coupons
  server.get('/coupons',  wrap(getCoupons));
  server.post('/coupons', {
    schema: { body: { type: 'object', required: ['code','discountType','discountValue','validFrom','validTo'], properties: { code: { type: 'string' }, discountType: { type: 'string', enum: ['percentage','flat'] }, discountValue: { type: 'number' }, maxDiscount: { type: 'number' }, minOrderAmount: { type: 'number' }, validFrom: { type: 'string' }, validTo: { type: 'string' } } } },
  }, wrap(createCoupon));
  server.patch('/coupons/:couponId/toggle',       activeSchema, wrap(toggleCoupon));

  // Payouts
  server.get('/payouts/pending',              wrap(getPendingPayouts));
  server.post('/payouts/:payoutId/process',   utrSchema, wrap(processPayout));

  // Feature Flags
  server.get('/feature-flags',         wrap(getFeatureFlags));
  server.patch('/feature-flags/:key',  enableSchema, wrap(toggleFeatureFlag));

  // Audit Logs
  server.get('/audit-logs', wrap(getAuditLogs));

  // Cities & Areas
  server.get('/cities',                    wrap(getCities));
  server.post('/cities', {
    schema: { body: { type: 'object', required: ['nameHi','nameEn','slug','stateId','lat','lng'], properties: { nameHi: { type: 'string' }, nameEn: { type: 'string' }, slug: { type: 'string' }, stateId: { type: 'string' }, lat: { type: 'number' }, lng: { type: 'number' } } } },
  }, wrap(createCity));
  server.patch('/cities/:cityId',          wrap(updateCity));
  server.get('/cities/:cityId/areas',      wrap(getAreas));
  server.post('/cities/:cityId/areas',     wrap(createArea));
  server.patch('/areas/:areaId',           wrap(updateArea));

  // Services & Categories
  server.get('/services',              wrap(getServicesAdmin));
  server.post('/services',             wrap(createService));
  server.patch('/services/:serviceId', wrap(updateService));
  server.post('/services/:serviceId/pricing', {
    schema: { body: { type: 'object', required: ['cityId','workerTier','basePrice'], properties: { cityId: { type: 'string' }, workerTier: { type: 'string' }, basePrice: { type: 'number' } } } },
  }, wrap(setServicePricing));
  server.post('/service-categories',                  wrap(createCategory));
  server.patch('/service-categories/:categoryId',     wrap(updateCategory));

  // Staff
  server.get('/staff',               wrap(getStaff));
  server.post('/staff', {
    schema: { body: { type: 'object', required: ['name','email','password','role'], properties: { name: { type: 'string' }, email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 8 }, role: { type: 'string' }, cityId: { type: 'string' } } } },
  }, wrap(createStaff));
  server.patch('/staff/:staffId',    wrap(updateStaff));
  server.delete('/staff/:staffId',   wrap(deactivateStaff));

  // App Versions
  server.get('/app-versions',  wrap(getAppVersions));
  server.post('/app-versions', {
    schema: { body: { type: 'object', required: ['platform','version','buildNumber'], properties: { platform: { type: 'string', enum: ['android','ios'] }, version: { type: 'string' }, buildNumber: { type: 'integer' }, isForceUpdate: { type: 'boolean' } } } },
  }, wrap(createAppVersion));

  // Campaigns
  server.get('/campaigns',                           wrap(getCampaigns));
  server.post('/campaigns',                          wrap(createCampaign));
  server.patch('/campaigns/:campaignId/status',      statusSchema, wrap(updateCampaignStatus));

  // Uniform Checks
  server.get('/uniform-checks/pending',              wrap(getPendingUniformChecks));
  server.post('/uniform-checks/:checkId/review',     uniformSchema, wrap(reviewUniformCheck));
}
