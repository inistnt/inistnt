// ═══════════════════════════════════════════════════════════════════
// INISTNT — Admin Routes (RBAC + Scope enforced)
//
// Har route pe:
//   1. requireStaff   → JWT valid + staff type
//   2. injectScope    → cityId/areaId attach to request
//   3. requirePermission('perm') → granular check
//
// Controllers mein scope filtering automatic hoti hai
// getEffectiveCityId() se — City Manager sirf apna city dekhega
// ═══════════════════════════════════════════════════════════════════

import type { FastifyInstance } from 'fastify';
import { requireStaff, requirePermission } from '../../plugins/auth.middleware';
import { injectScope } from '../../plugins/scope.middleware';
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
  getIncentivePrograms, createIncentiveProgram, updateIncentiveProgram,
  toggleIncentiveProgram, getIncentiveProgramStats,
  getFraudFlags, reviewFraudFlag,
  sendBulkNotification, exportAnalytics,
} from './admin.controller';
import { campaignService, emailTemplateService } from './campaign.service';

function wrap(fn: Function) {
  return async (req: any, rep: any) => {
    try { return await fn(req, rep); }
    catch (err: any) {
      if (err.statusCode) return rep.status(err.statusCode).send({ success: false, error: { code: err.code ?? 'ERROR', message: err.message } });
      req.log?.error(err);
      return rep.status(500).send({ success: false, error: { code: 'SERVER_ERROR', message: 'Kuch gadbad ho gayi.' } });
    }
  };
}

// ─── Common preHandlers ────────────────────────────────────────────
// Base: requireStaff + injectScope (har route pe)
const base = [requireStaff, injectScope];

// Shorthand — base + permission
const perm = (p: string) => [...base, requirePermission(p as any)];

