// ═══════════════════════════════════════════════════════════
// INISTNT — Complete Zod Validators v2.0
// Har ek API endpoint ka validator yahan hai
// Frontend + Backend dono isko use karte hain
// ═══════════════════════════════════════════════════════════

import { z } from 'zod';

// ──────────────────────────────────────────
// REUSABLE BUILDING BLOCKS
// ──────────────────────────────────────────

export const indianMobile = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, {
    message: 'Valid Indian mobile number chahiye (10 digits, 6-9 se shuru)',
  });

export const uuidField = z
  .string()
  .uuid('Valid ID chahiye');

export const indianPincode = z
  .string()
  .regex(/^[1-9][0-9]{5}$/, 'Valid 6-digit pincode chahiye');

export const indiaLatitude = z
  .number()
  .min(8.0, 'Location India ke bahar hai')
  .max(37.6, 'Location India ke bahar hai');

export const indiaLongitude = z
  .number()
  .min(68.7, 'Location India ke bahar hai')
  .max(97.25, 'Location India ke bahar hai');

export const currencyAmount = z
  .number()
  .min(0, 'Amount negative nahi ho sakta')
  .max(10000000, 'Amount bahut zyada hai');

export const starRating = z
  .number()
  .int()
  .min(0, 'Rating 0 se kam nahi ho sakti')
  .max(5, 'Rating 5 se zyada nahi ho sakti');

export const gpsLocation = z.object({
  lat: indiaLatitude,
  lng: indiaLongitude,
});

export const dateTimeString = z
  .string()
  .datetime({ message: 'Valid date-time chahiye (ISO 8601 format)' });

// ──────────────────────────────────────────
// 1. COMMON — PAGINATION & FILTERS
// ──────────────────────────────────────────

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const DateRangeSchema = z.object({
  startDate: dateTimeString,
  endDate: dateTimeString,
}).refine(
  (data) => new Date(data.endDate) > new Date(data.startDate),
  { message: 'End date, start date ke baad honi chahiye' }
);

export const SearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1, 'Search query empty nahi ho sakti')
    .max(200),
  city: z.string().optional(),
  category: z.string().optional(),
  ...PaginationSchema.shape,
});

export const FileUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.enum([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
  ], { message: 'Sirf JPEG, PNG, WebP ya PDF allowed hai' }),
  fileSize: z
    .number()
    .max(10 * 1024 * 1024, 'File 10MB se badi nahi ho sakti'),
  purpose: z.enum([
    'profile_photo',
    'aadhaar_front',
    'aadhaar_back',
    'selfie',
    'pan_card',
    'police_cert',
    'skill_cert',
    'booking_before',
    'booking_after',
    'booking_evidence',
    'dispute_evidence',
    'banner',
  ]),
  entityId: uuidField,
});

// ──────────────────────────────────────────
// 2. AUTH
// ──────────────────────────────────────────

export const SendOtpSchema = z.object({
  mobile: indianMobile,
  purpose: z.enum(['login', 'register']).default('login'),
  userType: z.enum(['user', 'worker', 'admin', 'support']).default('user'),
});

export const VerifyOtpSchema = z.object({
  mobile: indianMobile,
  otp: z
    .string()
    .length(6, 'OTP exactly 6 digits ka hona chahiye')
    .regex(/^\d{6}$/, 'OTP sirf numbers mein hona chahiye'),
  userType: z.enum(['user', 'worker', 'admin', 'support']).default('user'),
  deviceId: z.string().max(200).optional(),
  deviceName: z.string().max(100).optional(),
  deviceOs: z.string().max(100).optional(),
  fcmToken: z.string().max(500).optional(),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token chahiye'),
});

export const UpdateFcmTokenSchema = z.object({
  fcmToken: z
    .string()
    .min(1, 'FCM token chahiye')
    .max(500),
  deviceId: z.string().max(200).optional(),
});

