// ═══════════════════════════════════════════════════════════
// INISTNT — Complete Platform Constants v2.0
// Koi bhi value hardcode mat karo apps mein
// Sab yahan se import karo
// ═══════════════════════════════════════════════════════════

// ──────────────────────────────────────────
// 1. APP INFO
// ──────────────────────────────────────────

export const APP = {
  NAME: 'Inistnt',
  TAGLINE: 'Kaam Turant, Bharosa Hamesha',
  WEBSITE: 'https://inistnt.in',
  SUPPORT_EMAIL: 'support@inistnt.in',
  SUPPORT_MOBILE: '1800-XXX-XXXX',
  PLAY_STORE_URL: 'https://play.google.com/store/apps/details?id=in.inistnt',
  APP_STORE_URL: 'https://apps.apple.com/in/app/inistnt',
  DEEP_LINK_SCHEME: 'inistnt://',

  // Force update config
  MIN_APP_VERSION: {
    android: '1.0.0',
    ios: '1.0.0',
  },
  RECOMMENDED_VERSION: {
    android: '1.0.0',
    ios: '1.0.0',
  },
} as const;

// ──────────────────────────────────────────
// 2. API
// ──────────────────────────────────────────

export const API = {
  VERSION: 'v1',
  BASE_PATH: '/api/v1',
  TIMEOUT_MS: 30000,
  MAX_RETRIES: 3,
  RATE_LIMIT: {
    WINDOW_MS: 60000,
    MAX_REQUESTS: 100,
    OTP_MAX: 3,
    OTP_WINDOW_MS: 600000,
  },
} as const;

// ──────────────────────────────────────────
// 3. AUTH
// ──────────────────────────────────────────

export const AUTH = {
  OTP_LENGTH: 6,
  OTP_EXPIRY_MINUTES: 5,
  OTP_MAX_ATTEMPTS: 3,
  BOOKING_OTP_LENGTH: 4,
  ACCESS_TOKEN_EXPIRY: '15m',
  REFRESH_TOKEN_EXPIRY: '30d',
  SESSION_TIMEOUT_MINUTES: 30,
  MAX_DEVICES: 5,
} as const;

// ──────────────────────────────────────────
// 4. CACHE TTL (Valkey/Redis expiry times)
// ──────────────────────────────────────────

export const CACHE_TTL = {
  // Seconds mein

  // Auth
  OTP: 5 * 60,                    // 5 min
  OTP_ATTEMPTS: 10 * 60,          // 10 min
  ACCESS_TOKEN: 15 * 60,          // 15 min
  REFRESH_TOKEN: 30 * 24 * 3600,  // 30 days
  SESSION: 30 * 60,               // 30 min

  // Worker location (GPS)
  WORKER_LOCATION: 30,            // 30 sec — fresh GPS
  WORKER_STATUS: 60,              // 1 min
  WORKER_ONLINE_LIST: 10,         // 10 sec — matching engine

  // Booking
  BOOKING_BROADCAST: 3 * 60,     // 3 min — broadcast window
  BOOKING_DETAILS: 5 * 60,       // 5 min cache
  IDEMPOTENCY_KEY: 24 * 3600,    // 24 hours

  // Pricing
  SURGE_MULTIPLIER: 5 * 60,      // 5 min — update frequently
  SERVICE_PRICING: 30 * 60,      // 30 min
  COUPON_DETAILS: 10 * 60,       // 10 min

  // Geocoding (address → lat/lng)
  GEOCODE: 365 * 24 * 3600,      // 1 year — permanent cache

  // Service listings
  SERVICE_LIST: 60 * 60,         // 1 hour
  CATEGORY_LIST: 60 * 60,        // 1 hour

  // User/Worker profile
  USER_PROFILE: 15 * 60,         // 15 min
  WORKER_PROFILE: 10 * 60,       // 10 min

  // Analytics
  DAILY_STATS: 24 * 3600,        // 24 hours
  CITY_METRICS: 15 * 60,         // 15 min

  // Feature flags
  FEATURE_FLAGS: 5 * 60,         // 5 min

  // Rate limiting
  RATE_LIMIT_WINDOW: 60,         // 1 min
} as const;

// ──────────────────────────────────────────
// 5. WORKER
// ──────────────────────────────────────────

