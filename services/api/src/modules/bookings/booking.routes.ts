import type { FastifyInstance } from 'fastify';
import { requireUser, requireWorker } from '../../plugins/auth.middleware';
import {
  createBooking, getMyBookings, getActiveBooking, getBookingById,
  cancelBookingByUser, verifyEndOtp, rateBooking, triggerSosByUser, getBookingPhotos,
  getWorkerBookings, getWorkerActiveBooking,
  acceptBooking, markArrived, verifyStartOtp, cancelBookingByWorker,
  uploadBookingPhoto, triggerSosByWorker,
} from './booking.controller';

function wrap(fn: Function) {
  return async (req: any, rep: any) => {
    try { return await fn(req, rep); }
    catch (err: any) {
      if (err.statusCode) return rep.status(err.statusCode).send({ success: false, error: { code: err.code ?? 'ERROR', message: err.message } });
      throw err;
    }
  };
}

const cancelSchema = { schema: { body: { type: 'object', required: ['reason'], properties: { reason: { type: 'string', minLength: 5 } } } } };
const otpSchema    = { schema: { body: { type: 'object', required: ['otp'],    properties: { otp: { type: 'string', minLength: 4, maxLength: 4 } } } } };
const reviewSchema = { schema: { body: { type: 'object', required: ['rating'], properties: { rating: { type: 'integer', minimum: 1, maximum: 5 }, comment: { type: 'string', maxLength: 500 }, tags: { type: 'array', items: { type: 'string' } } } } } };
const photoSchema  = { schema: { body: { type: 'object', required: ['type', 'url'], properties: { type: { type: 'string', enum: ['before', 'after', 'evidence'] }, url: { type: 'string', format: 'uri' }, caption: { type: 'string' } } } } };

export async function bookingRoutes(server: FastifyInstance) {

  // ════════════════════════════════════════════════════════
  // USER ROUTES — /api/v1/bookings/...
  // ════════════════════════════════════════════════════════

  server.register(async (s) => {
    s.addHook('preHandler', requireUser);

    s.post('/', {
      schema: { body: { type: 'object', required: ['serviceId', 'cityId', 'addressId', 'lat', 'lng'],
        properties: { serviceId: { type: 'string' }, cityId: { type: 'string' }, areaId: { type: 'string' },
          addressId: { type: 'string' }, lat: { type: 'number' }, lng: { type: 'number' },
          type: { type: 'string', enum: ['INSTANT', 'SCHEDULED'] }, scheduledFor: { type: 'string' },
          couponCode: { type: 'string' }, userNotes: { type: 'string', maxLength: 500 } } } },
    }, wrap(createBooking));

    s.get('/',                        wrap(getMyBookings));
    s.get('/active',                  wrap(getActiveBooking));
    s.get('/:bookingId',              wrap(getBookingById));
    s.get('/:bookingId/photos',       wrap(getBookingPhotos));

    // User-specific actions
    s.post('/:bookingId/cancel',          cancelSchema, wrap(cancelBookingByUser));
    s.post('/:bookingId/verify-end-otp',  otpSchema,    wrap(verifyEndOtp));
    s.post('/:bookingId/review',          reviewSchema, wrap(rateBooking));
    s.post('/:bookingId/sos',                           wrap(triggerSosByUser));
  });

  // ════════════════════════════════════════════════════════
  // WORKER ROUTES — /api/v1/bookings/worker/...
  // Alag prefix taaki user routes se conflict na ho
  // ════════════════════════════════════════════════════════

  server.register(async (s) => {
    s.addHook('preHandler', requireWorker);

    s.get('/worker/list',              wrap(getWorkerBookings));
    s.get('/worker/active',            wrap(getWorkerActiveBooking));

    // Worker-specific actions — /worker/:bookingId/...
    s.post('/worker/:bookingId/accept',           wrap(acceptBooking));
    s.post('/worker/:bookingId/arrived',          wrap(markArrived));
    s.post('/worker/:bookingId/verify-start-otp', otpSchema,    wrap(verifyStartOtp));
    s.post('/worker/:bookingId/cancel',           cancelSchema, wrap(cancelBookingByWorker));
    s.post('/worker/:bookingId/photos',           photoSchema,  wrap(uploadBookingPhoto));
    s.post('/worker/:bookingId/sos',                            wrap(triggerSosByWorker));
  });
}
