// ═══════════════════════════════════════════════════════════
// INISTNT — Complete TypeScript Type Definitions
// Version: 1.0.0
// Yeh file POORE platform ka data define karti hai
// Sab apps (web, mobile, backend) yahi share karti hain
// ═══════════════════════════════════════════════════════════

// ──────────────────────────────────────────
// 1. COMMON / UTILITY TYPES
// ──────────────────────────────────────────

export type ID = string; // UUID v4
export type Timestamp = Date;
export type PhoneNumber = string; // +91XXXXXXXXXX
export type LatLng = { lat: number; lng: number };
export type Currency = number; // Always in paise (₹1 = 100 paise)
export type Percentage = number; // 0-100

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

// Standard API response — har endpoint yahi return karta hai
export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  message: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: PaginationMeta;
  timestamp: string;
}

// ──────────────────────────────────────────
// 2. LOCATION & GEOGRAPHY
// ──────────────────────────────────────────

export interface Location {
  lat: number;
  lng: number;
  accuracy?: number;      // GPS accuracy in meters
  altitude?: number;
  heading?: number;       // Direction worker ja raha hai
  speed?: number;         // km/h
  timestamp?: Timestamp;
}

export interface Address {
  id: ID;
  userId: ID;
  label: string;          // "Ghar" | "Office" | "Other"
  fullAddress: string;    // Complete address
  flatNo: string | null;
  building: string | null;
  street: string | null;
  landmark: string | null;
  area: string;           // Locality/Colony name
  city: string;
  state: string;
  pincode: string;
  lat: number;
  lng: number;
  isDefault: boolean;
  createdAt: Timestamp;
}

export type CityTier = 'T1' | 'T2' | 'T3' | 'T4';
export type CityStatus = 'pre_launch' | 'soft_launch' | 'active' | 'maintenance' | 'deactivated';

export interface City {
  id: ID;
  nameHi: string;         // "जयपुर"
  nameEn: string;         // "Jaipur"
  state: string;
  tier: CityTier;
  status: CityStatus;
  lat: number;
  lng: number;
  timezone: string;       // "Asia/Kolkata"
  isActive: boolean;
  launchedAt: Timestamp | null;
  createdAt: Timestamp;
}

export interface SurgeZone {
  id: ID;
  cityId: ID;
  name: string;           // "Mansarovar Zone"
  polygon: LatLng[];      // Zone boundary points
  currentMultiplier: number;
  demandCount: number;
  supplyCount: number;
  isActive: boolean;
  updatedAt: Timestamp;
}

// ──────────────────────────────────────────
// 3. USER (CUSTOMER)
// ──────────────────────────────────────────

export type UserStatus = 'active' | 'suspended' | 'deleted';

export interface User {
  id: ID;
  mobile: PhoneNumber;
  name: string | null;
  email: string | null;
  profilePhoto: string | null;  // Cloudflare R2 URL
  city: string | null;
  status: UserStatus;
  rozgarPoints: number;         // Loyalty points
  totalBookings: number;
  totalSpent: Currency;
  referralCode: string;         // Unique referral code
  referredBy: ID | null;        // Kaun laya tha
  fcmTokens: string[];          // Multiple devices support
  preferredLanguage: 'hi' | 'en';
  isPhoneVerified: boolean;
  lastActiveAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserSession {
  id: ID;
  userId: ID;
  userType: 'user' | 'worker' | 'admin' | 'support';
  refreshToken: string;
  deviceId: string;
  deviceName: string;           // "Redmi Note 12"
  deviceOs: string;             // "Android 13"
  ipAddress: string;
  isActive: boolean;
  expiresAt: Timestamp;
  createdAt: Timestamp;
}

// ──────────────────────────────────────────
// 4. WORKER
// ──────────────────────────────────────────

export type WorkerTier = 'new' | 'verified' | 'trusted' | 'elite';
export type WorkerStatus = 'online' | 'offline' | 'busy' | 'suspended' | 'banned';
export type SubscriptionPlan = 'free' | 'silver' | 'gold' | 'platinum';
export type VerificationStatus = 'pending' | 'in_review' | 'approved' | 'rejected';

export interface Worker {
  id: ID;
  mobile: PhoneNumber;
  name: string;
  profilePhoto: string | null;
  tier: WorkerTier;
  status: WorkerStatus;
  city: string;