export const WORKER = {
  TIERS: {
    NEW: {
      label: 'New',
      labelHi: 'नया',
      minJobs: 0,
      minRating: 0,
      color: '#94A3B8',
    },
    VERIFIED: {
      label: 'Verified',
      labelHi: 'सत्यापित',
      minJobs: 10,
      minRating: 0,
      color: '#3B82F6',
    },
    TRUSTED: {
      label: 'Trusted',
      labelHi: 'भरोसेमंद',
      minJobs: 50,
      minRating: 4.5,
      color: '#8B5CF6',
    },
    ELITE: {
      label: 'Elite',
      labelHi: 'एलिट',
      minJobs: 200,
      minRating: 4.8,
      color: '#F59E0B',
    },
  },

  COMMISSION_RATES: {
    new: 0.12,
    verified: 0.12,
    trusted: 0.10,
    elite: 0.08,
  },

  FREE_COMMISSION_JOBS: 10,
  MIN_RATING_THRESHOLD: 2.5,
  MIN_REVIEWS_FOR_THRESHOLD: 20,
  ONLINE_RECENCY_MINUTES: 2,
  GPS_FRESHNESS_SECONDS: 30,
  POST_REJECTION_COOLDOWN_MIN: 5,
  AUTO_OFFLINE_AFTER_REJECTIONS: 5,
  AUTO_OFFLINE_DURATION_MIN: 30,
  SELFIE_MATCH_MIN_SCORE: 80,
  SELFIE_AUTO_APPROVE_SCORE: 95,
  GPS_SPOOFING_MAX_SPEED_KMH: 120,
  OTP_PROXIMITY_RADIUS_METERS: 200,
  MAX_FRAUD_FLAGS_BEFORE_REVIEW: 3,

  // Predefined rejection reasons
  REJECTION_REASONS: [
    { key: 'too_far',        labelHi: 'बहुत दूर है',      labelEn: 'Too far away' },
    { key: 'not_available',  labelHi: 'अभी फ्री नहीं',    labelEn: 'Not available now' },
    { key: 'skill_mismatch', labelHi: 'मेरा काम नहीं',    labelEn: 'Not my skill' },
    { key: 'emergency',      labelHi: 'इमरजेंसी है',      labelEn: 'Personal emergency' },
    { key: 'vehicle_issue',  labelHi: 'गाड़ी खराब है',    labelEn: 'Vehicle issue' },
    { key: 'other',          labelHi: 'कोई और कारण',      labelEn: 'Other reason' },
  ],

  // Document types required
  REQUIRED_DOCUMENTS: ['aadhaar_front', 'aadhaar_back', 'selfie'] as const,
  OPTIONAL_DOCUMENTS: ['pan_card', 'police_cert', 'skill_cert'] as const,
} as const;

// ──────────────────────────────────────────
// 6. BOOKING
// ──────────────────────────────────────────

export const BOOKING = {
  DEFAULT_SEARCH_RADIUS_KM: 10,
  MAX_SEARCH_RADIUS_KM: 25,
  RADIUS_EXPANSION_STEP_KM: 2,

  BROADCAST: {
    PHASE_1_DURATION_SEC: 30,
    PHASE_1_EXCLUSIVE_SEC: 10,
    PHASE_1_MAX_WORKERS: 5,
    PHASE_2_DURATION_SEC: 60,
    PHASE_2_MAX_WORKERS: 10,
    PHASE_3_DURATION_SEC: 90,
    TOTAL_TIMEOUT_SEC: 180,
  },

  ARRIVAL_OTP_LENGTH: 4,
  COMPLETION_OTP_LENGTH: 4,

  CANCELLATION: {
    FREE_WINDOW_MIN: 5,
    FLAT_FEE_WINDOW_MIN: 15,
    FLAT_FEE_AMOUNT: 30,
    PERCENTAGE_WINDOW_MIN: 30,
    PERCENTAGE_RATE: 0.10,
    LATE_PERCENTAGE_RATE: 0.20,
  },

  MIN_COMPLETION_TIME_RATIO: 0.3,

  // Predefined cancellation reasons
  CANCELLATION_REASONS: {
    USER: [
      { key: 'changed_mind',       labelHi: 'मन बदल गया',        labelEn: 'Changed my mind' },
      { key: 'booked_by_mistake',  labelHi: 'गलती से book हुआ',  labelEn: 'Booked by mistake' },
      { key: 'worker_too_late',    labelHi: 'Worker देर से आ रहा', labelEn: 'Worker taking too long' },
      { key: 'found_someone_else', labelHi: 'दूसरा मिल गया',      labelEn: 'Found someone else' },
      { key: 'emergency',          labelHi: 'इमरजेंसी है',        labelEn: 'Personal emergency' },
      { key: 'other',              labelHi: 'कोई और कारण',        labelEn: 'Other' },
    ],
    WORKER: [
      { key: 'personal_emergency', labelHi: 'इमरजेंसी है',       labelEn: 'Personal emergency' },
      { key: 'vehicle_breakdown',  labelHi: 'गाड़ी खराब हो गई', labelEn: 'Vehicle breakdown' },
      { key: 'wrong_location',     labelHi: 'गलत location है',   labelEn: 'Wrong location' },
      { key: 'tool_not_available', labelHi: 'सामान नहीं है',     labelEn: 'Tools not available' },
      { key: 'other',              labelHi: 'कोई और कारण',       labelEn: 'Other' },
    ],
  },

  STATUS_LABELS: {
    searching:   { en: 'Finding Worker',   hi: 'Worker ढूंढ रहे हैं' },
    assigned:    { en: 'Worker Assigned',  hi: 'Worker मिल गया' },
    en_route:    { en: 'Worker On Way',    hi: 'Worker आ रहा है' },
    arrived:     { en: 'Worker Arrived',   hi: 'Worker पहुंच गया' },
    in_progress: { en: 'Work In Progress', hi: 'काम चल रहा है' },
    completed:   { en: 'Completed',        hi: 'काम पूरा हुआ' },
    cancelled:   { en: 'Cancelled',        hi: 'रद्द हुआ' },
    disputed:    { en: 'Disputed',         hi: 'विवाद में है' },
    sos_active:  { en: 'SOS Active',       hi: 'SOS चालू है' },
  },

  // Valid status transitions
  STATUS_TRANSITIONS: {
    searching:   ['assigned', 'cancelled'],
    assigned:    ['en_route', 'cancelled'],
    en_route:    ['arrived', 'cancelled'],
    arrived:     ['in_progress'],
    in_progress: ['completed', 'disputed', 'sos_active'],
    sos_active:  ['in_progress', 'cancelled', 'disputed'],
    completed:   [],
    cancelled:   [],
    disputed:    [],
  } as Record<string, string[]>,

  // Scheduled booking time slots
  TIME_SLOTS: [
    { label: '7:00 AM - 9:00 AM',   start: '07:00', end: '09:00' },
    { label: '9:00 AM - 11:00 AM',  start: '09:00', end: '11:00' },
    { label: '11:00 AM - 1:00 PM',  start: '11:00', end: '13:00' },
    { label: '1:00 PM - 3:00 PM',   start: '13:00', end: '15:00' },
    { label: '3:00 PM - 5:00 PM',   start: '15:00', end: '17:00' },
    { label: '5:00 PM - 7:00 PM',   start: '17:00', end: '19:00' },
    { label: '7:00 PM - 9:00 PM',   start: '19:00', end: '21:00' },
  ],
  
  MAX_ADVANCE_BOOKING_DAYS: 14,   // 2 weeks aage book kar sakte hain
  MIN_ADVANCE_BOOKING_HOURS: 2,   // Kam se kam 2 ghante pehle
} as const;