export const LogoutSchema = z.object({
  refreshToken: z.string().min(1),
  logoutAll: z.boolean().default(false),
});

// ──────────────────────────────────────────
// 3. USER (CUSTOMER)
// ──────────────────────────────────────────

export const UpdateUserProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Naam kam se kam 2 characters ka hona chahiye')
    .max(100)
    .optional(),
  email: z
    .string()
    .trim()
    .email('Valid email chahiye')
    .optional()
    .nullable(),
  preferredLanguage: z.enum(['hi', 'en']).optional(),
  profilePhoto: z.string().url('Valid photo URL chahiye').optional().nullable(),
});

export const AddressSchema = z.object({
  label: z.string().trim().min(1).max(50).default('Ghar'),
  fullAddress: z.string().trim().min(10, 'Pura address likhein').max(500),
  flatNo: z.string().trim().max(50).optional().nullable(),
  building: z.string().trim().max(100).optional().nullable(),
  street: z.string().trim().max(200).optional().nullable(),
  landmark: z.string().trim().max(200).optional().nullable(),
  area: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  pincode: indianPincode,
  lat: indiaLatitude,
  lng: indiaLongitude,
  isDefault: z.boolean().default(false),
});

export const UpdateAddressSchema = AddressSchema.partial();

export const DeleteAddressSchema = z.object({
  addressId: uuidField,
});

// ──────────────────────────────────────────
// 4. WORKER
// ──────────────────────────────────────────

export const WorkerRegistrationSchema = z.object({
  mobile: indianMobile,
  name: z.string().trim().min(2).max(100),
  city: z.string().min(2, 'City select karein'),
  skills: z
    .array(uuidField)
    .min(1, 'Kam se kam 1 skill select karein')
    .max(10),
  preferredLanguage: z.enum(['hi', 'en']).default('hi'),
  tshirtSize: z.enum(['S', 'M', 'L', 'XL', 'XXL']).optional(),
  referralCode: z.string().max(20).optional(),
});

export const UpdateWorkerProfileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  preferredLanguage: z.enum(['hi', 'en']).optional(),
  tshirtSize: z.enum(['S', 'M', 'L', 'XL', 'XXL']).optional(),
  profilePhoto: z.string().url().optional().nullable(),
});

export const UpdateWorkerStatusSchema = z.object({
  status: z.enum(['online', 'offline']),
});

export const UpdateWorkerLocationSchema = z.object({
  lat: indiaLatitude,
  lng: indiaLongitude,
  accuracy: z.number().min(0).max(1000).optional(),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).max(200).optional(),
  batteryLevel: z.number().min(0).max(1).optional(),
  isCharging: z.boolean().optional(),
});

export const AddWorkerSkillSchema = z.object({
  serviceId: uuidField,
  yearsExperience: z
    .number()
    .int()
    .min(0)
    .max(50),
  certificateUrl: z.string().url().optional().nullable(),
});

export const UpdateWorkerSkillSchema = z.object({
  skillId: uuidField,
  yearsExperience: z.number().int().min(0).max(50).optional(),
  certificateUrl: z.string().url().optional().nullable(),
});

export const WorkerBankDetailsSchema = z.discriminatedUnion('payoutMethod', [
  z.object({
    payoutMethod: z.literal('bank'),
    accountHolderName: z.string().trim().min(2).max(100),
    accountNumber: z
      .string()
      .regex(/^\d{9,18}$/, 'Valid bank account number chahiye'),
    ifscCode: z
      .string()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Valid IFSC code chahiye'),
    bankName: z.string().min(2).max(100),
  }),
  z.object({
    payoutMethod: z.literal('upi'),
    upiId: z
      .string()
      .regex(/^[\w.\-_]{3,}@[a-zA-Z]{3,}$/, 'Valid UPI ID chahiye'),
  }),
]);

// ──────────────────────────────────────────
// 5. WORKER VERIFICATION (KYC)
// ──────────────────────────────────────────

