import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { config } from './config';
import { db } from './infrastructure/database';
import { redis } from './infrastructure/redis';
import { kafka } from './infrastructure/kafka';

// ─── Route Modules ────────────────────────────────────────
import { authRoutes }      from './modules/auth/auth.routes';
import { userRoutes }      from './modules/users/user.routes';
import { workerRoutes }    from './modules/workers/worker.routes';
import { serviceRoutes }   from './modules/services/service.routes';
import { cityRoutes }      from './modules/geography/city.routes';
import { bookingRoutes }   from './modules/bookings/booking.routes';
import { paymentRoutes }   from './modules/payments/payment.routes';
import { adminRoutes }     from './modules/admin/admin.routes';
import { uploadRoutes }    from './modules/uploads/upload.routes';
import { analyticsRoutes } from './modules/analytics/analytics.routes';

// ─── Background Jobs ──────────────────────────────────────
import { startEsSyncConsumer }    from './jobs/es-sync/es-sync.consumer';
import { startAnalyticsConsumer } from './jobs/analytics-consumer/analytics.consumer';
import { startStaleBookingsCron } from './jobs/cron/stale-bookings.cron';

// ─── New: Post-Payment Handlers ───────────────────────────
import { startBookingCompletionHandler } from './jobs/post-payment/booking-completion.handler';
import { startUniformCheckHandler }      from './jobs/post-payment/uniform-check.handler';
import { locationWebSocket, startLocationPublisher } from './infrastructure/websocket';

// ─── New: Chat, Calls, Campaign ───────────────────────────
import { chatRoutes, chatWebSocket }     from './modules/chat/chat.routes';
import { callRoutes, webrtcSignaling }   from './modules/calls/webrtc-signaling';
import { superAdminRoutes }              from './modules/superadmin/superadmin.routes';
import { supportRoutes }                 from './modules/support/support.routes';
import { workerLoanRoutes }              from './modules/workers/worker-loan.routes';
import { adminLoanRoutes }               from './modules/workers/admin-loan.routes';
import { tdsRoutes }                     from './modules/workers/tds.routes';
import { trainingWorkerRoutes, trainingAdminRoutes } from './modules/training/training.routes';
import { workerPayoutRoutes, adminPayoutRoutes, webhookRoutes } from './modules/payout/payout.routes';
// ─── Core Features (Session: Core) ─────────────────────────────────
import { couponUserRoutes, couponAdminRoutes }     from './modules/coupons/coupon.routes';
import { referralUserRoutes, loyaltyUserRoutes, referralAdminRoutes, loyaltyAdminRoutes } from './modules/referral/referral-loyalty.routes';
import { trackingWorkerRoutes, trackingUserRoutes } from './modules/tracking/tracking.routes';
import { searchPublicRoutes, searchAdminRoutes }   from './modules/search/search.routes';
import { reviewUserRoutes, reviewWorkerRoutes, reviewAdminRoutes } from './modules/reviews/review.routes';
import { ensureIndices }   from './infrastructure/elasticsearch';
import { startCampaignScheduler }        from './modules/admin/campaign.service';
import { startSubscriptionRenewalCron }  from './jobs/cron/subscription-renewal.cron';
import { startPayoutRetryCron }          from './jobs/cron/payout-retry.cron';
import { startFraudDetectionConsumer }   from './jobs/fraud/fraud-detection.service';


// ─────────────────────────────────────────────────────────

const server = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    ...(config.NODE_ENV === 'development' && {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard' },
      },
    }),
  },
  trustProxy: true,
  ajv: {
    customOptions: {
      removeAdditional: 'all',
      coerceTypes: true,
      allErrors: false,
    },
  },
});