// ──────────────────────────────────────────
// 7. PRICING
// ──────────────────────────────────────────

export const PRICING = {
  MIN_BOOKING_AMOUNT: 50,
  MAX_SURGE_MULTIPLIER: 2.0,
  SURGE_DISPLAY_THRESHOLD: 1.2,
  PLATFORM_FEE_DEFAULT: 20,

  SURGE_THRESHOLDS: [
    { minRatio: 0,   maxRatio: 1.5, multiplier: 1.0 },
    { minRatio: 1.5, maxRatio: 2.5, multiplier: 1.2 },
    { minRatio: 2.5, maxRatio: 4.0, multiplier: 1.5 },
    { minRatio: 4.0, maxRatio: 999, multiplier: 2.0 },
  ],

  PEAK_HOUR_MULTIPLIER: 1.1,
  WEEKEND_MULTIPLIER: 1.1,
  FESTIVAL_MAX_MULTIPLIER: 1.5,
} as const;

// ──────────────────────────────────────────
// 8. SUBSCRIPTIONS
// ──────────────────────────────────────────

export const SUBSCRIPTION = {
  PLANS: {
    free: {
      label: 'Free',
      labelHi: 'मुफ्त',
      priceMonthly: 0,
      priceYearly: 0,
      bookingLimit: 5,
      payoutFrequency: 'monthly' as const,
      commissionRate: 0.12,
      priorityBoost: 0,
      color: '#94A3B8',
      features: ['5 bookings/month', 'Monthly payout', 'Basic support'],
    },
    silver: {
      label: 'Silver',
      labelHi: 'सिल्वर',
      priceMonthly: 199,
      priceYearly: 1799,
      bookingLimit: null,
      payoutFrequency: 'weekly' as const,
      commissionRate: 0.12,
      priorityBoost: 5,
      color: '#94A3B8',
      features: ['Unlimited bookings', 'Weekly payout', 'Priority listing'],
    },
    gold: {
      label: 'Gold',
      labelHi: 'गोल्ड',
      priceMonthly: 499,
      priceYearly: 4499,
      bookingLimit: null,
      payoutFrequency: 'daily' as const,
      commissionRate: 0.10,
      priorityBoost: 10,
      color: '#F59E0B',
      features: ['Unlimited bookings', 'Daily payout', 'Reduced commission 10%'],
    },
    platinum: {
      label: 'Platinum',
      labelHi: 'प्लैटिनम',
      priceMonthly: 999,
      priceYearly: 8999,
      bookingLimit: null,
      payoutFrequency: 'daily' as const,
      commissionRate: 0.08,
      priorityBoost: 20,
      color: '#7C3AED',
      features: ['Unlimited bookings', 'Instant daily payout', 'Lowest commission 8%', 'VIP support'],
    },
  },

  GRACE_PERIOD_DAYS: 3,
  EXPIRY_REMINDER_DAYS: 7,
} as const;

// ──────────────────────────────────────────
// 9. FINANCE
// ──────────────────────────────────────────

export const FINANCE = {
  TDS_RATE: 0.01,
  TDS_THRESHOLD_ANNUAL: 100000,
  TDS_WARNING_THRESHOLD: 80000,
  MIN_PAYOUT_AMOUNT: 100,
  MAX_PAYOUT_AMOUNT: 500000,
  SILVER_PAYOUT_DAY: 0,           // Sunday
  MAX_AUTO_REFUND_AMOUNT: 500,
  MAX_CITY_MANAGER_REFUND: 2000,
  REFUND_WINDOW_HOURS: 72,
  CURRENCY: 'INR',
  CURRENCY_MULTIPLIER: 100,       // Paise
  TARGET_TAKE_RATE_MIN: 0.14,
  TARGET_TAKE_RATE_MAX: 0.18,
} as const;

// ──────────────────────────────────────────
// 10. REFERRAL & REWARDS
// ──────────────────────────────────────────