// ─── Schemas ──────────────────────────────────────────────────────
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

  // ─── DASHBOARD (view:analytics) ─────────────────────────────
  // City Manager ko sirf apne city ki stats milti hain
  server.get('/dashboard', { preHandler: perm('view:analytics') }, wrap(getDashboard));
  server.get('/live-ops',  { preHandler: perm('view:analytics') }, wrap(getLiveOps));

  // ─── USERS ──────────────────────────────────────────────────
  server.get('/users',
    { preHandler: perm('view:users') },
    wrap(getUsers));

  server.post('/users/:userId/suspend',
    { ...reasonSchema, preHandler: perm('suspend:users') },
    wrap(suspendUser));

  server.delete('/users/:userId',
    { preHandler: perm('delete:users') },
    wrap(async (req: any, rep: any) => {
      // Soft delete — future implementation
      return rep.status(501).send({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Abhi available nahi.' } });
    }));

  // ─── WORKERS ────────────────────────────────────────────────
  server.get('/workers',
    { preHandler: perm('view:workers') },
    wrap(getWorkers));

  server.post('/workers/:workerId/verify',
    { preHandler: perm('verify:workers') },
    wrap(verifyWorker));

  server.post('/workers/:workerId/suspend',
    { ...reasonSchema, preHandler: perm('suspend:workers') },
    wrap(suspendWorker));

  server.patch('/workers/:workerId/tier',
    { ...tierSchema, preHandler: perm('change:worker_tier') },
    wrap(changeWorkerTier));

  // ─── DOCUMENTS ──────────────────────────────────────────────
  server.post('/documents/:documentId/approve',
    { preHandler: perm('verify:workers') },
    wrap(approveDocument));

  server.post('/documents/:documentId/reject',
    { ...noteSchema, preHandler: perm('verify:workers') },
    wrap(rejectDocument));

  // ─── BOOKINGS ───────────────────────────────────────────────
  server.get('/bookings',
    { preHandler: perm('view:bookings') },
    wrap(getBookings));

  server.post('/bookings/:bookingId/refund', {
    preHandler: perm('refund:bookings'),
    schema: { body: { type: 'object', required: ['reason'], properties: { amount: { type: 'number' }, reason: { type: 'string' } } } },
  }, wrap(refundBooking));

  // ─── DISPUTES ───────────────────────────────────────────────
  server.get('/disputes',
    { preHandler: perm('view:disputes') },
    wrap(getDisputes));

  server.post('/disputes/:disputeId/resolve', {
    preHandler: perm('manage:disputes'),
    schema: { body: { type: 'object', required: ['resolution'], properties: { resolution: { type: 'string' }, refundAmount: { type: 'number' } } } },
  }, wrap(resolveDispute));

  server.post('/disputes/:disputeId/notes',
    { ...noteSchema, preHandler: perm('manage:disputes') },
    wrap(addDisputeNote));

  // ─── SOS ────────────────────────────────────────────────────
  server.get('/sos',
    { preHandler: perm('view:sos') },
    wrap(getSosIncidents));

  server.post('/sos/:sosId/resolve',
    { ...reasonSchema, preHandler: perm('resolve:sos') },
    wrap(resolveSos));

  // ─── COMMISSION ─────────────────────────────────────────────
  // City Managers commission rules dekh sakte hain
  // Sirf Finance Admin + Super Admin create kar sakte hain
  server.get('/commission-rules',
    { preHandler: perm('view:finance') },
    wrap(getCommissionRules));

  server.post('/commission-rules', {
    preHandler: perm('manage:commission'),
    schema: {
      body: {
        type: 'object', required: ['level','value'],
        properties: {
          level:    { type: 'string', enum: ['NATIONAL','STATE','CITY','AREA','WORKER'] },
          value:    { type: 'number', minimum: 0, maximum: 50 },
          cityId:   { type: 'string' },
          areaId:   { type: 'string' },
          workerId: { type: 'string' },
          reason:   { type: 'string' },
        },
      },
    },
  }, wrap(createCommissionRule));

  // ─── SURGE PRICING ──────────────────────────────────────────
  // City Managers apne city ka surge activate kar sakte hain
  server.post('/cities/:cityId/surge/activate',
    { ...surgeSchema, preHandler: perm('manage:surge') },
    wrap(activateSurge));

  server.post('/cities/:cityId/surge/deactivate',
    { preHandler: perm('manage:surge') },
    wrap(deactivateSurge));

  // ─── BANNERS ────────────────────────────────────────────────
  server.get('/banners',
    { preHandler: perm('manage:banners') },
    wrap(getBanners));

  server.post('/banners', {
    preHandler: perm('manage:banners'),
    schema: {
      body: {
        type: 'object', required: ['imageUrl'],
        properties: {
          title:     { type: 'string' },
          imageUrl:  { type: 'string', format: 'uri' },
          deepLink:  { type: 'string' },
          cityId:    { type: 'string' },
          sortOrder: { type: 'integer' },
        },
      },
    },
  }, wrap(createBanner));

  server.patch('/banners/:bannerId/status',
    { ...statusSchema, preHandler: perm('manage:banners') },
    wrap(updateBannerStatus));

  // ─── COUPONS ────────────────────────────────────────────────
  server.get('/coupons',
    { preHandler: perm('view:coupons') },
    wrap(getCoupons));

  server.post('/coupons', {
    preHandler: perm('manage:coupons'),
    schema: {
      body: {
        type: 'object', required: ['code','discountType','discountValue','validFrom','validTo'],
        properties: {
          code:           { type: 'string' },
          discountType:   { type: 'string', enum: ['percentage','flat'] },
          discountValue:  { type: 'number' },
          maxDiscount:    { type: 'number' },
          minOrderAmount: { type: 'number' },
          validFrom:      { type: 'string' },
          validTo:        { type: 'string' },
        },
      },
    },
  }, wrap(createCoupon));

  server.patch('/coupons/:couponId/toggle',
    { ...activeSchema, preHandler: perm('manage:coupons') },
    wrap(toggleCoupon));

  // ─── PAYOUTS ────────────────────────────────────────────────
  server.get('/payouts/pending',
    { preHandler: perm('manage:payouts') },
    wrap(getPendingPayouts));

  server.post('/payouts/:payoutId/process',
    { ...utrSchema, preHandler: perm('approve:payouts') },
    wrap(processPayout));

  // ─── FEATURE FLAGS ──────────────────────────────────────────
  // Only Tech Admin + Super Admin
  server.get('/feature-flags',
    { preHandler: perm('manage:feature_flags') },
    wrap(getFeatureFlags));

  server.patch('/feature-flags/:key',
    { ...enableSchema, preHandler: perm('manage:feature_flags') },
    wrap(toggleFeatureFlag));

  // ─── AUDIT LOGS ─────────────────────────────────────────────
  // Only QA Analyst, Finance Admin, Super Admin
  server.get('/audit-logs',
    { preHandler: perm('view:audit_logs') },
    wrap(getAuditLogs));

  // ─── CITIES & AREAS ─────────────────────────────────────────
  // City Managers apni city dekh sakte hain — controller mein filter hoga
  server.get('/cities',
    { preHandler: perm('view:geography') },
    wrap(getCities));

  server.post('/cities', {
    preHandler: perm('manage:geography'),
    schema: {
      body: {
        type: 'object', required: ['nameHi','nameEn','slug','stateId','lat','lng'],
        properties: {
          nameHi:  { type: 'string' }, nameEn:  { type: 'string' },
          slug:    { type: 'string' }, stateId: { type: 'string' },
          lat:     { type: 'number' }, lng:     { type: 'number' },
        },
      },
    },
  }, wrap(createCity));

  server.patch('/cities/:cityId',
    { preHandler: perm('manage:geography') },
    wrap(updateCity));

  server.get('/cities/:cityId/areas',
    { preHandler: perm('view:geography') },
    wrap(getAreas));

  server.post('/cities/:cityId/areas',
    { preHandler: perm('manage:geography') },
    wrap(createArea));

  server.patch('/areas/:areaId',
    { preHandler: perm('manage:geography') },
    wrap(updateArea));

  // ─── SERVICES & CATEGORIES ──────────────────────────────────
  // Only SA, Tech Admin, State Manager — national level config
  server.get('/services',
    { preHandler: perm('manage:services') },
    wrap(getServicesAdmin));

  server.post('/services',
    { preHandler: perm('manage:services') },
    wrap(createService));

  server.patch('/services/:serviceId',
    { preHandler: perm('manage:services') },
    wrap(updateService));

  server.post('/services/:serviceId/pricing', {
    preHandler: perm('manage:pricing'),
    schema: {
      body: {
        type: 'object', required: ['cityId','workerTier','basePrice'],
        properties: {
          cityId:     { type: 'string' },
          workerTier: { type: 'string' },
          basePrice:  { type: 'number' },
        },
      },
    },
  }, wrap(setServicePricing));

  server.post('/service-categories',
    { preHandler: perm('manage:services') },
    wrap(createCategory));

  server.patch('/service-categories/:categoryId',
    { preHandler: perm('manage:services') },
    wrap(updateCategory));

  // ─── STAFF (non-SuperAdmin creation) ────────────────────────
  // Note: SuperAdmin staff management is at /superadmin/staff
  // Ye routes State/City managers ke liye field agents create karne ke liye
  server.get('/staff',
    { preHandler: perm('view:staff') },
    wrap(getStaff));

  server.post('/staff', {
    preHandler: perm('invite:staff'),
    schema: {
      body: {
        type: 'object', required: ['name','email','password','role'],
        properties: {
          name:     { type: 'string' },
          email:    { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          role:     { type: 'string', enum: ['AREA_MANAGER','SUPPORT_AGENT','FIELD_SUPERVISOR','QA_ANALYST'] },
          cityId:   { type: 'string' },
          areaId:   { type: 'string' },
        },
      },
    },
  }, wrap(createStaff));

  server.patch('/staff/:staffId',
    { preHandler: perm('manage:staff') },
    wrap(updateStaff));

  server.delete('/staff/:staffId',
    { preHandler: perm('manage:staff') },
    wrap(deactivateStaff));

  // ─── APP VERSIONS ───────────────────────────────────────────
  server.get('/app-versions',
    { preHandler: perm('manage:app_versions') },
    wrap(getAppVersions));

  server.post('/app-versions', {
    preHandler: perm('manage:app_versions'),
    schema: {
      body: {
        type: 'object', required: ['platform','version','buildNumber'],
        properties: {
          platform:    { type: 'string', enum: ['android','ios'] },
          version:     { type: 'string' },
          buildNumber: { type: 'integer' },
          isForceUpdate: { type: 'boolean' },
        },
      },
    },
  }, wrap(createAppVersion));

  // ─── CAMPAIGNS ──────────────────────────────────────────────
  server.get('/campaigns',
    { preHandler: perm('view:campaigns') },
    wrap(getCampaigns));

  server.post('/campaigns', {
    preHandler: perm('manage:campaigns'),
    schema: {
      body: {
        type: 'object', required: ['title','targetType','channels'],
        properties: {
          title:         { type: 'string', minLength: 3, maxLength: 100 },
          targetType:    { type: 'string', enum: ['all_users','all_workers','city','area','custom'] },
          cityId:        { type: 'string' },
          channels:      { type: 'array', items: { type: 'string', enum: ['PUSH','SMS','EMAIL'] }, minItems: 1 },
          pushTitle:     { type: 'string', maxLength: 100 },
          pushBody:      { type: 'string', maxLength: 300 },
          smsText:       { type: 'string', maxLength: 160 },
          emailSubject:  { type: 'string', maxLength: 200 },
          emailBodyHtml: { type: 'string' },
          deepLink:      { type: 'string' },
          scheduledAt:   { type: 'string' },
        },
      },
    },
  }, wrap(async (req: any, rep: any) => {
    const campaign = await campaignService.create({ ...req.body, createdById: req.currentUser.id });
    return rep.status(201).send({ success: true, data: campaign });
  }));

  server.get('/campaigns/:id',
    { preHandler: perm('view:campaigns') },
    wrap(async (req: any, rep: any) => {
      const campaign = await campaignService.getById(req.params.id);
      if (!campaign) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Campaign nahi mili.' } });
      return rep.send({ success: true, data: campaign });
    }));

  server.patch('/campaigns/:id',
    { preHandler: perm('manage:campaigns') },
    wrap(async (req: any, rep: any) => {
      const campaign = await campaignService.update(req.params.id, req.body);
      return rep.send({ success: true, data: campaign });
    }));

  server.patch('/campaigns/:campaignId/status',
    { ...statusSchema, preHandler: perm('manage:campaigns') },
    wrap(updateCampaignStatus));

  // Approve: Marketing Manager + State Manager + SA
  server.post('/campaigns/:id/approve',
    { preHandler: perm('approve:campaigns') },
    wrap(async (req: any, rep: any) => {
      const campaign = await campaignService.approve(req.params.id, req.currentUser.id);
      return rep.send({ success: true, data: campaign });
    }));

  server.post('/campaigns/:id/send',
    { preHandler: perm('manage:campaigns') },
    wrap(async (req: any, rep: any) => {
      const result = await campaignService.sendNow(req.params.id);
      return rep.send({ success: true, data: { message: `Campaign bhej diya. ${result.sentCount}/${result.audienceSize} recipients.`, ...result } });
    }));

  server.post('/campaigns/:id/schedule', {
    preHandler: perm('manage:campaigns'),
    schema: { body: { type: 'object', required: ['scheduledAt'], properties: { scheduledAt: { type: 'string' } } } },
  }, wrap(async (req: any, rep: any) => {
    const campaign = await campaignService.update(req.params.id, { status: 'SCHEDULED', scheduledAt: new Date((req.body as any).scheduledAt) });
    return rep.send({ success: true, data: { message: 'Campaign schedule ho gayi.', campaign } });
  }));

  server.post('/campaigns/:id/cancel',
    { preHandler: perm('manage:campaigns') },
    wrap(async (req: any, rep: any) => {
      const campaign = await campaignService.cancel(req.params.id, req.currentUser.id);
      return rep.send({ success: true, data: campaign });
    }));

  // ─── EMAIL TEMPLATES ────────────────────────────────────────
  server.get('/email-templates',
    { preHandler: perm('view:campaigns') },
    wrap(async (_req: any, rep: any) => {
      return rep.send({ success: true, data: await emailTemplateService.list() });
    }));

  server.get('/email-templates/:slug',
    { preHandler: perm('view:campaigns') },
    wrap(async (req: any, rep: any) => {
      const t = await emailTemplateService.getBySlug(req.params.slug);
      if (!t) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Template nahi mila.' } });
      return rep.send({ success: true, data: t });
    }));

  server.post('/email-templates', {
    preHandler: perm('manage:campaigns'),
    schema: {
      body: {
        type: 'object', required: ['slug','nameEn','nameHi','subject','bodyHtml'],
        properties: {
          slug:      { type: 'string', pattern: '^[a-z0-9_]+$' },
          nameEn:    { type: 'string' },
          nameHi:    { type: 'string' },
          subject:   { type: 'string' },
          bodyHtml:  { type: 'string' },
          variables: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  }, wrap(async (req: any, rep: any) => {
    const t = await emailTemplateService.create({ ...req.body as any, editedById: req.currentUser.id });
    return rep.status(201).send({ success: true, data: t });
  }));

  server.patch('/email-templates/:slug',
    { preHandler: perm('manage:campaigns') },
    wrap(async (req: any, rep: any) => {
      const t = await emailTemplateService.update(req.params.slug, { ...req.body as any, editedById: req.currentUser.id });
      return rep.send({ success: true, data: t });
    }));

  server.post('/email-templates/:slug/preview',
    { preHandler: perm('view:campaigns') },
    wrap(async (req: any, rep: any) => {
      const preview = await emailTemplateService.preview(req.params.slug, (req.body as any)?.variables ?? {});
      return rep.send({ success: true, data: preview });
    }));

  // ─── UNIFORM CHECKS ─────────────────────────────────────────
  server.get('/uniform-checks/pending',
    { preHandler: perm('view:uniform_checks') },
    wrap(getPendingUniformChecks));

  server.post('/uniform-checks/:checkId/review',
    { ...uniformSchema, preHandler: perm('review:uniform_checks') },
    wrap(reviewUniformCheck));

  // ─── INCENTIVE PROGRAMS ─────────────────────────────────────
  server.get('/incentive-programs',
    { preHandler: perm('view:analytics') },
    wrap(getIncentivePrograms));

  server.post('/incentive-programs',
    { preHandler: perm('manage:campaigns') },
    wrap(createIncentiveProgram));

  server.patch('/incentive-programs/:programId',
    { preHandler: perm('manage:campaigns') },
    wrap(updateIncentiveProgram));

  server.patch('/incentive-programs/:programId/toggle',
    { ...activeSchema, preHandler: perm('manage:campaigns') },
    wrap(toggleIncentiveProgram));

  server.get('/incentive-programs/:programId/stats',
    { preHandler: perm('view:analytics') },
    wrap(getIncentiveProgramStats));

  // ─── FRAUD FLAGS ─────────────────────────────────────────────
  server.get('/fraud-flags',
    { preHandler: perm('view:users') },
    wrap(getFraudFlags));

  server.post('/fraud-flags/:flagId/review',
    { preHandler: perm('manage:users') },
    wrap(reviewFraudFlag));

  // ─── BULK NOTIFICATIONS ──────────────────────────────────────
  server.post('/notifications/bulk',
    { preHandler: perm('manage:campaigns') },
    wrap(sendBulkNotification));

  // ─── ANALYTICS EXPORT ────────────────────────────────────────
  server.post('/analytics/export',
    { preHandler: perm('view:analytics') },
    wrap(exportAnalytics));
}