async function bootstrap() {
  try {

    // ─── Security ─────────────────────────────────────────
    await server.register(helmet, { contentSecurityPolicy: false });

    await server.register(cors, {
      origin:      config.ALLOWED_ORIGINS,
      credentials: true,
      methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });

    await server.register(cookie, { secret: config.JWT_REFRESH_SECRET });

    // ─── Rate Limiting ────────────────────────────────────
    await server.register(rateLimit, {
      global:      true,
      max:         config.RATE_LIMIT_MAX,
      timeWindow:  config.RATE_LIMIT_WINDOW_MS,
      redis:       redis,
      keyGenerator: (request) =>
        request.headers['x-forwarded-for'] as string || request.ip,
      errorResponseBuilder: () => ({
        success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Bahut zyada requests. Thodi der baad try karein.' },
      }),
    });

    // ─── File Upload ──────────────────────────────────────
    await server.register(multipart, {
      limits: { fileSize: 10 * 1024 * 1024, files: 5 },
    });

    // ─── WebSocket Support ────────────────────────────────
    await server.register(require('@fastify/websocket'));

    // ─── API Docs (Dev only) ──────────────────────────────
    if (config.NODE_ENV === 'development') {
      await server.register(swagger, {
        openapi: {
          info: { title: 'Inistnt API', description: 'Home services marketplace API', version: '1.0.0' },
          servers: [{ url: `http://localhost:${config.PORT}` }],
          components: {
            securitySchemes: {
              bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
            },
          },
        },
      });
      await server.register(swaggerUi, {
        routePrefix: '/docs',
        uiConfig:    { deepLinking: true },
      });
    }

    // ─── Global Error Handler ─────────────────────────────
    server.setErrorHandler((error, request, reply) => {
      server.log.error(error);

      if (error.validation) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Input validation failed', details: error.validation },
        });
      }

      if (error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
        return reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
      }

      if (error.statusCode === 429) {
        return reply.status(429).send({
          success: false,
          error: { code: 'RATE_LIMIT_EXCEEDED', message: error.message },
        });
      }

      const statusCode = error.statusCode || 500;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: statusCode === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
          message: config.NODE_ENV === 'production' && statusCode === 500
            ? 'Kuch galat hua. Support se sampark karein.'
            : error.message,
        },
      });
    });

    // ─── 404 Handler ──────────────────────────────────────
    server.setNotFoundHandler((request, reply) => {
      reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: `Route not found: ${request.url}` },
      });
    });

    // ─── Health Check ──────────────────────────────────────
    server.get('/health', async () => {
      const [dbOk, redisOk] = await Promise.allSettled([
        db.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
        redis.ping().then(() => true).catch(() => false),
      ]);
      return {
        status:  'ok',
        version: '1.0.0',
        uptime:  process.uptime(),
        services: {
          database: dbOk.status    === 'fulfilled' ? dbOk.value    : false,
          redis:    redisOk.status === 'fulfilled' ? redisOk.value : false,
        },
      };
    });

    // ─── Register Routes ──────────────────────────────────
    await server.register(authRoutes,      { prefix: '/api/v1/auth' });
    await server.register(userRoutes,      { prefix: '/api/v1/users' });
    await server.register(workerRoutes,    { prefix: '/api/v1/workers' });
    await server.register(serviceRoutes,   { prefix: '/api/v1/services' });
    await server.register(cityRoutes,      { prefix: '/api/v1/cities' });
    await server.register(bookingRoutes,   { prefix: '/api/v1/bookings' });
    await server.register(paymentRoutes,   { prefix: '/api/v1/payments' });
    await server.register(adminRoutes,     { prefix: '/api/v1/admin' });
    await server.register(uploadRoutes,    { prefix: '/api/v1/uploads' });
    await server.register(analyticsRoutes, { prefix: '/api/v1/analytics' });

    // ─── New: Chat, Calls ─────────────────────────────────
    await server.register(superAdminRoutes, { prefix: '/api/v1/superadmin' });
    await server.register(supportRoutes,    { prefix: '/api/v1/support' });
    await server.register(workerLoanRoutes, { prefix: '/api/v1/workers' });
    await server.register(adminLoanRoutes,  { prefix: '/api/v1/admin' });
    await server.register(tdsRoutes,        { prefix: '/api/v1/admin/finance' });
    await server.register(trainingWorkerRoutes, { prefix: '/api/v1/training' });
    await server.register(trainingAdminRoutes,  { prefix: '/api/v1/admin/training' });
    await server.register(workerPayoutRoutes,   { prefix: '/api/v1/workers' });
    await server.register(adminPayoutRoutes,    { prefix: '/api/v1/admin' });
    await server.register(webhookRoutes,        { prefix: '/api/v1/webhooks' });

    // ─── Core Features ────────────────────────────────────────────
    await server.register(couponUserRoutes,      { prefix: '/api/v1/coupons' });
    await server.register(couponAdminRoutes,     { prefix: '/api/v1/admin/coupons' });
    await server.register(referralUserRoutes,    { prefix: '/api/v1/referral' });
    await server.register(loyaltyUserRoutes,     { prefix: '/api/v1/loyalty' });
    await server.register(referralAdminRoutes,   { prefix: '/api/v1/admin/referrals' });
    await server.register(loyaltyAdminRoutes,    { prefix: '/api/v1/admin/loyalty' });
    await server.register(trackingWorkerRoutes,  { prefix: '/api/v1/tracking' });
    await server.register(trackingUserRoutes,    { prefix: '/api/v1/tracking' });
    await server.register(searchPublicRoutes,    { prefix: '/api/v1/search' });
    await server.register(searchAdminRoutes,     { prefix: '/api/v1/admin/search' });
    await server.register(reviewUserRoutes,      { prefix: '/api/v1/bookings' });
    await server.register(reviewWorkerRoutes,    { prefix: '/api/v1/workers' });
    await server.register(reviewAdminRoutes,     { prefix: '/api/v1/admin/reviews' });

    await server.register(chatRoutes,     { prefix: '/api/v1/chat' });
    await server.register(callRoutes,     { prefix: '/api/v1/calls' });

    // ─── New: WebSocket handlers ───────────────────────────
    await server.register(locationWebSocket);
    await server.register(chatWebSocket);
    await server.register(webrtcSignaling);

    // ─── Connect Infrastructure ────────────────────────────
    await db.$connect();
    server.log.info('✅ PostgreSQL connected');

    await kafka.connect();
    server.log.info('✅ Kafka connected');

    // ─── Start Background Jobs ─────────────────────────────
    // NOTE: Infrastructure connect hone ke BAAD start karo
    await startEsSyncConsumer();
    server.log.info('✅ Elasticsearch sync consumer started');

    await startAnalyticsConsumer();
    server.log.info('✅ Analytics (ClickHouse) consumer started');

    startStaleBookingsCron();
    server.log.info('✅ Stale bookings cron started');

    // ─── New: Post-Payment & WebSocket Services ───────────
    await startBookingCompletionHandler();
    server.log.info('✅ Booking completion handler started (wallet + loyalty + referral)');

    await startUniformCheckHandler();
    server.log.info('✅ Uniform check handler started');

    await startLocationPublisher();
    server.log.info('✅ Location publisher (Kafka → Redis → WebSocket) started');

    startCampaignScheduler();
    server.log.info('✅ Campaign scheduler started (checks every 60s for due campaigns)');

    startSubscriptionRenewalCron();
    server.log.info('✅ Subscription renewal cron started (daily 2 AM IST)');

    startPayoutRetryCron();
    server.log.info('✅ Payout retry cron started (every 30 minutes)');

    await startFraudDetectionConsumer();
    server.log.info('✅ Fraud detection consumer started');

    // Elasticsearch index setup (non-blocking)
    ensureIndices().catch(err =>
      server.log.warn({ err: err.message }, '⚠️  Elasticsearch unavailable — search will use Postgres fallback')
    );

    // ─── Start Server ──────────────────────────────────────
    await server.listen({ port: config.PORT, host: '0.0.0.0' });
    server.log.info(`🚀 Inistnt API running on http://localhost:${config.PORT}`);

    if (config.NODE_ENV === 'development') {
      server.log.info(`📚 API Docs: http://localhost:${config.PORT}/docs`);
    }

    // ─── Graceful Shutdown ─────────────────────────────────
    const shutdown = async (signal: string) => {
      server.log.info(`${signal} received — shutting down gracefully`);
      await server.close();
      await db.$disconnect();
      await redis.quit();
      await kafka.disconnect();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
}

bootstrap();