export const REFERRAL = {
  REFERRER_REWARD: 50,
  REFEREE_DISCOUNT: 100,
  VALIDITY_DAYS: 30,
  WORKER_REFERRER_REWARD: 200,
  WORKER_QUALIFYING_JOBS: 10,
  CODE_LENGTH: 7,
} as const;

export const REWARDS = {
  MILESTONES: {
    TSHIRT: {
      key: '5_orders_4star',
      requiredJobs: 5,
      requiredRating: 4.0,
      type: 'tshirt' as const,
      titleHi: '🎽 Inistnt T-Shirt Mili!',
      titleEn: '🎽 T-Shirt Earned!',
    },
    CASH_25: {
      key: '25_orders_bonus',
      requiredJobs: 25,
      requiredRating: 4.5,
      type: 'cash_bonus' as const,
      amount: 500,
      titleHi: '💰 ₹500 Bonus Mila!',
      titleEn: '💰 ₹500 Bonus!',
    },
    STAR_BADGE: {
      key: '10_consecutive_5star',
      consecutiveRequired: 10,
      type: 'badge' as const,
      titleHi: '⭐ Star Worker!',
      titleEn: '⭐ Star Worker!',
    },
    CENTURY: {
      key: '100_orders_certificate',
      requiredJobs: 100,
      type: 'certificate' as const,
      titleHi: '🏆 100 Orders!',
      titleEn: '🏆 Century Club!',
    },
    PUNCTUALITY: {
      key: '20_ontime_bonus',
      requiredOnTime: 20,
      type: 'cash_bonus' as const,
      amount: 200,
      titleHi: '⏰ Punctuality Bonus!',
      titleEn: '⏰ Punctuality Bonus!',
    },
  },
} as const;

// ──────────────────────────────────────────
// 11. LOYALTY POINTS
// ──────────────────────────────────────────

export const LOYALTY = {
  POINTS_PER_RUPEE: 0.1,
  POINTS_TO_RUPEE: 0.1,
  MIN_REDEEM_POINTS: 100,
  MAX_REDEEM_POINTS: 10000,
  EXPIRY_MONTHS: 12,
} as const;

// ──────────────────────────────────────────
// 12. REVIEW TAGS (Predefined)
// ──────────────────────────────────────────

export const REVIEW_TAGS = {
  // User → Worker ke liye
  POSITIVE: [
    { key: 'punctual',      labelHi: 'समय पर आया',    labelEn: 'Punctual' },
    { key: 'professional',  labelHi: 'Professional',   labelEn: 'Professional' },
    { key: 'clean_work',    labelHi: 'साफ काम',        labelEn: 'Clean work' },
    { key: 'polite',        labelHi: 'शालीन',          labelEn: 'Polite & courteous' },
    { key: 'skilled',       labelHi: 'कुशल',           labelEn: 'Highly skilled' },
    { key: 'value_money',   labelHi: 'पैसा वसूल',      labelEn: 'Value for money' },
    { key: 'quick',         labelHi: 'जल्दी किया',     labelEn: 'Quick service' },
    { key: 'trustworthy',   labelHi: 'भरोसेमंद',       labelEn: 'Trustworthy' },
  ],
  NEGATIVE: [
    { key: 'late',          labelHi: 'देर से आया',     labelEn: 'Came late' },
    { key: 'unprofessional',labelHi: 'गैर-professional', labelEn: 'Unprofessional' },
    { key: 'poor_quality',  labelHi: 'काम अच्छा नहीं', labelEn: 'Poor work quality' },
    { key: 'rude',          labelHi: 'बदतमीज',         labelEn: 'Rude behavior' },
  ],

  // Worker → User ke liye
  USER_POSITIVE: [
    { key: 'cooperative',   labelHi: 'सहयोगी',         labelEn: 'Cooperative' },
    { key: 'clear_instructions', labelHi: 'स्पष्ट निर्देश', labelEn: 'Clear instructions' },
    { key: 'good_payment',  labelHi: 'अच्छा payment',  labelEn: 'Good payment' },
    { key: 'safe_location', labelHi: 'सुरक्षित जगह',  labelEn: 'Safe location' },
  ],
  USER_NEGATIVE: [
    { key: 'unclear_address', labelHi: 'गलत address', labelEn: 'Wrong address' },
    { key: 'rude_user',     labelHi: 'बदतमीज user',   labelEn: 'Rude behavior' },
    { key: 'scope_creep',   labelHi: 'ज्यादा काम मांगा', labelEn: 'Asked extra work' },
  ],
} as const;

// ──────────────────────────────────────────
// 13. SOS & SAFETY
// ──────────────────────────────────────────

export const SOS = {
  ACKNOWLEDGE_SLA_SECONDS: 120,
  RESOLVE_SLA_HOURS: 24,
  ESCALATE_AFTER_SECONDS: 180,
  EMERGENCY_CONTACTS: {
    POLICE: '100',
    AMBULANCE: '108',
    WOMEN_HELPLINE: '1091',
    DISASTER: '112',
  },
} as const;

// ──────────────────────────────────────────
// 14. SUPPORT SLAs (By Priority)
// ──────────────────────────────────────────

