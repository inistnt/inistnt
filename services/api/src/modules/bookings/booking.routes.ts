import type { FastifyInstance } from 'fastify';
import { requireUser, requireWorker } from '../../plugins/auth.middleware';
import {
  createBooking, getMyBookings, getActiveBooking, getBookingById,
  cancelBookingByUser, verifyEndOtp, rateBooking, triggerSosByUser, getBookingPhotos,
  getWorkerBookings, getWorkerActiveBooking,
  acceptBooking, markArrived, verifyStartOtp, cancelBookingByWorker,
  uploadBookingPhoto, triggerSosByWorker, submitUniformCheck,
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

const cancelSchema  = { schema: { body: { type: 'object', required: ['reason'], properties: { reason: { type: 'string', minLength: 5 } } } } };
const otpSchema     = { schema: { body: { type: 'object', required: ['otp'],    properties: { otp: { type: 'string', minLength: 4, maxLength: 4 } } } } };
const reviewSchema  = { schema: { body: { type: 'object', required: ['rating'], properties: { rating: { type: 'integer', minimum: 1, maximum: 5 }, comment: { type: 'string', maxLength: 500 }, tags: { type: 'array', items: { type: 'string' } } } } } };
const photoSchema   = { schema: { body: { type: 'object', required: ['type', 'url'], properties: { type: { type: 'string', enum: ['before', 'after', 'evidence'] }, url: { type: 'string', format: 'uri' }, caption: { type: 'string' } } } } };

export async function bookingRoutes(server: FastifyInstance) {

  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  // USER ROUTES
  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

  server.register(async (s) => {
    s.addHook('preHandler', requireUser);

    s.post('/', {
      schema: { body: { type: 'object', required: ['serviceId', 'cityId', 'addressId', 'lat', 'lng'],
        properties: { serviceId: { type: 'string' }, cityId: { type: 'string' }, areaId: { type: 'string' }, addressId: { type: 'string' },
          lat: { type: 'number' }, lng: { type: 'number' }, type: { type: 'string', enum: ['INSTANT', 'SCHEDULED'] },
          scheduledFor: { type: 'string' }, couponCode: { type: 'string' }, userNotes: { type: 'string', maxLength: 500 },
          bookedHours: { type: 'integer', minimum: 1, maximum: 12 },
          redeemPoints: { type: 'boolean' } } } },
    }, wrap(createBooking));

    s.get('/',            wrap(getMyBookings));
    s.get('/active',      wrap(getActiveBooking));
    s.get('/:bookingId',  wrap(getBookingById));
    s.get('/:bookingId/photos', wrap(getBookingPhotos));

    s.post('/:bookingId/cancel',           cancelSchema, wrap(cancelBookingByUser));
    s.post('/:bookingId/verify-end-otp',   otpSchema,    wrap(verifyEndOtp));
    s.post('/:bookingId/review',           reviewSchema, wrap(rateBooking));
    s.post('/:bookingId/sos',                            wrap(triggerSosByUser));
  });

  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  // WORKER ROUTES
  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

  // Worker routes under /worker/* prefix to avoid clash with user routes
  server.register(async (s) => {
    s.addHook('preHandler', requireWorker);

    s.get('/list',   wrap(getWorkerBookings));
    s.get('/active', wrap(getWorkerActiveBooking));

    s.post('/:bookingId/accept',             wrap(acceptBooking));
    s.post('/:bookingId/arrived',            wrap(markArrived));
    s.post('/:bookingId/verify-start-otp',   otpSchema,    wrap(verifyStartOtp));
    s.post('/:bookingId/cancel',             cancelSchema, wrap(cancelBookingByWorker));
    s.post('/:bookingId/photos',             photoSchema,  wrap(uploadBookingPhoto));

    s.post('/:bookingId/sos',                              wrap(triggerSosByWorker));

    // POST /api/v1/bookings/worker/:bookingId/uniform-check
    s.post('/:bookingId/uniform-check', {
      schema: {
        body: {
          type: 'object', required: ['selfieUrl', 'lat', 'lng'],
          properties: {
            selfieUrl: { type: 'string', format: 'uri' },
            lat:       { type: 'number' },
            lng:       { type: 'number' },
          },
        },
      },
    }, wrap(submitUniformCheck));
  }, { prefix: '/worker' });
}
