import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../plugins/auth.middleware';
import { createOrder, verifyPayment, handleWebhook, getPaymentStatus } from './payment.controller';

function wrap(fn: Function) {
  return async (req: any, rep: any) => {
    try { return await fn(req, rep); }
    catch (err: any) {
      if (err.statusCode) return rep.status(err.statusCode).send({ success: false, error: { code: err.code ?? 'ERROR', message: err.message } });
      throw err;
    }
  };
}

export async function paymentRoutes(server: FastifyInstance) {

  // POST /api/v1/payments/create-order
  server.post('/create-order', {
    preHandler: requireUser,
    schema: { body: { type: 'object', required: ['bookingId'], properties: { bookingId: { type: 'string' } } } },
  }, wrap(createOrder));

  // POST /api/v1/payments/verify
  server.post('/verify', {
    preHandler: requireUser,
    schema: { body: { type: 'object', required: ['razorpayOrderId', 'razorpayPaymentId', 'razorpaySignature'],
      properties: { razorpayOrderId: { type: 'string' }, razorpayPaymentId: { type: 'string' }, razorpaySignature: { type: 'string' } } } },
  }, wrap(verifyPayment));

  // POST /api/v1/payments/webhook — Razorpay calls this directly (no auth)
  server.post('/webhook', wrap(handleWebhook));

  // GET /api/v1/payments/:bookingId
  server.get('/:bookingId', { preHandler: requireUser }, wrap(getPaymentStatus));
}