export const SUPPORT_SLA = {
  critical: {
    label: 'Critical',
    firstResponseMinutes: 5,
    resolutionHours: 4,
    color: '#DC2626',
    // SOS, active booking issues, safety concerns
    examples: ['SOS incident', 'Worker missing', 'Fraud alert'],
  },
  high: {
    label: 'High',
    firstResponseMinutes: 30,
    resolutionHours: 12,
    color: '#F97316',
    examples: ['Payment failed', 'Dispute raised', 'Refund request'],
  },
  medium: {
    label: 'Medium',
    firstResponseMinutes: 120,
    resolutionHours: 24,
    color: '#F59E0B',
    examples: ['Quality complaint', 'App issue', 'Profile problem'],
  },
  low: {
    label: 'Low',
    firstResponseMinutes: 480,
    resolutionHours: 72,
    color: '#94A3B8',
    examples: ['General query', 'Feedback', 'Feature request'],
  },
} as const;

// ──────────────────────────────────────────
// 15. DISPUTES
// ──────────────────────────────────────────

export const DISPUTE = {
  RAISE_WINDOW_HOURS: 48,
  AUTO_CLOSE_DAYS: 15,
  ESCALATION_HOURS: 24,
  MAX_EVIDENCE_FILES: 5,
  MAX_EVIDENCE_SIZE_MB: 10,
} as const;

// ──────────────────────────────────────────
// 16. JOB QUEUES (BullMQ)
// ──────────────────────────────────────────

export const QUEUES = {
  // Queue names
  NOTIFICATIONS: 'notifications',
  PAYMENTS: 'payments',
  PAYOUTS: 'payouts',
  MATCHING: 'matching',
  EMAILS: 'emails',
  SMS: 'sms',
  ANALYTICS: 'analytics',
  WORKER_REWARDS: 'worker-rewards',
  TIER_UPGRADES: 'tier-upgrades',
  FRAUD_CHECK: 'fraud-check',
  WEBHOOKS: 'webhooks',
  CLEANUP: 'cleanup',

  // Job names within queues
  JOBS: {
    // Notification jobs
    SEND_PUSH: 'send-push',
    SEND_SMS: 'send-sms',
    SEND_WHATSAPP: 'send-whatsapp',
    SEND_EMAIL: 'send-email',
    BROADCAST_BOOKING: 'broadcast-booking',

    // Payment jobs
    PROCESS_PAYMENT: 'process-payment',
    HANDLE_REFUND: 'handle-refund',
    PROCESS_PAYOUT: 'process-payout',
    CALCULATE_TDS: 'calculate-tds',

    // Worker jobs
    CHECK_TIER_UPGRADE: 'check-tier-upgrade',
    CHECK_MILESTONE: 'check-milestone',
    AUTO_OFFLINE: 'auto-offline',
    UPDATE_ACCEPTANCE_RATE: 'update-acceptance-rate',

    // Analytics
    TRACK_EVENT: 'track-event',
    GENERATE_REPORT: 'generate-report',

    // Fraud
    GPS_SPOOFING_CHECK: 'gps-spoofing-check',
    RATING_RING_CHECK: 'rating-ring-check',
    BOOKING_PATTERN_CHECK: 'booking-pattern-check',
  },
} as const;

// ──────────────────────────────────────────
// 17. CRON SCHEDULES
// ──────────────────────────────────────────

export const CRON = {
  SURGE_UPDATE: '*/5 * * * *',         // Every 5 min
  WORKER_AUTO_OFFLINE: '0 * * * *',    // Every hour
  TIER_UPGRADE_CHECK: '0 2 * * *',     // Daily 2 AM
  SUBSCRIPTION_EXPIRY: '0 9 * * *',    // Daily 9 AM
  PAYOUT_SILVER: '0 10 * * 0',         // Sunday 10 AM
  PAYOUT_GOLD_PLATINUM: '0 8 * * *',   // Daily 8 AM
  EARNINGS_SUMMARY: '0 20 * * *',      // Daily 8 PM
  TDS_CALCULATION: '0 0 1 * *',        // Monthly 1st
  LOYALTY_EXPIRY: '0 0 * * *',         // Daily midnight
  CLEANUP_EXPIRED_OTPS: '*/30 * * * *',// Every 30 min
  FRAUD_BATCH_CHECK: '0 3 * * *',      // Daily 3 AM
  DAILY_ANALYTICS: '0 1 * * *',        // Daily 1 AM
} as const;

// ──────────────────────────────────────────
// 18. WEBHOOK EVENTS
// ──────────────────────────────────────────

export const WEBHOOK_EVENTS = {
  // Razorpay
  PAYMENT_CAPTURED: 'payment.captured',
  PAYMENT_FAILED: 'payment.failed',
  REFUND_PROCESSED: 'refund.processed',
  PAYOUT_PROCESSED: 'payout.processed',
  PAYOUT_FAILED: 'payout.failed',

  // MSG91
  SMS_DELIVERED: 'sms.delivered',
  SMS_FAILED: 'sms.failed',

  // Firebase
  NOTIFICATION_DELIVERED: 'notification.delivered',
  NOTIFICATION_FAILED: 'notification.failed',
} as const;

// ──────────────────────────────────────────
// 19. NOTIFICATIONS
// ──────────────────────────────────────────