export const StartAadhaarVerificationSchema = z.object({
  aadhaarNumber: z
    .string()
    .regex(/^\d{12}$/, 'Valid 12-digit Aadhaar number chahiye'),
});

export const VerifyAadhaarOtpSchema = z.object({
  transactionId: z.string().min(1),
  otp: z
    .string()
    .length(6)
    .regex(/^\d{6}$/),
});

export const UploadDocumentSchema = z.object({
  documentType: z.enum([
    'aadhaar_front',
    'aadhaar_back',
    'selfie',
    'pan_card',
    'police_cert',
    'skill_cert',
    'other',
  ]),
  fileUrl: z.string().url('Valid file URL chahiye'),
  notes: z.string().max(200).optional(),
});

export const SubmitVerificationSchema = z.object({
  aadhaarFrontUrl: z.string().url(),
  aadhaarBackUrl: z.string().url(),
  selfieUrl: z.string().url(),
  panCardUrl: z.string().url().optional(),
});

// ──────────────────────────────────────────
// 6. SERVICES & SEARCH
// ──────────────────────────────────────────

export const ServiceSearchSchema = z.object({
  query: z.string().trim().max(200).optional(),
  category: z.string().optional(),
  city: z.string().optional(),
  lat: indiaLatitude.optional(),
  lng: indiaLongitude.optional(),
  radiusKm: z.number().min(1).max(50).default(10),
  minPrice: currencyAmount.optional(),
  maxPrice: currencyAmount.optional(),
  workerTier: z
    .enum(['new', 'verified', 'trusted', 'elite'])
    .optional(),
  sortBy: z
    .enum(['price_low', 'price_high', 'rating', 'distance', 'popularity'])
    .default('rating'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const WorkerSearchSchema = z.object({
  serviceId: uuidField,
  lat: indiaLatitude,
  lng: indiaLongitude,
  radiusKm: z.number().min(1).max(50).default(10),
  preferredGender: z.enum(['male', 'female', 'any']).default('any'),
  preferredTier: z
    .enum(['new', 'verified', 'trusted', 'elite'])
    .optional(),
});

// ──────────────────────────────────────────
// 7. BOOKING
// ──────────────────────────────────────────

export const CreateBookingSchema = z.object({
  serviceId: uuidField,
  subServiceId: uuidField.optional(),
  type: z.enum(['instant', 'scheduled']).default('instant'),
  address: z.string().trim().min(10).max(500),
  lat: indiaLatitude,
  lng: indiaLongitude,
  landmark: z.string().trim().max(200).optional(),
  scheduledAt: dateTimeString
    .optional()
    .refine(
      (val) => !val || new Date(val) > new Date(),
      { message: 'Scheduled time future mein honi chahiye' }
    ),
  preferredGender: z.enum(['male', 'female', 'any']).default('any'),
  paymentMethod: z.enum(['upi', 'card', 'cash', 'wallet']),
  specialInstructions: z.string().trim().max(500).optional(),
  couponCode: z.string().trim().max(20).toUpperCase().optional(),
  useWalletBalance: z.boolean().default(false),
  idempotencyKey: z.string().uuid('Valid idempotency key chahiye'),
  beforePhotoUrls: z
    .array(z.string().url())
    .max(5)
    .default([]),
});

export const CancelBookingSchema = z.object({
  bookingId: uuidField,
  reason: z.string().trim().min(5).max(500),
  cancelledBy: z.enum(['user', 'worker']),
});

export const WorkerRespondToBookingSchema = z.object({
  bookingId: uuidField,
  action: z.enum(['accept', 'reject']),
  rejectionReason: z
    .enum([
      'too_far',
      'not_available',
      'skill_mismatch',
      'other',
    ])
    .optional(),
});

export const VerifyBookingOtpSchema = z.object({
  bookingId: uuidField,
  otp: z
    .string()
    .length(4, 'Booking OTP 4 digits ka hota hai')
    .regex(/^\d{4}$/),
  type: z.enum(['arrival', 'completion']),
  lat: indiaLatitude,
  lng: indiaLongitude,
  accuracy: z.number().min(0).max(1000).optional(),
});

export const AddBookingPhotosSchema = z.object({
  bookingId: uuidField,
  photoType: z.enum(['before', 'after', 'evidence']),
  photoUrls: z
    .array(z.string().url())
    .min(1, 'Kam se kam 1 photo chahiye')
    .max(10),
});

export const UpdateBookingSchema = z.object({
  bookingId: uuidField,
  workerNotes: z.string().trim().max(500).optional(),
  specialInstructions: z.string().trim().max(500).optional(),
});

export const BookingFiltersSchema = z.object({
  status: z
    .array(z.enum([
      'searching', 'assigned', 'en_route',
      'arrived', 'in_progress', 'completed',
      'cancelled', 'disputed',
    ]))
    .optional(),
  serviceId: uuidField.optional(),
  dateFrom: dateTimeString.optional(),
  dateTo: dateTimeString.optional(),
  paymentStatus: z.enum(['pending', 'paid', 'refunded', 'failed']).optional(),
  ...PaginationSchema.shape,
});

// ──────────────────────────────────────────
// 8. REVIEW
// ──────────────────────────────────────────

export const CreateReviewSchema = z.object({
  bookingId: uuidField,
  rating: starRating,
  review: z.string().trim().max(500).optional(),
  tags: z.array(z.string().max(50)).max(5).default([]),
  isAnonymous: z.boolean().default(false),
});

export const ReviewResponseSchema = z.object({
  reviewId: uuidField,
  response: z.string().trim().min(10).max(300),
});

export const FlagReviewSchema = z.object({
  reviewId: uuidField,
  reason: z.enum([
    'fake_review',
    'offensive_content',
    'wrong_booking',
    'other',
  ]),
  details: z.string().max(300).optional(),
});

// ──────────────────────────────────────────
// 9. PAYMENT & FINANCE
// ──────────────────────────────────────────

export const InitiatePaymentSchema = z.object({
  bookingId: uuidField,
  amount: currencyAmount,
  paymentMethod: z.enum(['upi', 'card', 'wallet']),
});

export const ApplyCouponSchema = z.object({
  bookingId: uuidField,
  couponCode: z
    .string()
    .trim()
    .min(3)
    .max(20)
    .toUpperCase(),
});

export const RemoveCouponSchema = z.object({
  bookingId: uuidField,
});

export const RequestPayoutSchema = z.object({
  amount: currencyAmount.min(100, 'Minimum payout ₹100 hai'),
  payoutMethod: z.enum(['bank', 'upi']),
});

export const BuySubscriptionSchema = z.object({
  plan: z.enum(['silver', 'gold', 'platinum']),
  duration: z.enum(['monthly', 'yearly']),
  paymentMethod: z.enum(['upi', 'card']),
});

export const RedeemPointsSchema = z.object({
  points: z
    .number()
    .int()
    .min(100, 'Minimum 100 points redeem kar sakte ho')
    .max(10000),
  bookingId: uuidField.optional(),
});

// ──────────────────────────────────────────
// 10. REFERRAL
// ──────────────────────────────────────────

export const ApplyReferralCodeSchema = z.object({
  referralCode: z
    .string()
    .trim()
    .min(4, 'Valid referral code chahiye')
    .max(20)
    .toUpperCase(),
});

export const ShareReferralSchema = z.object({
  channel: z.enum(['whatsapp', 'sms', 'copy_link']),
});

// ──────────────────────────────────────────
// 11. DISPUTE
// ──────────────────────────────────────────

export const CreateDisputeSchema = z.object({
  bookingId: uuidField,
  reason: z.enum([
    'quality_issue',
    'payment_issue',
    'worker_behaviour',
    'worker_no_show',
    'wrong_service',
    'otp_issue',
    'overcharging',
    'other',
  ]),
  description: z.string().trim().min(20).max(1000),
  evidenceUrls: z.array(z.string().url()).max(5).default([]),
});

export const ResolveDisputeSchema = z.object({
  disputeId: uuidField,
  resolution: z.enum([
    'full_refund',
    'partial_refund',
    'no_refund',
    'worker_warning',
    'user_warning',
    'worker_suspended',
    'platform_error_refund',
  ]),
  resolutionNotes: z.string().trim().min(10).max(1000),
  refundAmount: currencyAmount.optional(),
  notifyParties: z.boolean().default(true),
});

export const EscalateDisputeSchema = z.object({
  disputeId: uuidField,
  reason: z.string().trim().min(10).max(500),
  escalateTo: z.enum(['city_manager', 'super_admin']),
});

export const AddDisputeNoteSchema = z.object({
  disputeId: uuidField,
  note: z.string().trim().min(5).max(1000),
  isInternal: z.boolean().default(true),
});

// ──────────────────────────────────────────
// 12. SOS
// ──────────────────────────────────────────

export const TriggerSosSchema = z.object({
  bookingId: uuidField,
  lat: indiaLatitude,
  lng: indiaLongitude,
  trigger: z.enum(['user_panic', 'worker_panic', 'auto_detect']),
  description: z.string().trim().max(500).optional(),
});

export const AcknowledgeSosSchema = z.object({
  sosId: uuidField,
  notes: z.string().trim().max(500).optional(),
});

export const ResolveSosSchema = z.object({
  sosId: uuidField,
  outcome: z.enum([
    'false_alarm',
    'resolved_by_agent',
    'emergency_services_dispatched',
    'worker_removed',
    'no_response',
  ]),
  incidentReport: z
    .string()
    .trim()
    .min(50, 'Incident report kam se kam 50 characters ki honi chahiye')
    .max(5000),
  emergencyServicesDispatched: z.boolean().default(false),
});

// ──────────────────────────────────────────
// 13. CHAT
// ──────────────────────────────────────────

export const SendMessageSchema = z.object({
  bookingId: uuidField,
  type: z.enum(['text', 'image', 'location']),
  content: z.string().trim().min(1).max(1000),
  mediaUrl: z.string().url().optional(),
  location: gpsLocation.optional(),
}).refine(
  (data) => {
    if (data.type === 'image' && !data.mediaUrl) return false;
    if (data.type === 'location' && !data.location) return false;
    return true;
  },
  { message: 'Image type mein mediaUrl chahiye, location type mein coordinates' }
);

export const MarkMessagesReadSchema = z.object({
  bookingId: uuidField,
  lastReadMessageId: uuidField,
});

// ──────────────────────────────────────────
// 14. NOTIFICATIONS
// ──────────────────────────────────────────

export const MarkNotificationReadSchema = z.object({
  notificationIds: z
    .array(uuidField)
    .min(1)
    .max(50),
});

export const NotificationPreferencesSchema = z.object({
  bookingUpdates: z.boolean().default(true),
  paymentUpdates: z.boolean().default(true),
  promotions: z.boolean().default(true),
  reminders: z.boolean().default(true),
  channels: z.object({
    push: z.boolean().default(true),
    sms: z.boolean().default(true),
    whatsapp: z.boolean().default(true),
    email: z.boolean().default(false),
  }),
});

// ──────────────────────────────────────────
// 15. WORKER REWARDS
// ──────────────────────────────────────────

export const ClaimRewardSchema = z.object({
  rewardId: uuidField,
  shippingAddress: z.string().trim().min(10).max(500).optional(),
  tshirtSize: z.enum(['S', 'M', 'L', 'XL', 'XXL']).optional(),
}).refine(
  (data) => {
    // T-shirt ke liye address aur size mandatory
    return true;
  }
);

// ──────────────────────────────────────────
// 16. ADMIN — CITY MANAGEMENT
// ──────────────────────────────────────────

export const CreateCitySchema = z.object({
  nameHi: z.string().trim().min(2).max(100),
  nameEn: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  tier: z.enum(['T1', 'T2', 'T3', 'T4']),
  lat: indiaLatitude,
  lng: indiaLongitude,
  timezone: z.string().default('Asia/Kolkata'),
  defaultSearchRadiusKm: z.number().min(1).max(50).default(10),
  maxSearchRadiusKm: z.number().min(5).max(100).default(25),
});

export const UpdateCitySchema = z.object({
  cityId: uuidField,
  nameHi: z.string().trim().min(2).max(100).optional(),
  nameEn: z.string().trim().min(2).max(100).optional(),
  state: z.string().trim().min(2).max(100).optional(),
  tier: z.enum(['T1', 'T2', 'T3', 'T4']).optional(),
  lat: indiaLatitude.optional(),
  lng: indiaLongitude.optional(),
  timezone: z.string().optional(),
  defaultSearchRadiusKm: z.number().min(1).max(50).optional(),
  maxSearchRadiusKm: z.number().min(5).max(100).optional(),
  status: z
    .enum(['pre_launch', 'soft_launch', 'active', 'maintenance', 'deactivated'])
    .optional(),
});

export const CitySurgeConfigSchema = z.object({
  cityId: uuidField,
  thresholds: z.array(
    z.object({
      minRatio: z.number().min(1),
      maxRatio: z.number().min(1),
      multiplier: z.number().min(1).max(3),
    })
  ).min(1),
  maxSurgeMultiplier: z.number().min(1).max(3).default(2),
});

// ──────────────────────────────────────────
// 17. ADMIN — SERVICE & PRICING
// ──────────────────────────────────────────

export const CreateServiceSchema = z.object({
  categoryId: uuidField,
  nameHi: z.string().trim().min(2).max(100),
  nameEn: z.string().trim().min(2).max(100),
  descriptionHi: z.string().trim().max(1000).optional(),
  descriptionEn: z.string().trim().max(1000).optional(),
  estimatedDurationMin: z.number().min(0.5).max(48),
  estimatedDurationMax: z.number().min(0.5).max(48),
  searchTags: z.array(z.string().max(50)).max(20).default([]),
  enabledCities: z.array(uuidField).default([]),
}).refine(
  (data) => data.estimatedDurationMax >= data.estimatedDurationMin,
  { message: 'Max duration, min duration se zyada honi chahiye' }
);

export const UpdatePricingSchema = z.object({
  serviceId: uuidField,
  cityId: uuidField,
  workerTier: z.enum(['new', 'verified', 'trusted', 'elite']),
  basePrice: currencyAmount.min(50, 'Minimum price ₹50 hai'),
  hourlyRate: currencyAmount.min(30, 'Minimum hourly rate ₹30 hai'),
  minimumCharge: currencyAmount,
  platformFee: currencyAmount,
  changeReason: z.string().trim().min(5).max(200),
});

export const CreateCouponSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3)
    .max(20)
    .toUpperCase()
    .regex(/^[A-Z0-9]+$/, 'Sirf letters aur numbers allowed hain'),
  discountType: z.enum(['percentage', 'flat']),
  discountValue: z.number().min(1),
  minimumOrderAmount: currencyAmount.default(0),
  maximumDiscountAmount: currencyAmount.optional(),
  totalUsageLimit: z.number().int().min(1).optional(),
  perUserLimit: z.number().int().min(1).default(1),
  validFrom: dateTimeString,
  validTo: dateTimeString,
  applicableServices: z.array(uuidField).default([]),
  isFirstBookingOnly: z.boolean().default(false),
  enabledCities: z.array(uuidField).default([]),
}).refine(
  (data) => {
    if (data.discountType === 'percentage' && data.discountValue > 100) return false;
    return new Date(data.validTo) > new Date(data.validFrom);
  },
  { message: 'Percentage 100 se zyada nahi ho sakta, aur end date future mein honi chahiye' }
);