  // Location (live)
  lat: number | null;
  lng: number | null;
  lastLocationAt: Timestamp | null;

  // Performance stats
  rating: number;               // 0.00 - 5.00
  totalReviews: number;
  totalJobs: number;
  completedJobs: number;
  cancelledJobs: number;
  completionRate: Percentage;
  acceptanceRate: Percentage;
  avgResponseTime: number;      // Seconds mein

  // Verification
  isVerified: boolean;
  isAadhaarVerified: boolean;
  isPoliceVerified: boolean;
  verificationStatus: VerificationStatus;

  // Subscription
  subscriptionPlan: SubscriptionPlan;
  subscriptionStartedAt: Timestamp | null;
  subscriptionExpiresAt: Timestamp | null;

  // Finance
  totalEarnings: Currency;
  pendingPayout: Currency;
  lifetimeEarnings: Currency;
  bankAccountNumber: string | null;  // Encrypted
  ifscCode: string | null;
  upiId: string | null;

  // Rewards
  tshirtEarned: boolean;
  tshirtSize: 'S' | 'M' | 'L' | 'XL' | 'XXL' | null;
  badgesEarned: string[];

  // App
  fcmTokens: string[];
  preferredLanguage: 'hi' | 'en';
  referralCode: string;
  referredBy: ID | null;

  // Fraud/Trust
  platformTrustScore: number;   // 0-100, internal only
  fraudFlags: number;
  isSuspicious: boolean;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface WorkerSkill {
  id: ID;
  workerId: ID;
  serviceId: ID;
  serviceName: string;
  yearsExperience: number;
  isVerified: boolean;         // Admin ne verify kiya
  certificateUrl: string | null;
  addedAt: Timestamp;
}

export interface WorkerDocument {
  id: ID;
  workerId: ID;
  type: 'aadhaar_front' | 'aadhaar_back' | 'selfie' | 'pan' | 'police_cert' | 'skill_cert' | 'other';
  fileUrl: string;             // Cloudflare R2 URL
  status: VerificationStatus;
  verifiedBy: ID | null;       // Admin ID
  verifiedAt: Timestamp | null;
  rejectionReason: string | null;
  uploadedAt: Timestamp;
}

export interface WorkerVerification {
  id: ID;
  workerId: ID;
  aadhaarNumber: string;       // Last 4 digits only (masked)
  aadhaarHash: string;         // SHA-256 hash (blacklist check)
  selfieMatchScore: number;    // AI score 0-100
  selfieMatchStatus: 'matched' | 'mismatch' | 'pending';
  otpVerifiedAt: Timestamp | null;
  policeVerificationId: string | null;
  backgroundCheckStatus: VerificationStatus;
  reviewedBy: ID | null;
  reviewedAt: Timestamp | null;
  notes: string | null;
  createdAt: Timestamp;
}

// ──────────────────────────────────────────
// 5. SERVICES & PRICING
// ──────────────────────────────────────────

export interface ServiceCategory {
  id: ID;
  nameHi: string;              // "घर की सफाई"
  nameEn: string;              // "Home Cleaning"
  iconUrl: string;
  displayOrder: number;
  isActive: boolean;
}

export interface Service {
  id: ID;
  categoryId: ID;
  nameHi: string;
  nameEn: string;
  descriptionHi: string | null;
  descriptionEn: string | null;
  iconUrl: string | null;
  heroImages: string[];
  estimatedDurationMin: number; // hours
  estimatedDurationMax: number; // hours
  isActive: boolean;
  searchTags: string[];         // NLP matching ke liye
  createdAt: Timestamp;
}

export interface SubService {
  id: ID;
  serviceId: ID;
  nameHi: string;
  nameEn: string;
  basePrice: Currency;
  hourlyRate: Currency;
  isActive: boolean;
}

export interface ServicePricing {
  id: ID;
  serviceId: ID;
  cityId: ID;
  workerTier: WorkerTier;
  basePrice: Currency;
  hourlyRate: Currency;
  minimumCharge: Currency;
  platformFee: Currency;
  isActive: boolean;
  updatedAt: Timestamp;
}

// ──────────────────────────────────────────
// 6. BOOKING — Core of the Platform
// ──────────────────────────────────────────

export type BookingStatus =
  | 'searching'       // Worker dhundh rahe hain
  | 'assigned'        // Worker mila
  | 'en_route'        // Worker aa raha hai
  | 'arrived'         // Worker pahuncha (Arrival OTP pending)
  | 'in_progress'     // Kaam chal raha hai
  | 'completed'       // Kaam khatam (Completion OTP done)
  | 'cancelled'       // Cancel hua
  | 'disputed'        // Dispute raised
  | 'sos_active';     // SOS triggered during booking

export type PaymentMethod = 'upi' | 'card' | 'cash' | 'wallet';
export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'partially_refunded' | 'failed';
export type BookingType = 'instant' | 'scheduled';

export interface Booking {
  id: ID;
  bookingNumber: string;        // "INS-2025-001234" — human readable
  userId: ID;
  workerId: ID | null;
  serviceId: ID;
  subServiceId: ID | null;
  cityId: ID;
  type: BookingType;
  status: BookingStatus;