export const NOTIFICATION = {
  BOOKING_REQUEST_PRIORITY: 'high' as const,
  SOS_PRIORITY: 'high' as const,
  GENERAL_PRIORITY: 'normal' as const,
  MAX_BATCH_SIZE: 500,
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000,

  // MSG91 Template IDs (Fill karo after MSG91 registration)
  SMS_TEMPLATES: {
    OTP: 'INISTNT_OTP_TMPL',
    BOOKING_CONFIRMED: 'INISTNT_BOOK_CONF',
    WORKER_ASSIGNED: 'INISTNT_WRK_ASGN',
    ARRIVAL_OTP: 'INISTNT_ARR_OTP',
    BOOKING_COMPLETED: 'INISTNT_BOOK_COMP',
    PAYMENT_SUCCESS: 'INISTNT_PAY_SUCC',
    PAYOUT_PROCESSED: 'INISTNT_PAYOUT',
  },
} as const;

// ──────────────────────────────────────────
// 20. FILE UPLOADS
// ──────────────────────────────────────────

export const UPLOAD = {
  IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'] as const,
  DOCUMENT_TYPES: ['image/jpeg', 'image/png', 'application/pdf'] as const,
  PROFILE_PHOTO_MAX_MB: 5,
  DOCUMENT_MAX_MB: 10,
  BOOKING_PHOTO_MAX_MB: 10,
  DISPUTE_EVIDENCE_MAX_MB: 10,
  PROFILE_PHOTO_MAX_WIDTH: 1024,
  PROFILE_PHOTO_MAX_HEIGHT: 1024,
  BOOKING_PHOTOS_MAX: 10,
  DISPUTE_EVIDENCE_MAX: 5,
  PRESIGNED_URL_EXPIRY_SEC: 300,
} as const;

// ──────────────────────────────────────────
// 21. CHAT
// ──────────────────────────────────────────

export const CHAT = {
  MAX_MESSAGE_LENGTH: 1000,
  MAX_MEDIA_SIZE_MB: 10,
  ALLOWED_MEDIA_TYPES: ['image/jpeg', 'image/png', 'image/webp'] as const,
  MESSAGE_HISTORY_DAYS: 90,    // 90 din tak history rakho
  TYPING_TIMEOUT_MS: 3000,     // 3 sec typing indicator
  MAX_MESSAGES_PER_MINUTE: 10, // Rate limit
} as const;

// ──────────────────────────────────────────
// 22. ANALYTICS EVENTS
// ──────────────────────────────────────────

export const ANALYTICS_EVENTS = {
  // App lifecycle
  APP_OPENED: 'app_opened',
  APP_BACKGROUNDED: 'app_backgrounded',

  // Auth
  OTP_REQUESTED: 'otp_requested',
  OTP_VERIFIED: 'otp_verified',
  LOGIN_SUCCESS: 'login_success',
  LOGOUT: 'logout',

  // Discovery
  HOME_VIEWED: 'home_viewed',
  CATEGORY_VIEWED: 'category_viewed',
  SERVICE_SEARCHED: 'service_searched',
  SERVICE_VIEWED: 'service_viewed',
  WORKER_PROFILE_VIEWED: 'worker_profile_viewed',

  // Booking funnel
  BOOKING_INITIATED: 'booking_initiated',
  ADDRESS_SELECTED: 'address_selected',
  PAYMENT_METHOD_SELECTED: 'payment_method_selected',
  BOOKING_CONFIRMED: 'booking_confirmed',
  WORKER_ACCEPTED: 'worker_accepted',
  WORKER_REJECTED: 'worker_rejected',
  BOOKING_CANCELLED: 'booking_cancelled',
  BOOKING_COMPLETED: 'booking_completed',

  // Payment
  PAYMENT_INITIATED: 'payment_initiated',
  PAYMENT_SUCCESS: 'payment_success',
  PAYMENT_FAILED: 'payment_failed',
  COUPON_APPLIED: 'coupon_applied',
  WALLET_USED: 'wallet_used',

  // Post-booking
  REVIEW_SUBMITTED: 'review_submitted',
  DISPUTE_RAISED: 'dispute_raised',
  SOS_TRIGGERED: 'sos_triggered',

  // Growth
  REFERRAL_SHARED: 'referral_shared',
  REFERRAL_CODE_APPLIED: 'referral_code_applied',
  POINTS_REDEEMED: 'points_redeemed',
  NOTIFICATION_OPENED: 'notification_opened',

  // Worker specific
  WORKER_WENT_ONLINE: 'worker_went_online',
  WORKER_WENT_OFFLINE: 'worker_went_offline',
  BOOKING_REQUEST_RECEIVED: 'booking_request_received',
  PAYOUT_REQUESTED: 'payout_requested',
  SUBSCRIPTION_PURCHASED: 'subscription_purchased',
} as const;

// ──────────────────────────────────────────
// 23. ADMIN PERMISSIONS
// ──────────────────────────────────────────