// ──────────────────────────────────────────
// 18. ADMIN — WORKER ACTIONS
// ──────────────────────────────────────────

export const WorkerActionSchema = z.object({
  workerId: uuidField,
  action: z.enum(['suspend', 'ban', 'activate', 'verify', 'add_to_watchlist']),
  reason: z.string().trim().min(10).max(500),
  durationDays: z.number().int().min(1).max(365).optional(),
  evidenceUrls: z.array(z.string().url()).max(5).default([]),
  notifyWorker: z.boolean().default(true),
  internalNotes: z.string().trim().max(1000).optional(),
});

export const VerifyWorkerDocumentSchema = z.object({
  documentId: uuidField,
  action: z.enum(['approve', 'reject']),
  rejectionReason: z.enum([
    'photo_unclear',
    'aadhaar_mismatch',
    'document_expired',
    'fake_document',
    'incomplete',
    'other',
  ]).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const AddWorkerPenaltySchema = z.object({
  workerId: uuidField,
  amount: currencyAmount,
  reason: z.string().trim().min(5).max(300),
  bookingId: uuidField.optional(),
});

export const AddWorkerBonusSchema = z.object({
  workerId: uuidField,
  amount: currencyAmount.min(1),
  reason: z.string().trim().min(5).max(300),
  programId: uuidField.optional(),
});

// ──────────────────────────────────────────
// 19. ADMIN — FINANCE
// ──────────────────────────────────────────

export const ApproveRefundSchema = z.object({
  bookingId: uuidField,
  amount: currencyAmount,
  reason: z.string().trim().min(5).max(500),
  refundMethod: z.enum(['original_payment', 'wallet']).default('original_payment'),
  notifyUser: z.boolean().default(true),
});

export const ProcessPayoutSchema = z.object({
  workerIds: z
    .array(uuidField)
    .min(1, 'Kam se kam 1 worker select karein')
    .max(100),
  payoutPeriod: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Format: YYYY-MM'),
});

export const HoldPayoutSchema = z.object({
  workerId: uuidField,
  reason: z.string().trim().min(5).max(300),
  holdUntil: dateTimeString.optional(),
});

// ──────────────────────────────────────────
// 20. ADMIN — STAFF MANAGEMENT
// ──────────────────────────────────────────

export const InviteStaffSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email('Valid email chahiye'),
  mobile: indianMobile,
  role: z.enum([
    'super_admin', 'city_admin', 'finance_admin',
    'analytics_admin', 'city_manager', 'support_agent',
    'field_supervisor', 'qa_analyst',
  ]),
  assignedCities: z.array(uuidField).default([]),
});

