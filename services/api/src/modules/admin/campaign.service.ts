// ═══════════════════════════════════════════════════════════════════
// INISTNT — Campaign Service
// Email sending: Resend (via src/infrastructure/email.service.ts)
//
// Features:
//   - Campaign CRUD (admin)
//   - Email template management
//   - Send now / Schedule
//   - Audience targeting (all_users, all_workers, city, area)
//   - Variable substitution: {{name}}, {{bookingId}} etc.
// ═══════════════════════════════════════════════════════════════════

import { db }     from '../../infrastructure/database';
import { logger } from '../../config/logger';
import {
  sendEmail,
  sendBatchEmails,
  renderTemplate,
} from '../../infrastructure/email.service';

export const campaignService = {

  // ── Create campaign ─────────────────────────────────────────
  create: async (data: {
    title:         string;
    targetType:    string;
    cityId?:       string;
    channels:      string[];
    pushTitle?:    string;
    pushBody?:     string;
    smsText?:      string;
    emailSubject?: string;
    emailBodyHtml?: string;
    deepLink?:     string;
    scheduledAt?:  Date;
    createdById:   string;
  }) => {
    return db.campaign.create({ data: data as any });
  },

  // ── List campaigns ──────────────────────────────────────────
  list: async (params?: { status?: string; page?: number; limit?: number }) => {
    const { status, page = 1, limit = 20 } = params ?? {};
    const where: any = {};
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      db.campaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
        include: { city: { select: { nameEn: true } } },
      }),
      db.campaign.count({ where }),
    ]);

    return { items, total, page, totalPages: Math.ceil(total / limit) };
  },

  // ── Get by id ───────────────────────────────────────────────
  getById: async (id: string) => {
    return db.campaign.findUnique({ where: { id }, include: { city: { select: { nameEn: true } } } });
  },

  // ── Update ──────────────────────────────────────────────────
  update: async (id: string, data: Record<string, any>) => {
    return db.campaign.update({ where: { id }, data });
  },

  // ── Cancel ──────────────────────────────────────────────────
  cancel: async (id: string, cancelledById: string) => {
    return db.campaign.update({
      where: { id },
      data:  { status: 'CANCELLED' as any, cancelledById },
    });
  },

  // ── Approve ─────────────────────────────────────────────────
  approve: async (id: string, approvedById: string) => {
    return db.campaign.update({
      where: { id },
      data:  { status: 'APPROVED' as any, approvedById, approvedAt: new Date() },
    });
  },

  // ── Send campaign NOW ───────────────────────────────────────
  sendNow: async (campaignId: string) => {
    const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw { statusCode: 404, message: 'Campaign nahi mili.' };
    if (!['APPROVED', 'SCHEDULED'].includes(campaign.status)) {
      throw { statusCode: 400, message: 'Sirf APPROVED ya SCHEDULED campaigns send ho sakti hain.' };
    }

    // Resolve audience
    const audience = await campaignService.resolveAudience(campaign);
    logger.info({ campaignId, audienceSize: audience.length }, '[Campaign] Sending to audience');

    let sentCount = 0;
    const batchSize = 50;

    for (let i = 0; i < audience.length; i += batchSize) {
      const batch = audience.slice(i, i + batchSize);

      await Promise.allSettled(batch.map(async (recipient) => {
        const variables: Record<string, string> = {
          name:   recipient.name ?? 'Valued Customer',
          mobile: recipient.mobile,
        };

        // Email channel
        if (campaign.channels.includes('EMAIL') && recipient.email && campaign.emailSubject && campaign.emailBodyHtml) {
          const sent = await sendEmail({
            to:         recipient.email,
            subject:    renderTemplate(campaign.emailSubject, variables),
            htmlBody:   campaign.emailBodyHtml,
            variables,
          });
          if (sent) sentCount++;
        }

        // Push / SMS handled by notification-service via Kafka
        // (already has NOTIFICATION_SEND consumer)
      }));
    }

    // Update campaign stats
    await db.campaign.update({
      where: { id: campaignId },
      data: {
        status:    'SENT' as any,
        sentAt:    new Date(),
        sentCount,
        audienceSize: audience.length,
      },
    });

    return { sentCount, audienceSize: audience.length };
  },

  // ── Resolve audience list ───────────────────────────────────
  resolveAudience: async (campaign: any): Promise<Array<{
    name?: string; mobile: string; email?: string;
  }>> => {
    if (campaign.targetType === 'all_users') {
      return db.user.findMany({
        where:  { status: 'ACTIVE' },
        select: { name: true, mobile: true, email: true },
      }) as any;
    }

    if (campaign.targetType === 'all_workers') {
      return db.worker.findMany({
        where:  { status: 'VERIFIED' },
        select: { name: true, mobile: true, email: true },
      }) as any;
    }

    if (campaign.targetType === 'city' && campaign.cityId) {
      return db.user.findMany({
        where: {
          status: 'ACTIVE',
          addresses: { some: { cityId: campaign.cityId } },
        },
        select: { name: true, mobile: true, email: true },
      }) as any;
    }

    // Custom — return empty (admin should use batch upload endpoint)
    return [];
  },
};

