import type { FastifyRequest, FastifyReply } from 'fastify';
import { paymentService } from './payment.service';

export async function createOrder(req: FastifyRequest, rep: FastifyReply) {
  const { bookingId } = req.body as { bookingId: string };
  const order = await paymentService.createOrder(bookingId, req.currentUser.id);
  return rep.send({ success: true, data: order });
}

export async function verifyPayment(req: FastifyRequest, rep: FastifyReply) {
  const payment = await paymentService.verifyPayment(req.body as any);
  return rep.send({ success: true, data: { message: 'Payment successful!', payment } });
}

export async function handleWebhook(req: FastifyRequest, rep: FastifyReply) {
  const signature = req.headers['x-razorpay-signature'] as string;
  if (!signature) return rep.status(400).send({ success: false, error: { code: 'NO_SIGNATURE' } });
  const body = JSON.stringify(req.body);
  const result = await paymentService.handleWebhook(body, signature);
  return rep.send(result);
}

export async function getPaymentStatus(req: FastifyRequest, rep: FastifyReply) {
  const { bookingId } = req.params as { bookingId: string };
  const payment = await paymentService.getByBookingId(bookingId);
  if (!payment) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Payment nahi mili.' } });
  return rep.send({ success: true, data: payment });
}
