import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireStaff }          from '../../plugins/auth.middleware';
import { campaignService, emailTemplateService } from './campaign.service';

function wrap(fn: Function) {
  return async (req: any, rep: any) => {
    try { return await fn(req, rep); }
    catch (err: any) {
      if (err.statusCode) return rep.status(err.statusCode).send({ success: false, error: { code: err.code ?? 'ERROR', message: err.message } });
      throw err;
    }
  };
}

export async function campaignRoutes(server: FastifyInstance) {
  server.addHook('preHandler', requireStaff);

  // ══════════════════════════════════════════════════════════
  // CAMPAIGNS
  // ══════════════════════════════════════════════════════════

  // GET /api/v1/admin/campaigns
  server.get('/campaigns', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const { status, page = 1, limit = 20 } = req.query as any;
    const result = await campaignService.list({ status, page: +page, limit: +limit });
    return rep.send({ success: true, data: result.items, meta: { total: result.total, page: result.page, totalPages: result.totalPages } });
  }));

  // GET /api/v1/admin/campaigns/:id
  server.get('/campaigns/:id', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const { id } = req.params as { id: string };
    const campaign = await campaignService.getById(id);
    if (!campaign) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Campaign nahi mili.' } });
    return rep.send({ success: true, data: campaign });
  }));

  // POST /api/v1/admin/campaigns
  server.post('/campaigns', {
    schema: {
      body: {
        type: 'object',
        required: ['title', 'targetType', 'channels'],
        properties: {
          title:         { type: 'string', minLength: 3, maxLength: 100 },
          targetType:    { type: 'string', enum: ['all_users', 'all_workers', 'city', 'area', 'custom'] },
          cityId:        { type: 'string' },
          channels:      { type: 'array', items: { type: 'string', enum: ['PUSH', 'SMS', 'EMAIL'] }, minItems: 1 },
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
  }, wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const body = req.body as any;
    const campaign = await campaignService.create({
      ...body,
      scheduledAt:  body.scheduledAt ? new Date(body.scheduledAt) : undefined,
      createdById:  req.currentUser.id,
    });
    return rep.status(201).send({ success: true, data: campaign });
  }));

  // PATCH /api/v1/admin/campaigns/:id
  server.patch('/campaigns/:id', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const { id } = req.params as { id: string };
    const campaign = await campaignService.update(id, req.body as any);
    return rep.send({ success: true, data: campaign });
  }));

  // POST /api/v1/admin/campaigns/:id/approve
  server.post('/campaigns/:id/approve', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const { id } = req.params as { id: string };
    const campaign = await campaignService.approve(id, req.currentUser.id);
    return rep.send({ success: true, data: campaign });
  }));

  // POST /api/v1/admin/campaigns/:id/send
  server.post('/campaigns/:id/send', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const { id } = req.params as { id: string };
    const result = await campaignService.sendNow(id);
    return rep.send({ success: true, data: { message: `Campaign bhej diya. ${result.sentCount}/${result.audienceSize} recipients.`, ...result } });
  }));

  // POST /api/v1/admin/campaigns/:id/schedule
  server.post('/campaigns/:id/schedule', {
    schema: {
      body: {
        type:     'object',
        required: ['scheduledAt'],
        properties: { scheduledAt: { type: 'string' } },
      },
    },
  }, wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { scheduledAt } = req.body as any;
    const campaign = await campaignService.update(id, {
      status:      'SCHEDULED',
      scheduledAt: new Date(scheduledAt),
    });
    return rep.send({ success: true, data: { message: 'Campaign schedule ho gayi.', campaign } });
  }));

  // POST /api/v1/admin/campaigns/:id/cancel
  server.post('/campaigns/:id/cancel', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const { id } = req.params as { id: string };
    const campaign = await campaignService.cancel(id, req.currentUser.id);
    return rep.send({ success: true, data: campaign });
  }));

  // ══════════════════════════════════════════════════════════
  // EMAIL TEMPLATES
  // ══════════════════════════════════════════════════════════

  // GET /api/v1/admin/email-templates
  server.get('/email-templates', wrap(async (_req: FastifyRequest, rep: FastifyReply) => {
    const templates = await emailTemplateService.list();
    return rep.send({ success: true, data: templates });
  }));

  // GET /api/v1/admin/email-templates/:slug
  server.get('/email-templates/:slug', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const { slug } = req.params as { slug: string };
    const template = await emailTemplateService.getBySlug(slug);
    if (!template) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Template nahi mila.' } });
    return rep.send({ success: true, data: template });
  }));

  // POST /api/v1/admin/email-templates
  server.post('/email-templates', {
    schema: {
      body: {
        type:     'object',
        required: ['slug', 'nameEn', 'nameHi', 'subject', 'bodyHtml'],
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
  }, wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const body = req.body as any;
    const template = await emailTemplateService.create({ ...body, editedById: req.currentUser.id });
    return rep.status(201).send({ success: true, data: template });
  }));

  // PATCH /api/v1/admin/email-templates/:slug
  server.patch('/email-templates/:slug', wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const { slug } = req.params as { slug: string };
    const template = await emailTemplateService.update(slug, { ...req.body as any, editedById: req.currentUser.id });
    return rep.send({ success: true, data: template });
  }));

  // POST /api/v1/admin/email-templates/:slug/preview
  server.post('/email-templates/:slug/preview', {
    schema: {
      body: {
        type:       'object',
        properties: { variables: { type: 'object' } },
      },
    },
  }, wrap(async (req: FastifyRequest, rep: FastifyReply) => {
    const { slug } = req.params as { slug: string };
    const { variables = {} } = req.body as any;
    const preview = await emailTemplateService.preview(slug, variables);
    return rep.send({ success: true, data: preview });
  }));
}
