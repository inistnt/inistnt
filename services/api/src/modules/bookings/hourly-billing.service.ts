// ═══════════════════════════════════════════════════════════════════
// INISTNT — Hourly Billing Service
// Used by: booking.service.ts at booking creation time
//
// For TYPE 1 services (maid, cook, babysitter, etc.):
//   baseAmount = hourlyRate × bookedHours
//   schema ADDITION REQUIRED: Booking.bookedHours Int @default(1)
//
// For TYPE 2 services (AC cleaning, electrician, etc.):
//   baseAmount = basePrice (fixed, as before)
//
// ServicePricing.hourlyRate being non-null = hourly service
// ═══════════════════════════════════════════════════════════════════

import { db }    from '../../infrastructure/database';
import { logger } from '../../config/logger';

export interface HourlyBillingInput {
  serviceId:  string;
  cityId:     string;
  workerTier: string;
  hours:      number;    // User-selected hours (1-12)
}

export interface BillingResult {
  baseAmount:    number;   // In paise
  hourlyRate:    number;   // Per hour in paise (0 if fixed price)
  bookedHours:   number;
  isHourlyService: boolean;
}

const MIN_HOURS = 1;
const MAX_HOURS = 12;

export async function calculateBookingAmount(input: HourlyBillingInput): Promise<BillingResult> {
  const { serviceId, cityId, workerTier, hours } = input;

  // Clamp hours to valid range
  const bookedHours = Math.max(MIN_HOURS, Math.min(MAX_HOURS, Math.floor(hours)));

  const pricing = await db.servicePricing.findFirst({
    where: {
      serviceId,
      cityId,
      workerTier: workerTier as any,
      isActive:   true,
      effectiveTo: { equals: null },    // Current pricing only
    },
    orderBy: { effectiveFrom: 'desc' }, // Latest first
  });

  if (!pricing) {
    throw new Error(`Service pricing not found for serviceId=${serviceId}, cityId=${cityId}, tier=${workerTier}`);
  }

  const isHourlyService = pricing.hourlyRate != null && pricing.hourlyRate > 0;

  let baseAmount: number;
  if (isHourlyService) {
    // TYPE 1: Hourly — hourlyRate × hours
    baseAmount = pricing.hourlyRate! * bookedHours;
  } else {
    // TYPE 2: Fixed price — ignore hours
    baseAmount = pricing.basePrice;
  }

  logger.debug({
    serviceId, cityId, workerTier, hours: bookedHours,
    hourlyRate: pricing.hourlyRate, baseAmount, isHourlyService,
  }, '[HourlyBilling] Amount calculated');

  return {
    baseAmount,
    hourlyRate:      pricing.hourlyRate ?? 0,
    bookedHours,
    isHourlyService,
  };
}

// ─── Validation schema addition for booking create route ────────────────────
// Add to CreateBookingSchema in booking.routes.ts:
//
// bookedHours: z.number().int().min(1).max(12).optional().default(1),
//
// And in booking.service.ts createBooking():
//   const billing = await calculateBookingAmount({
//     serviceId: body.serviceId,
//     cityId:    body.cityId ?? resolvedCityId,
//     workerTier: 'BASIC',          // Use preferred worker tier if known
//     hours:     body.bookedHours ?? 1,
//   });
//   baseAmount = billing.baseAmount;
//   // Store booking.bookedHours = billing.bookedHours

// ─── Available hours options (for frontend dropdown) ────────────────────────
export const AVAILABLE_HOURS = [1, 2, 3, 4, 6, 8] as const;

export function formatHourlyLabel(hours: number, rateInPaise: number): string {
  const rate = rateInPaise / 100;
  const total = (rate * hours).toFixed(0);
  return `${hours} ${hours === 1 ? 'hour' : 'hours'} — ₹${total}`;
}