export const PERMISSIONS = {
  super_admin: [
    'all',                        // Sab kuch
  ],
  city_admin: [
    'view_city_dashboard',
    'manage_workers_city',
    'manage_bookings_city',
    'view_analytics_city',
    'manage_pricing_city',
    'approve_refunds_city',       // Up to ₹2000
    'manage_staff_city',
    'view_disputes_city',
    'resolve_disputes_city',
  ],
  finance_admin: [
    'view_finance_dashboard',
    'process_payouts',
    'approve_refunds',            // Any amount
    'view_tds_reports',
    'export_financial_data',
    'manage_subscriptions',
  ],
  analytics_admin: [
    'view_analytics_dashboard',
    'export_reports',
    'view_user_data',             // Anonymized only
  ],
  city_manager: [
    'view_city_ops',
    'view_workers_city',
    'view_bookings_city',
    'handle_sos',
    'handle_disputes_basic',
    'approve_refunds_small',      // Up to ₹500
  ],
  support_agent: [
    'view_booking_details',
    'view_user_profile',
    'view_worker_profile',
    'add_internal_notes',
    'reassign_worker',
    'raise_dispute',
    'view_chat',
  ],
  field_supervisor: [
    'verify_worker_documents',
    'conduct_training',
    'view_worker_profile',
    'add_worker_notes',
  ],
  qa_analyst: [
    'view_all_bookings',
    'flag_suspicious_activity',
    'view_fraud_reports',
    'add_fraud_flags',
  ],
} as const;

// ──────────────────────────────────────────
// 24. CITY TIERS
// ──────────────────────────────────────────

export const CITY_TIERS = {
  T1: {
    label: 'Metro',
    cities: ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad', 'Kolkata'],
    defaultSearchRadius: 15,
    maxSearchRadius: 30,
  },
  T2: {
    label: 'Large',
    cities: ['Jaipur', 'Pune', 'Ahmedabad', 'Lucknow', 'Surat', 'Kanpur', 'Nagpur', 'Indore'],
    defaultSearchRadius: 10,
    maxSearchRadius: 25,
  },
  T3: {
    label: 'Mid',
    cities: [],
    defaultSearchRadius: 8,
    maxSearchRadius: 20,
  },
  T4: {
    label: 'Small',
    cities: [],
    defaultSearchRadius: 5,
    maxSearchRadius: 15,
  },
} as const;

// ──────────────────────────────────────────
// 25. INDIAN STATES
// ──────────────────────────────────────────

export const INDIAN_STATES = [
  { code: 'AN', name: 'Andaman and Nicobar Islands' },
  { code: 'AP', name: 'Andhra Pradesh' },
  { code: 'AR', name: 'Arunachal Pradesh' },
  { code: 'AS', name: 'Assam' },
  { code: 'BR', name: 'Bihar' },
  { code: 'CH', name: 'Chandigarh' },
  { code: 'CT', name: 'Chhattisgarh' },
  { code: 'DN', name: 'Dadra and Nagar Haveli' },
  { code: 'DD', name: 'Daman and Diu' },
  { code: 'DL', name: 'Delhi' },
  { code: 'GA', name: 'Goa' },
  { code: 'GJ', name: 'Gujarat' },
  { code: 'HR', name: 'Haryana' },
  { code: 'HP', name: 'Himachal Pradesh' },
  { code: 'JK', name: 'Jammu and Kashmir' },
  { code: 'JH', name: 'Jharkhand' },
  { code: 'KA', name: 'Karnataka' },
  { code: 'KL', name: 'Kerala' },
  { code: 'LA', name: 'Ladakh' },
  { code: 'LD', name: 'Lakshadweep' },
  { code: 'MP', name: 'Madhya Pradesh' },
  { code: 'MH', name: 'Maharashtra' },
  { code: 'MN', name: 'Manipur' },
  { code: 'ML', name: 'Meghalaya' },
  { code: 'MZ', name: 'Mizoram' },
  { code: 'NL', name: 'Nagaland' },
  { code: 'OR', name: 'Odisha' },
  { code: 'PY', name: 'Puducherry' },
  { code: 'PB', name: 'Punjab' },
  { code: 'RJ', name: 'Rajasthan' },
  { code: 'SK', name: 'Sikkim' },
  { code: 'TN', name: 'Tamil Nadu' },
  { code: 'TG', name: 'Telangana' },
  { code: 'TR', name: 'Tripura' },
  { code: 'UP', name: 'Uttar Pradesh' },
  { code: 'UT', name: 'Uttarakhand' },
  { code: 'WB', name: 'West Bengal' },
] as const;

// ──────────────────────────────────────────
// 26. ERROR CODES
// ──────────────────────────────────────────

export const ERROR_CODES = {
  INVALID_OTP: 'INVALID_OTP',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_MAX_ATTEMPTS: 'OTP_MAX_ATTEMPTS',
  OTP_RATE_LIMIT: 'OTP_RATE_LIMIT',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  WORKER_NOT_FOUND: 'WORKER_NOT_FOUND',
  WORKER_SUSPENDED: 'WORKER_SUSPENDED',
  WORKER_BANNED: 'WORKER_BANNED',
  WORKER_OFFLINE: 'WORKER_OFFLINE',
  WORKER_BUSY: 'WORKER_BUSY',
  BOOKING_NOT_FOUND: 'BOOKING_NOT_FOUND',
  BOOKING_ALREADY_ASSIGNED: 'BOOKING_ALREADY_ASSIGNED',
  BOOKING_CANNOT_CANCEL: 'BOOKING_CANNOT_CANCEL',
  BOOKING_INVALID_STATUS: 'BOOKING_INVALID_STATUS',
  NO_WORKER_FOUND: 'NO_WORKER_FOUND',
  INVALID_OTP_LOCATION: 'INVALID_OTP_LOCATION',
  DUPLICATE_BOOKING: 'DUPLICATE_BOOKING',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_ALREADY_DONE: 'PAYMENT_ALREADY_DONE',
  INVALID_COUPON: 'INVALID_COUPON',
  COUPON_EXPIRED: 'COUPON_EXPIRED',
  COUPON_LIMIT_REACHED: 'COUPON_LIMIT_REACHED',
  INSUFFICIENT_POINTS: 'INSUFFICIENT_POINTS',
  PAYOUT_MIN_AMOUNT: 'PAYOUT_MIN_AMOUNT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_LOCATION: 'INVALID_LOCATION',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  NOT_FOUND: 'NOT_FOUND',
} as const;