  // Location
  address: string;
  lat: number;
  lng: number;
  landmark: string | null;

  // Timing
  scheduledAt: Timestamp | null;
  searchStartedAt: Timestamp | null;
  assignedAt: Timestamp | null;
  workerEnRouteAt: Timestamp | null;
  workerArrivedAt: Timestamp | null;
  workStartedAt: Timestamp | null;
  completedAt: Timestamp | null;
  cancelledAt: Timestamp | null;

  // OTP
  arrivalOtp: string | null;
  completionOtp: string | null;
  arrivalOtpVerifiedAt: Timestamp | null;
  completionOtpVerifiedAt: Timestamp | null;
  arrivalGpsLat: number | null;
  arrivalGpsLng: number | null;
  completionGpsLat: number | null;
  completionGpsLng: number | null;

  // Finance
  estimatedAmount: Currency;
  finalAmount: Currency | null;
  platformFee: Currency;
  commission: Currency;
  workerEarning: Currency;
  surgeMultiplier: number;
  surgeZoneId: ID | null;
  discountAmount: Currency;
  couponCode: string | null;
  walletAmountUsed: Currency;

  // Payment
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  paidAt: Timestamp | null;

  // Matching
  broadcastRounds: number;      // Kitne rounds mein mila worker
  matchingTimeSeconds: number | null;

  // Content
  specialInstructions: string | null;
  beforePhotos: string[];       // User ne pehle upload kiye
  afterPhotos: string[];        // Worker ne baad mein upload kiye
  workerNotes: string | null;

  // Cancellation
  cancelledBy: 'user' | 'worker' | 'system' | 'admin' | null;
  cancellationReason: string | null;
  cancellationFee: Currency;