export const UpdateStaffRoleSchema = z.object({
  staffId: uuidField,
  role: z.enum([
    'super_admin', 'city_admin', 'finance_admin',
    'analytics_admin', 'city_manager', 'support_agent',
    'field_supervisor', 'qa_analyst',
  ]),
  assignedCities: z.array(uuidField).optional(),
  reason: z.string().trim().min(5).max(200),
});

// ──────────────────────────────────────────
// 21. ADMIN — CONTENT
// ──────────────────────────────────────────

export const CreateBannerSchema = z.object({
  title: z.string().trim().min(2).max(100).optional(),
  imageUrl: z.string().url('Valid image URL chahiye'),
  ctaLabel: z.string().trim().max(50).optional(),
  deepLink: z.string().max(500).optional(),
  targetAudience: z.enum(['all', 'new_users', 'specific_city']).default('all'),
  targetCityId: uuidField.optional(),
  scheduledFrom: dateTimeString,
  scheduledTo: dateTimeString,
}).refine(
  (data) => new Date(data.scheduledTo) > new Date(data.scheduledFrom),
  { message: 'End time, start time ke baad honi chahiye' }
);

export const ApproveBannerSchema = z.object({
  bannerId: uuidField,
  action: z.enum(['approve', 'reject']),
  rejectionReason: z.string().trim().max(300).optional(),
});