// ─── Email Template service ────────────────────────────────────────
export const emailTemplateService = {

  list: async () => {
    return db.emailTemplate.findMany({ orderBy: { slug: 'asc' } });
  },

  getBySlug: async (slug: string) => {
    return db.emailTemplate.findUnique({ where: { slug } });
  },

  create: async (data: {
    slug:      string;
    nameHi:    string;
    nameEn:    string;
    subject:   string;
    bodyHtml:  string;
    variables: string[];
    editedById?: string;
  }) => {
    return db.emailTemplate.create({ data: { ...data, lastEditedAt: new Date() } });
  },

  update: async (slug: string, data: Record<string, any>) => {
    return db.emailTemplate.update({
      where: { slug },
      data:  { ...data, lastEditedAt: new Date() },
    });
  },

  // Preview template with sample variables
  preview: async (slug: string, variables: Record<string, string>) => {
    const template = await db.emailTemplate.findUnique({ where: { slug } });
    if (!template) throw { statusCode: 404, message: 'Template nahi mila.' };
    return {
      subject: renderTemplate(template.subject, variables),
      bodyHtml: renderTemplate(template.bodyHtml, variables),
    };
  },
};

// ─── Campaign Scheduler (cron-based) ──────────────────────────────
// Call this on server start — checks every minute for due campaigns
export function startCampaignScheduler() {
  const CHECK_INTERVAL_MS = 60_000;

  const checkScheduled = async () => {
    try {
      const due = await db.campaign.findMany({
        where: {
          status:      'SCHEDULED' as any,
          scheduledAt: { lte: new Date() },
        },
        take: 5, // Process max 5 per tick to avoid overload
      });

      for (const campaign of due) {
        logger.info({ campaignId: campaign.id }, '[CampaignScheduler] Firing scheduled campaign');
        await campaignService.sendNow(campaign.id).catch((err: Error) => {
          logger.error({ err: err.message, campaignId: campaign.id }, '[CampaignScheduler] Send failed');
          db.campaign.update({
            where: { id: campaign.id },
            data:  { status: 'FAILED' as any },
          }).catch(() => {});
        });
      }
    } catch (err: any) {
      logger.error({ err: err.message }, '[CampaignScheduler] Check failed');
    }
  };


// ─── Transactional email functions ────────────────────────────────
// These are now in src/infrastructure/email.service.ts
// Re-export for backward compatibility with existing imports
export {
  sendBookingConfirmedEmail,
  sendWorkerAssignedEmail,
  sendBookingCompletedEmail,
  sendWelcomeEmail,
  sendDisputeRaisedEmail,
  sendPayoutProcessedEmail,
} from '../../infrastructure/email.service';
