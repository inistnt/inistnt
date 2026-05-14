// ═══════════════════════════════════════════════════════════
// UNIT TESTS — bookingService.create
// Tests pricing logic, surge, coupon, commission, status
// ═══════════════════════════════════════════════════════════

jest.mock('../../../src/infrastructure/database', () => require('../../mocks/database.mock'));
jest.mock('../../../src/infrastructure/redis', () => require('../../mocks/redis.mock'));
jest.mock('../../../src/infrastructure/kafka', () => require('../../mocks/kafka.mock'));
jest.mock('../../../src/modules/services/service.repository');

import { bookingService } from '../../../src/modules/bookings/booking.service';
import { db } from '../../mocks/database.mock';
import { mockKafka } from '../../mocks/kafka.mock';
import {
  makeService,
  makeServicePricing,
  makeBooking,
  makeCoupon,
  makeCommissionRule,
} from '../../fixtures';

// Mock serviceRepo.getSurgMultiplier
const mockGetSurgeMultiplier = jest.fn();
jest.mock('../../../src/modules/services/service.repository', () => ({
  serviceRepo: { getSurgMultiplier: mockGetSurgeMultiplier },
}));

const BASE_PARAMS = {
  userId:    'user-001',
  serviceId: 'svc-001',
  cityId:    'city-001',
  addressId: 'addr-001',
  lat:       12.9716,
  lng:       77.5946,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockKafka.clear();
  mockGetSurgeMultiplier.mockResolvedValue(1.0); // No surge by default
  (db.booking.findFirst as jest.Mock).mockResolvedValue(null); // No active booking
});