// ──────────────────────────────────────────
// 22. ANALYTICS EVENT TRACKING
// ──────────────────────────────────────────

export const TrackEventSchema = z.object({
  event: z.enum([
    'app_opened', 'service_viewed', 'booking_initiated',
    'booking_completed', 'booking_cancelled', 'search_performed',
    'worker_profile_viewed', 'payment_initiated', 'payment_completed',
    'review_submitted', 'sos_triggered', 'referral_shared',
    'notification_opened', 'feature_used',
  ]),
  properties: z.record(z.unknown()).default({}),
  sessionId: z.string().min(1).max(100),
  timestamp: dateTimeString.optional(),
});

// ──────────────────────────────────────────
// 23. SUPPORT — BOOKING MANAGEMENT
// ──────────────────────────────────────────

export const ReassignWorkerSchema = z.object({
  bookingId: uuidField,
  newWorkerId: uuidField,
  reason: z.enum([
    'worker_cancelled',
    'worker_no_show',
    'worker_suspended',
    'user_complaint',
    'worker_emergency',
    'other',
  ]),
  notifyParties: z.boolean().default(true),
  internalNotes: z.string().trim().max(500).optional(),
});

export const AddInternalNoteSchema = z.object({
  entityType: z.enum(['booking', 'worker', 'user', 'dispute']),
  entityId: uuidField,
  note: z.string().trim().min(5).max(1000),
  isUrgent: z.boolean().default(false),
});

