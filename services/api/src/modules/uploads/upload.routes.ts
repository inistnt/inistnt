import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../plugins/auth.middleware';
import { getPresignedUrl } from './upload.controller';

function wrap(fn: Function) {
  return async (req: any, rep: any) => {
    try { return await fn(req, rep); }
    catch (err: any) {
      if (err.statusCode) return rep.status(err.statusCode).send({ success: false, error: { code: err.code ?? 'ERROR', message: err.message } });
      throw err;
    }
  };
}

export async function uploadRoutes(server: FastifyInstance) {
  server.addHook('preHandler', authenticate);

  // POST /api/v1/uploads/presign
  server.post('/presign', {
    schema: {
      body: {
        type: 'object',
        required: ['uploadType', 'contentType'],
        properties: {
          uploadType:  { type: 'string' },
          contentType: { type: 'string' },
        },
      },
    },
  }, wrap(getPresignedUrl));
}
