// ═══════════════════════════════════════════════════════════
// UNIT TESTS — bookingService.cancel & bookingService.rateBooking
// ═══════════════════════════════════════════════════════════

jest.mock('../../../src/infrastructure/database', () => require('../../mocks/database.mock'));
jest.mock('../../../src/infrastructure/redis', () => require('../../mocks/redis.mock'));
jest.mock('../../../src/infrastructure/kafka', () => require('../../mocks/kafka.mock'));
jest.mock('../../../src/modules/services/service.repository', () => ({
  serviceRepo: { getSurgMultiplier: jest.fn().mockResolvedValue(1.0) },
}));

import { bookingService } from '../../../src/modules/bookings/booking.service';
import { db } from '../../mocks/database.mock';
import { mockKafka } from '../../mocks/kafka.mock';
import { makeBooking } from '../../fixtures';

beforeEach(() => {
  jest.clearAllMocks();
  mockKafka.clear();
});

// ─── CANCEL ────────────────────────────────────────────────

describe('bookingService.cancel', () => {
  it('throws 404 when booking does not exist', async () => {
    (db.booking.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      bookingService.cancel('fake-id', 'reason', 'user-1', 'user'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  const cancellableStatuses = ['PENDING', 'SEARCHING', 'ASSIGNED', 'WORKER_ACCEPTED', 'WORKER_ON_WAY'];
  cancellableStatuses.forEach((status) => {
    it(`cancels booking with status ${status}`, async () => {
      const booking = makeBooking('user-1', { id: 'bk-1', status });
      (db.booking.findUnique as jest.Mock).mockResolvedValue(booking);
      (db.booking.update as jest.Mock).mockResolvedValue({ ...booking, status: 'CANCELLED' });
      (db.bookingStatusHistory.create as jest.Mock).mockResolvedValue({});

      const result = await bookingService.cancel('bk-1', 'changed mind', 'user-1', 'user');
      expect(result).toBeDefined();
    });
  });

  const nonCancellableStatuses = ['COMPLETED', 'WORK_COMPLETED', 'WORKER_ARRIVED', 'IN_PROGRESS'];
  nonCancellableStatuses.forEach((status) => {
    it(`throws 400 CANNOT_CANCEL for status ${status}`, async () => {
      const booking = makeBooking('user-1', { id: 'bk-1', status });
      (db.booking.findUnique as jest.Mock).mockResolvedValue(booking);

      await expect(
        bookingService.cancel('bk-1', 'reason', 'user-1', 'user'),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'CANNOT_CANCEL',
      });
    });
  });

  it('publishes BOOKING_CANCELLED Kafka event on success', async () => {
    const booking = makeBooking('user-1', { id: 'bk-cancel', status: 'SEARCHING' });
    (db.booking.findUnique as jest.Mock).mockResolvedValue(booking);
    (db.booking.update as jest.Mock).mockResolvedValue({ ...booking, status: 'CANCELLED' });
    (db.bookingStatusHistory.create as jest.Mock).mockResolvedValue({});

    await bookingService.cancel('bk-cancel', 'user changed mind', 'user-1', 'user');

    const events = mockKafka.getPublishedByTopic('booking.cancelled');
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({
      bookingId: 'bk-cancel',
      reason: 'user changed mind',
    });
  });
});

// ─── RATE BOOKING ──────────────────────────────────────────

describe('bookingService.rateBooking', () => {
  it('throws 404 when booking not found', async () => {
    (db.booking.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      bookingService.rateBooking('bk-x', 'user-1', 5),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 403 when user does not own the booking', async () => {
    const booking = makeBooking('user-2', { id: 'bk-1', status: 'COMPLETED' });
    (db.booking.findUnique as jest.Mock).mockResolvedValue(booking);

    await expect(
      bookingService.rateBooking('bk-1', 'user-1', 5),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 400 when booking is not COMPLETED', async () => {
    const booking = makeBooking('user-1', { id: 'bk-1', status: 'SEARCHING' });
    (db.booking.findUnique as jest.Mock).mockResolvedValue(booking);

    await expect(
      bookingService.rateBooking('bk-1', 'user-1', 5),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 ALREADY_REVIEWED when booking has a review', async () => {
    const booking = makeBooking('user-1', {
      id: 'bk-1',
      status: 'COMPLETED',
      review: { id: 'rev-1', rating: 4 }, // already reviewed
    });
    (db.booking.findUnique as jest.Mock).mockResolvedValue(booking);

    await expect(
      bookingService.rateBooking('bk-1', 'user-1', 5),
    ).rejects.toMatchObject({ code: 'ALREADY_REVIEWED' });
  });

  it('throws 400 when no worker was assigned', async () => {
    const booking = makeBooking('user-1', {
      id: 'bk-1',
      status: 'COMPLETED',
      workerId: null,
    });
    (db.booking.findUnique as jest.Mock).mockResolvedValue(booking);

    await expect(
      bookingService.rateBooking('bk-1', 'user-1', 5),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('creates a review for a valid completed booking', async () => {
    const booking = makeBooking('user-1', {
      id: 'bk-1',
      status: 'COMPLETED',
      workerId: 'worker-1',
      review: null,
    });
    (db.booking.findUnique as jest.Mock).mockResolvedValue(booking);
    (db.review.create as jest.Mock).mockResolvedValue({
      id: 'rev-1',
      bookingId: 'bk-1',
      rating: 5,
    });

    const result = await bookingService.rateBooking(
      'bk-1',
      'user-1',
      5,
      'Great service!',
      ['punctual', 'clean'],
    );

    expect(result).toHaveProperty('id', 'rev-1');
    expect(db.review.create).toHaveBeenCalledTimes(1);
  });

  it('publishes REVIEW_CREATED Kafka event after review', async () => {
    const booking = makeBooking('user-1', {
      id: 'bk-rate',
      status: 'COMPLETED',
      workerId: 'worker-99',
      review: null,
    });
    (db.booking.findUnique as jest.Mock).mockResolvedValue(booking);
    (db.review.create as jest.Mock).mockResolvedValue({ id: 'rev-99' });

    await bookingService.rateBooking('bk-rate', 'user-1', 4, 'Good');

    const events = mockKafka.getPublishedByTopic('review.created');
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({
      bookingId: 'bk-rate',
      workerId: 'worker-99',
      rating: 4,
    });
  });
});