  // System
  idempotencyKey: string;       // Duplicate booking prevent
  isSosTriggered: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface BookingTimeline {
  bookingId: ID;
  events: BookingTimelineEvent[];
}

export interface BookingTimelineEvent {
  id: ID;
  bookingId: ID;
  event: string;
  description: string;
  performedBy: 'user' | 'worker' | 'system' | 'admin';
  performedById: ID | null;
  lat: number | null;
  lng: number | null;
  metadata: Record<string, unknown>;
  createdAt: Timestamp;
}

// ──────────────────────────────────────────
// 7. MATCHING ENGINE
// ──────────────────────────────────────────

export interface MatchingRequest {
  bookingId: ID;
  serviceId: ID;
  cityId: ID;
  lat: number;
  lng: number;
  requiredTier?: WorkerTier;
  preferredGender?: 'male' | 'female' | 'any';
  scheduledAt?: Timestamp;
}

export interface WorkerMatchScore {
  workerId: ID;
  totalScore: number;           // 0-100
  distanceScore: number;
  ratingScore: number;
  acceptanceScore: number;
  completionScore: number;
  tierScore: number;
  subscriptionScore: number;
  distanceKm: number;
  estimatedArrivalMinutes: number;
}

export interface BroadcastRound {
  round: number;
  workerIds: ID[];
  notifiedAt: Timestamp;
  expiresAt: Timestamp;
  radiusKm: number;
}

// ──────────────────────────────────────────
// 8. PAYMENT & FINANCE
// ──────────────────────────────────────────

export type TransactionType =
  | 'booking_payment'
  | 'refund'
  | 'payout'
  | 'commission'
  | 'platform_fee'
  | 'subscription'
  | 'referral_bonus'
  | 'incentive_bonus'
  | 'tds_deduction'
  | 'wallet_credit'
  | 'wallet_debit'
  | 'cancellation_fee';

export interface Transaction {
  id: ID;
  bookingId: ID | null;
  userId: ID | null;
  workerId: ID | null;
  type: TransactionType;
  amount: Currency;
  currency: 'INR';
  status: 'pending' | 'processing' | 'success' | 'failed';
  razorpayId: string | null;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: Timestamp;
}

export interface WorkerPayout {
  id: ID;
  workerId: ID;
  amount: Currency;
  tdsDeducted: Currency;
  netAmount: Currency;
  payoutMethod: 'bank' | 'upi';
  accountDetails: string;      // Masked
  razorpayPayoutId: string | null;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'on_hold';
  failureReason: string | null;
  processedAt: Timestamp | null;
  period: string;              // "2025-01" monthly period
  createdAt: Timestamp;
}

export interface WorkerWallet {
  workerId: ID;
  balance: Currency;
  pendingAmount: Currency;
  totalEarned: Currency;
  totalWithdrawn: Currency;
  updatedAt: Timestamp;
}

export type SubscriptionPlanDetails = {
  plan: SubscriptionPlan;
  nameHi: string;
  nameEn: string;
  priceMonthly: Currency;
  priceYearly: Currency;
  features: string[];
  bookingLimit: number | null;  // null = unlimited
  payoutFrequency: 'daily' | 'weekly' | 'monthly';
  commissionRate: Percentage;
  priorityBoost: number;       // Matching score boost
};

// ──────────────────────────────────────────
// 9. REVIEWS & RATINGS
// ──────────────────────────────────────────

export interface Review {
  id: ID;
  bookingId: ID;
  reviewerId: ID;
  revieweeId: ID;
  reviewerType: 'user' | 'worker';
  rating: 1 | 2 | 3 | 4 | 5;
  review: string | null;
  tags: string[];              // "Punctual" | "Professional" | "Clean work"
  isPublic: boolean;
  isFlagged: boolean;          // Fraud suspected
  flagReason: string | null;
  response: string | null;     // Worker ka reply
  createdAt: Timestamp;
}

// ──────────────────────────────────────────
// 10. DISPUTES & REFUNDS
// ──────────────────────────────────────────

export type DisputeStatus =
  | 'open'
  | 'under_review'
  | 'escalated'
  | 'resolved'
  | 'closed';

export type DisputeReason =
  | 'quality_issue'
  | 'payment_issue'
  | 'worker_behaviour'
  | 'worker_no_show'
  | 'wrong_service'
  | 'otp_issue'
  | 'overcharging'
  | 'other';

export type DisputeResolution =
  | 'full_refund'
  | 'partial_refund'
  | 'no_refund'
  | 'worker_warning'
  | 'user_warning'
  | 'worker_suspended'
  | 'platform_error_refund';

export interface Dispute {
  id: ID;
  ticketNumber: string;        // "DIS-2025-0001"
  bookingId: ID;
  raisedById: ID;
  raisedByType: 'user' | 'worker';
  reason: DisputeReason;
  description: string;
  evidenceUrls: string[];
  status: DisputeStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo: ID | null;       // Support agent ID
  resolution: DisputeResolution | null;
  resolutionNotes: string | null;
  refundAmount: Currency | null;
  resolvedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ──────────────────────────────────────────
// 11. SOS & SAFETY
// ──────────────────────────────────────────

export type SosStatus = 'active' | 'acknowledged' | 'resolved' | 'false_alarm';
export type SosTrigger = 'user_panic' | 'worker_panic' | 'auto_detect';

export interface SosIncident {
  id: ID;
  incidentNumber: string;      // "SOS-2025-001"
  bookingId: ID;
  triggeredBy: ID;
  triggeredByType: 'user' | 'worker';
  trigger: SosTrigger;
  status: SosStatus;
  lat: number;
  lng: number;
  address: string;
  acknowledgedBy: ID | null;
  acknowledgedAt: Timestamp | null;
  acknowledgeTimeSecs: number | null;
  resolvedBy: ID | null;
  resolvedAt: Timestamp | null;
  outcome: string | null;
  incidentReport: string | null;
  emergencyServicesDispatched: boolean;
  createdAt: Timestamp;
}

// ──────────────────────────────────────────
// 12. NOTIFICATIONS
// ──────────────────────────────────────────

export type NotificationChannel = 'push' | 'sms' | 'whatsapp' | 'email' | 'in_app';

export type NotificationType =
  | 'booking_request'
  | 'booking_assigned'
  | 'booking_cancelled'
  | 'worker_en_route'
  | 'worker_arrived'
  | 'booking_completed'
  | 'payment_received'
  | 'payout_processed'
  | 'review_received'
  | 'dispute_update'
  | 'sos_alert'
  | 'verification_update'
  | 'subscription_expiry'
  | 'reward_earned'
  | 'referral_bonus'
  | 'system_announcement';

export interface Notification {
  id: ID;
  recipientId: ID;
  recipientType: 'user' | 'worker' | 'admin' | 'support';
  channel: NotificationChannel;
  type: NotificationType;
  title: string;
  body: string;
  imageUrl: string | null;
  data: Record<string, unknown>;
  isRead: boolean;
  isSent: boolean;
  sentAt: Timestamp | null;
  readAt: Timestamp | null;
  createdAt: Timestamp;
}

// ──────────────────────────────────────────
// 13. CHAT & COMMUNICATION
// ──────────────────────────────────────────

export type MessageType = 'text' | 'image' | 'audio' | 'location' | 'system';
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed';

export interface ChatMessage {
  id: ID;
  bookingId: ID;
  senderId: ID;
  senderType: 'user' | 'worker' | 'system' | 'support';
  type: MessageType;
  content: string;
  mediaUrl: string | null;
  location: LatLng | null;
  status: MessageStatus;
  isDeleted: boolean;
  createdAt: Timestamp;
}

// ──────────────────────────────────────────
// 14. REWARDS & GROWTH
// ──────────────────────────────────────────

export type RewardType = 'tshirt' | 'cash_bonus' | 'badge' | 'certificate' | 'subscription_upgrade';
export type RewardStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'credited';

export interface WorkerReward {
  id: ID;
  workerId: ID;
  type: RewardType;
  milestone: string;           // "5_orders_4star_rating"
  title: string;               // "5 Orders Complete! T-Shirt Mila!"
  description: string;
  status: RewardStatus;
  amount: Currency | null;
  tshirtSize: string | null;
  shippingAddress: string | null;
  trackingId: string | null;
  earnedAt: Timestamp;
  deliveredAt: Timestamp | null;
}

export interface ReferralRecord {
  id: ID;
  referrerId: ID;
  referrerType: 'user' | 'worker';
  refereeId: ID;
  refereeType: 'user' | 'worker';
  referralCode: string;
  status: 'pending' | 'qualified' | 'rewarded' | 'fraud';
  qualifiedAt: Timestamp | null;  // Jab first booking complete
  referrerReward: Currency;
  refereeReward: Currency;
  rewardedAt: Timestamp | null;
  createdAt: Timestamp;
}

export interface LoyaltyPoints {
  userId: ID;
  totalPoints: number;
  availablePoints: number;
  redeemedPoints: number;
  expiringPoints: number;
  expiringAt: Timestamp | null;
  updatedAt: Timestamp;
}

// ──────────────────────────────────────────
// 15. FRAUD & TRUST
// ──────────────────────────────────────────

export type FraudFlagType =
  | 'gps_spoofing'
  | 'otp_proximity_mismatch'
  | 'rating_ring'
  | 'fake_booking'
  | 'multiple_accounts'
  | 'device_sharing'
  | 'chargeback_pattern'
  | 'abnormal_completion_speed'
  | 'suspicious_cash_pattern';

export type FraudFlagSeverity = 'low' | 'medium' | 'high' | 'critical';
export type FraudFlagStatus = 'open' | 'under_review' | 'confirmed' | 'dismissed';

export interface FraudFlag {
  id: ID;
  entityId: ID;
  entityType: 'user' | 'worker' | 'booking';
  flagType: FraudFlagType;
  severity: FraudFlagSeverity;
  status: FraudFlagStatus;
  evidence: Record<string, unknown>;
  description: string;
  detectedBy: 'system' | 'admin' | 'support';
  reviewedBy: ID | null;
  reviewedAt: Timestamp | null;
  actionTaken: string | null;
  createdAt: Timestamp;
}

// ──────────────────────────────────────────
// 16. AUDIT LOG
// ──────────────────────────────────────────

export type AuditAction =
  | 'create' | 'update' | 'delete'
  | 'approve' | 'reject' | 'suspend'
  | 'ban' | 'activate' | 'login'
  | 'logout' | 'export' | 'refund'
  | 'payout' | 'toggle' | 'escalate';

export interface AuditLog {
  id: ID;
  actorId: ID;
  actorType: 'admin' | 'support' | 'system';
  actorRole: string;
  action: AuditAction;
  entityType: string;
  entityId: ID;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  description: string;
  ipAddress: string;
  userAgent: string;
  createdAt: Timestamp;
}

// ──────────────────────────────────────────
// 17. STAFF & ADMIN
// ──────────────────────────────────────────

export type AdminRole =
  | 'super_admin'
  | 'city_admin'
  | 'finance_admin'
  | 'analytics_admin';

export type SupportRole =
  | 'city_manager'
  | 'support_agent'
  | 'field_supervisor'
  | 'qa_analyst';

export type StaffRole = AdminRole | SupportRole;

export interface Staff {
  id: ID;
  name: string;
  email: string;
  mobile: PhoneNumber;
  role: StaffRole;
  assignedCities: string[];
  isActive: boolean;
  isTwoFactorEnabled: boolean;
  lastActiveAt: Timestamp | null;
  invitedBy: ID | null;
  createdAt: Timestamp;
}

// ──────────────────────────────────────────
// 18. ANALYTICS EVENTS
// ──────────────────────────────────────────

export type AnalyticsEvent =
  | 'app_opened'
  | 'service_viewed'
  | 'booking_initiated'
  | 'booking_completed'
  | 'booking_cancelled'
  | 'search_performed'
  | 'worker_profile_viewed'
  | 'payment_initiated'
  | 'payment_completed'
  | 'review_submitted'
  | 'sos_triggered'
  | 'referral_shared'
  | 'notification_opened';

export interface AnalyticsEventPayload {
  event: AnalyticsEvent;
  userId: ID | null;
  workerId: ID | null;
  sessionId: string;
  properties: Record<string, unknown>;
  deviceInfo: {
    platform: 'ios' | 'android' | 'web';
    os: string;
    appVersion: string;
  };
  timestamp: Timestamp;
}

// ──────────────────────────────────────────
// 19. AUTH TOKENS
// ──────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;           // Seconds
}

export interface JwtPayload {
  id: ID;
  mobile: PhoneNumber;
  type: 'user' | 'worker' | 'admin' | 'support';
  role?: StaffRole;
  iat: number;
  exp: number;
}

// ──────────────────────────────────────────
// 20. FEATURE FLAGS
// ──────────────────────────────────────────

export interface FeatureFlag {
  key: string;
  name: string;
  description: string;
  isEnabled: boolean;
  rolloutPercentage: number;
  enabledCities: string[];
  updatedAt: Timestamp;
}