describe('bookingService.create', () => {

  it('throws 400 ACTIVE_BOOKING_EXISTS when user already has active booking', async () => {
    (db.booking.findFirst as jest.Mock).mockResolvedValue(
      makeBooking('user-001', { status: 'SEARCHING' }),
    );

    await expect(bookingService.create(BASE_PARAMS)).rejects.toMatchObject({
      statusCode: 400,
      code: 'ACTIVE_BOOKING_EXISTS',
    });
  });

  it('throws 404 when service does not exist', async () => {
    (db.service.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(bookingService.create(BASE_PARAMS)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws 400 NOT_SERVICEABLE when no pricing for city', async () => {
    (db.service.findUnique as jest.Mock).mockResolvedValue(makeService());
    (db.servicePricing.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(bookingService.create(BASE_PARAMS)).rejects.toMatchObject({
      statusCode: 400,
      code: 'NOT_SERVICEABLE',
    });
  });

  it('creates booking with correct finalAmount (no surge, no coupon)', async () => {
    const service = makeService({ id: 'svc-001' });
    const pricing = makeServicePricing('svc-001', 'city-001', { basePrice: 50000 });
    const booking = makeBooking('user-001', {
      id: 'booking-001',
      baseAmount: 50000,
      finalAmount: 50000,
    });

    (db.service.findUnique as jest.Mock).mockResolvedValue(service);
    (db.servicePricing.findFirst as jest.Mock).mockResolvedValue(pricing);
    (db.commissionRule.findFirst as jest.Mock).mockResolvedValue(makeCommissionRule('city-001'));
    (db.booking.create as jest.Mock).mockResolvedValue(booking);
    (db.booking.update as jest.Mock).mockResolvedValue(booking);

    const result = await bookingService.create(BASE_PARAMS);

    expect(result.finalAmount).toBe(50000);
    expect(db.booking.create).toHaveBeenCalledTimes(1);
  });

  it('applies surge multiplier correctly', async () => {
    mockGetSurgeMultiplier.mockResolvedValue(1.5); // 50% surge

    const pricing = makeServicePricing('svc-001', 'city-001', { basePrice: 40000 });
    (db.service.findUnique as jest.Mock).mockResolvedValue(makeService());
    (db.servicePricing.findFirst as jest.Mock).mockResolvedValue(pricing);
    (db.commissionRule.findFirst as jest.Mock).mockResolvedValue(null);

    const capturedCreateArg = { finalAmount: 0 };
    (db.booking.create as jest.Mock).mockImplementation(({ data }: any) => {
      capturedCreateArg.finalAmount = data.finalAmount;
      return { ...makeBooking('user-001'), ...data };
    });
    (db.booking.update as jest.Mock).mockResolvedValue({});

    await bookingService.create(BASE_PARAMS);

    // surgeAmount = 40000 * (1.5 - 1) = 20000; final = 40000 + 20000 = 60000
    expect(capturedCreateArg.finalAmount).toBe(60000);
  });

  it('applies percentage coupon discount correctly', async () => {
    const pricing = makeServicePricing('svc-001', 'city-001', { basePrice: 50000 });
    const coupon = makeCoupon({
      code: 'SAVE10',
      discountType: 'percentage',
      discountValue: 10,
      maxDiscount: 100000,
      minOrderAmount: 20000,
    });

    (db.service.findUnique as jest.Mock).mockResolvedValue(makeService());
    (db.servicePricing.findFirst as jest.Mock).mockResolvedValue(pricing);
    (db.coupon.findFirst as jest.Mock).mockResolvedValue(coupon);
    (db.coupon.update as jest.Mock).mockResolvedValue(coupon);
    (db.commissionRule.findFirst as jest.Mock).mockResolvedValue(null);

    const capturedCreateArg = { discountAmount: 0, finalAmount: 0 };
    (db.booking.create as jest.Mock).mockImplementation(({ data }: any) => {
      capturedCreateArg.discountAmount = data.discountAmount;
      capturedCreateArg.finalAmount    = data.finalAmount;
      return { ...makeBooking('user-001'), ...data };
    });
    (db.booking.update as jest.Mock).mockResolvedValue({});

    await bookingService.create({ ...BASE_PARAMS, couponCode: 'SAVE10' });

    // 10% of 50000 = 5000 discount; final = 45000
    expect(capturedCreateArg.discountAmount).toBe(5000);
    expect(capturedCreateArg.finalAmount).toBe(45000);
  });

  it('caps percentage discount at maxDiscount', async () => {
    const pricing = makeServicePricing('svc-001', 'city-001', { basePrice: 50000 });
    const coupon = makeCoupon({
      discountType: 'percentage',
      discountValue: 50,   // 50% = 25000
      maxDiscount:  10000, // but capped at 10000
      minOrderAmount: 0,
    });

    (db.service.findUnique as jest.Mock).mockResolvedValue(makeService());
    (db.servicePricing.findFirst as jest.Mock).mockResolvedValue(pricing);
    (db.coupon.findFirst as jest.Mock).mockResolvedValue(coupon);
    (db.coupon.update as jest.Mock).mockResolvedValue(coupon);
    (db.commissionRule.findFirst as jest.Mock).mockResolvedValue(null);

    let capturedDiscount = 0;
    (db.booking.create as jest.Mock).mockImplementation(({ data }: any) => {
      capturedDiscount = data.discountAmount;
      return { ...makeBooking('user-001'), ...data };
    });
    (db.booking.update as jest.Mock).mockResolvedValue({});

    await bookingService.create({ ...BASE_PARAMS, couponCode: 'BIGCOUPON' });
    expect(capturedDiscount).toBe(10000);
  });

  it('applies fixed coupon discount', async () => {
    const pricing = makeServicePricing('svc-001', 'city-001', { basePrice: 50000 });
    const coupon = makeCoupon({
      discountType: 'fixed',
      discountValue: 15000,
      maxDiscount: null,
      minOrderAmount: 0,
    });

    (db.service.findUnique as jest.Mock).mockResolvedValue(makeService());
    (db.servicePricing.findFirst as jest.Mock).mockResolvedValue(pricing);
    (db.coupon.findFirst as jest.Mock).mockResolvedValue(coupon);
    (db.coupon.update as jest.Mock).mockResolvedValue(coupon);
    (db.commissionRule.findFirst as jest.Mock).mockResolvedValue(null);

    let capturedFinal = 0;
    (db.booking.create as jest.Mock).mockImplementation(({ data }: any) => {
      capturedFinal = data.finalAmount;
      return { ...makeBooking('user-001'), ...data };
    });
    (db.booking.update as jest.Mock).mockResolvedValue({});

    await bookingService.create({ ...BASE_PARAMS, couponCode: 'FIXED15' });
    expect(capturedFinal).toBe(35000); // 50000 - 15000
  });

  it('ensures finalAmount is never negative', async () => {
    const pricing = makeServicePricing('svc-001', 'city-001', { basePrice: 5000 });
    const coupon = makeCoupon({
      discountType: 'fixed',
      discountValue: 9999999, // way more than the price
      maxDiscount: null,
      minOrderAmount: 0,
    });

    (db.service.findUnique as jest.Mock).mockResolvedValue(makeService());
    (db.servicePricing.findFirst as jest.Mock).mockResolvedValue(pricing);
    (db.coupon.findFirst as jest.Mock).mockResolvedValue(coupon);
    (db.coupon.update as jest.Mock).mockResolvedValue(coupon);
    (db.commissionRule.findFirst as jest.Mock).mockResolvedValue(null);

    let capturedFinal = -1;
    (db.booking.create as jest.Mock).mockImplementation(({ data }: any) => {
      capturedFinal = data.finalAmount;
      return { ...makeBooking('user-001'), ...data };
    });
    (db.booking.update as jest.Mock).mockResolvedValue({});

    await bookingService.create({ ...BASE_PARAMS, couponCode: 'FREE' });
    expect(capturedFinal).toBeGreaterThanOrEqual(0);
  });

  it('uses default commissionRate of 12% when no rule exists', async () => {
    (db.service.findUnique as jest.Mock).mockResolvedValue(makeService());
    (db.servicePricing.findFirst as jest.Mock).mockResolvedValue(
      makeServicePricing('svc-001', 'city-001'),
    );
    (db.commissionRule.findFirst as jest.Mock).mockResolvedValue(null); // No rule

    let capturedRate = 0;
    (db.booking.create as jest.Mock).mockImplementation(({ data }: any) => {
      capturedRate = data.commissionRate;
      return { ...makeBooking('user-001'), ...data };
    });
    (db.booking.update as jest.Mock).mockResolvedValue({});

    await bookingService.create(BASE_PARAMS);
    expect(capturedRate).toBe(12.0);
  });

  it('publishes BOOKING_CREATED Kafka event', async () => {
    (db.service.findUnique as jest.Mock).mockResolvedValue(makeService());
    (db.servicePricing.findFirst as jest.Mock).mockResolvedValue(
      makeServicePricing('svc-001', 'city-001'),
    );
    (db.commissionRule.findFirst as jest.Mock).mockResolvedValue(null);
    (db.booking.create as jest.Mock).mockResolvedValue(makeBooking('user-001', { id: 'bk-1' }));
    (db.booking.update as jest.Mock).mockResolvedValue({});

    await bookingService.create(BASE_PARAMS);

    const events = mockKafka.getPublishedByTopic('booking.created');
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({
      userId: 'user-001',
      cityId: 'city-001',
    });
  });
});