export const ERROR_MESSAGES: Record<string, { en: string; hi: string }> = {
  [ERROR_CODES.INVALID_OTP]: {
    en: 'Invalid OTP. Please check and try again.',
    hi: 'OTP galat hai. Dobara check karein.',
  },
  [ERROR_CODES.OTP_EXPIRED]: {
    en: 'OTP has expired. Please request a new one.',
    hi: 'OTP expire ho gaya. Naya OTP mangaiye.',
  },
  [ERROR_CODES.NO_WORKER_FOUND]: {
    en: 'No worker available right now. Please try again.',
    hi: 'Abhi koi worker available nahi hai. Thodi der baad try karein.',
  },
  [ERROR_CODES.BOOKING_CANNOT_CANCEL]: {
    en: 'Booking cannot be cancelled at this stage.',
    hi: 'Is stage pe booking cancel nahi ho sakti.',
  },
  [ERROR_CODES.PAYMENT_FAILED]: {
    en: 'Payment failed. Please try again.',
    hi: 'Payment fail ho gayi. Dobara try karein.',
  },
  [ERROR_CODES.INTERNAL_ERROR]: {
    en: 'Something went wrong. Please try again.',
    hi: 'Kuch gadbad ho gayi. Thodi der mein try karein.',
  },
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: {
    en: 'Too many requests. Please wait and try again.',
    hi: 'Bahut zyada requests. Thodi der ruk ke try karein.',
  },
  [ERROR_CODES.INVALID_COUPON]: {
    en: 'This coupon is invalid or has expired.',
    hi: 'Yeh coupon invalid hai ya expire ho gaya.',
  },
  [ERROR_CODES.INSUFFICIENT_POINTS]: {
    en: 'You do not have enough loyalty points.',
    hi: 'Aapke paas itne points nahi hain.',
  },
} as const;

// ──────────────────────────────────────────
// 27. REGEX PATTERNS
// ──────────────────────────────────────────

export const REGEX = {
  INDIAN_MOBILE: /^[6-9]\d{9}$/,
  INDIAN_PINCODE: /^[1-9][0-9]{5}$/,
  IFSC_CODE: /^[A-Z]{4}0[A-Z0-9]{6}$/,
  UPI_ID: /^[\w.\-_]{3,}@[a-zA-Z]{3,}$/,
  AADHAAR: /^[2-9]\d{11}$/,
  PAN_CARD: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  OTP_6: /^\d{6}$/,
  OTP_4: /^\d{4}$/,
  COUPON_CODE: /^[A-Z0-9]{3,20}$/,
  REFERRAL_CODE: /^[A-Z]{3}\d{4}$/,
} as const;

// ──────────────────────────────────────────
// 28. MATCHING ALGORITHM WEIGHTS
// ──────────────────────────────────────────

export const MATCHING_WEIGHTS = {
  DISTANCE: 0.40,
  RATING: 0.25,
  ACCEPTANCE_RATE: 0.10,
  COMPLETION_RATE: 0.10,
  TIER: 0.08,
  SUBSCRIPTION: 0.05,
  RESPONSE_LATENCY: 0.02,
  RANDOMIZATION: 5,
} as const;

// ──────────────────────────────────────────
// 29. FEATURE FLAGS KEYS
// ──────────────────────────────────────────

export const FEATURE_FLAGS = {
  WALKY_TALKY_ENABLED: 'WALKY_TALKY_ENABLED',
  LIVE_GPS_TRACKING: 'LIVE_GPS_TRACKING',
  SURGE_PRICING_ACTIVE: 'SURGE_PRICING_ACTIVE',
  CASH_PAYMENTS_ALLOWED: 'CASH_PAYMENTS_ALLOWED',
  SCHEDULED_JOBS_ENABLED: 'SCHEDULED_JOBS_ENABLED',
  WORKER_REGISTRATION_OPEN: 'WORKER_REGISTRATION_OPEN',
  REFERRAL_PROGRAM_ACTIVE: 'REFERRAL_PROGRAM_ACTIVE',
  LOYALTY_POINTS_ACTIVE: 'LOYALTY_POINTS_ACTIVE',
  INSURANCE_OPTION_VISIBLE: 'INSURANCE_OPTION_VISIBLE',
  TRAINING_MODULE_ENABLED: 'TRAINING_MODULE_ENABLED',
  MEILISEARCH_ACTIVE: 'MEILISEARCH_ACTIVE',
  WHATSAPP_OTP_PRIMARY: 'WHATSAPP_OTP_PRIMARY',
  AUTO_TIER_UPGRADE: 'AUTO_TIER_UPGRADE',
} as const;