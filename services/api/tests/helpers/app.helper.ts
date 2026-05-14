// ═══════════════════════════════════════════════════════════
// APP HELPER — Builds a minimal test Fastify app
// Uses real route handlers but MOCKED infrastructure
// No real DB / Redis / Kafka connections needed
// ═══════════════════════════════════════════════════════════

// All infrastructure is mocked BEFORE importing anything else
jest.mock('../../src/infrastructure/database', () => require('../mocks/database.mock'));
jest.mock('../../src/infrastructure/redis', () => require('../mocks/redis.mock'));
jest.mock('../../src/infrastructure/kafka', () => require('../mocks/kafka.mock'));

import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';

// Route modules
import { authRoutes }    from '../../src/modules/auth/auth.routes';
import { bookingRoutes } from '../../src/modules/bookings/booking.routes';
import { workerRoutes }  from '../../src/modules/workers/worker.routes';
import { serviceRoutes } from '../../src/modules/services/service.routes';
import { paymentRoutes } from '../../src/modules/payments/payment.routes';
import { cityRoutes }    from '../../src/modules/geography/city.routes';

function wrap(fn: Function) {
  return async (req: any, reply: any) => {
    try {
      return await fn(req, reply);
    } catch (err: any) {
      if (err.statusCode) {
        return reply.status(err.statusCode).send({
          success: false,
          error: { code: err.code ?? 'ERROR', message: err.message },
        });
      }
      throw err;
    }
  };
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    ajv: {
      customOptions: {
        removeAdditional: 'all',
        coerceTypes: true,
        allErrors: false,
      },
    },
  });

  // Plugins
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: '*', credentials: true });
  await app.register(cookie, { secret: process.env.JWT_REFRESH_SECRET ?? 'test_secret' });

  // Error handler
  app.setErrorHandler((error, _request, reply) => {
    if (error.validation) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Input validation failed', details: error.validation },
      });
    }
    const statusCode = (error as any).statusCode || 500;
    return reply.status(statusCode).send({
      success: false,
      error: {
        code: statusCode === 500 ? 'INTERNAL_ERROR' : ((error as any).code ?? 'REQUEST_ERROR'),
        message: error.message,
      },
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    version: '1.0.0',
    uptime: process.uptime(),
    services: { database: true, redis: true },
  }));

  // Routes
  await app.register(authRoutes,    { prefix: '/api/v1/auth' });
  await app.register(bookingRoutes, { prefix: '/api/v1/bookings' });
  await app.register(workerRoutes,  { prefix: '/api/v1/workers' });
  await app.register(serviceRoutes, { prefix: '/api/v1/services' });
  await app.register(paymentRoutes, { prefix: '/api/v1/payments' });
  await app.register(cityRoutes,    { prefix: '/api/v1/cities' });

  await app.ready();
  return app;
}