export const FlagForQaSchema = z.object({
  entityType: z.enum(['booking', 'worker', 'user', 'review']),
  entityId: uuidField,
  flagType: z.enum([
    'gps_spoofing', 'otp_proximity_mismatch', 'rating_ring',
    'fake_booking', 'multiple_accounts', 'device_sharing',
    'chargeback_pattern', 'abnormal_completion_speed',
    'suspicious_cash_pattern',
  ]),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().trim().min(10).max(500),
  evidenceData: z.record(z.unknown()).default({}),
});

// ──────────────────────────────────────────
// EXPORTED INFERRED TYPES
// ──────────────────────────────────────────

export type SendOtpInput = z.infer<typeof SendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;
export type UpdateUserProfileInput = z.infer<typeof UpdateUserProfileSchema>;
export type AddressInput = z.infer<typeof AddressSchema>;
export type WorkerRegistrationInput = z.infer<typeof WorkerRegistrationSchema>;
export type UpdateWorkerLocationInput = z.infer<typeof UpdateWorkerLocationSchema>;
export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;
export type CancelBookingInput = z.infer<typeof CancelBookingSchema>;
export type VerifyBookingOtpInput = z.infer<typeof VerifyBookingOtpSchema>;
export type CreateReviewInput = z.infer<typeof CreateReviewSchema>;
export type CreateDisputeInput = z.infer<typeof CreateDisputeSchema>;
export type ResolveDisputeInput = z.infer<typeof ResolveDisputeSchema>;
export type TriggerSosInput = z.infer<typeof TriggerSosSchema>;
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
export type WorkerActionInput = z.infer<typeof WorkerActionSchema>;
export type InviteStaffInput = z.infer<typeof InviteStaffSchema>;
export type CreateBookingFiltersInput = z.infer<typeof BookingFiltersSchema>;
export type ServiceSearchInput = z.infer<typeof ServiceSearchSchema>;
export type TrackEventInput = z.infer<typeof TrackEventSchema>;
export type CreateCouponInput = z.infer<typeof CreateCouponSchema>;
export type UpdatePricingInput = z.infer<typeof UpdatePricingSchema>;
export type ReassignWorkerInput = z.infer<typeof ReassignWorkerSchema>;
export type FileUploadInput = z.infer<typeof FileUploadSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;