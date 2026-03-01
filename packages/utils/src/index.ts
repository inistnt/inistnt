// ═══════════════════════════════════════════════════════════
// INISTNT — Complete Utility Functions v2.0
// Sab apps yeh share karte hain
// ═══════════════════════════════════════════════════════════

// ──────────────────────────────────────────
// 1. PRICE & CURRENCY
// ──────────────────────────────────────────

export function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPriceCompact(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return formatPrice(amount);
}

export function calculateCommission(
  amount: number,
  workerTier: 'new' | 'verified' | 'trusted' | 'elite',
  totalJobsCompleted: number
): number {
  if (totalJobsCompleted < 10) return 0;
  const rates = { new: 0.12, verified: 0.12, trusted: 0.10, elite: 0.08 };
  return Math.round(amount * rates[workerTier]);
}

export function calculateWorkerEarning(
  bookingAmount: number,
  commission: number,
  bonus: number = 0,
  penalty: number = 0
): number {
  return Math.max(0, bookingAmount - commission + bonus - penalty);
}

export function calculateSurgeMultiplier(
  demandCount: number,
  supplyCount: number,
  maxMultiplier: number = 2.0
): number {
  if (supplyCount === 0) return maxMultiplier;
  const ratio = demandCount / supplyCount;
  if (ratio < 1.5) return 1.0;
  if (ratio < 2.5) return 1.2;
  if (ratio < 4.0) return 1.5;
  return Math.min(maxMultiplier, 2.0);
}

export function calculatePlatformFee(
  amount: number,
  feeType: 'flat' | 'percentage',
  feeValue: number
): number {
  if (feeType === 'flat') return feeValue;
  return Math.round(amount * (feeValue / 100));
}

export function calculateTds(
  payoutAmount: number,
  annualEarnings: number,
  tdsThreshold: number = 100000
): number {
  if (annualEarnings <= tdsThreshold) return 0;
  return Math.round(payoutAmount * 0.01);
}

export function calculateCouponDiscount(
  bookingAmount: number,
  discountType: 'percentage' | 'flat',
  discountValue: number,
  maxDiscount?: number,
  minimumOrderAmount: number = 0
): number {
  if (bookingAmount < minimumOrderAmount) return 0;
  let discount = discountType === 'percentage'
    ? Math.round(bookingAmount * (discountValue / 100))
    : discountValue;
  if (maxDiscount !== undefined) discount = Math.min(discount, maxDiscount);
  return Math.min(discount, bookingAmount);
}

// Subscription plan price
export function getSubscriptionPrice(
  plan: 'silver' | 'gold' | 'platinum',
  duration: 'monthly' | 'yearly'
): number {
  const prices = {
    silver:   { monthly: 199,  yearly: 1799  },
    gold:     { monthly: 499,  yearly: 4499  },
    platinum: { monthly: 999,  yearly: 8999  },
  };
  return prices[plan][duration];
}

// Yearly mein kitni savings hogi
export function getSubscriptionSavings(
  plan: 'silver' | 'gold' | 'platinum'
): number {
  const monthly = getSubscriptionPrice(plan, 'monthly') * 12;
  const yearly = getSubscriptionPrice(plan, 'yearly');
  return monthly - yearly;
}

// ──────────────────────────────────────────
// 2. DISTANCE & GEO
// ──────────────────────────────────────────

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function calculateDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
}

export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`;
  if (distanceKm < 10) return `${distanceKm.toFixed(1)} km`;
  return `${Math.round(distanceKm)} km`;
}

export function estimateArrivalMinutes(
  distanceKm: number,
  avgSpeedKmh: number = 20
): number {
  return Math.ceil((distanceKm / avgSpeedKmh) * 60);
}

export function isWithinRadius(
  workerLat: number, workerLng: number,
  bookingLat: number, bookingLng: number,
  radiusKm: number
): boolean {
  return calculateDistance(workerLat, workerLng, bookingLat, bookingLng) <= radiusKm;
}

export function isGpsSpoofingDetected(
  prevLat: number, prevLng: number, prevTimestamp: Date,
  currLat: number, currLng: number, currTimestamp: Date,
  maxSpeedKmh: number = 120
): boolean {
  const distance = calculateDistance(prevLat, prevLng, currLat, currLng);
  const timeDiffHours = (currTimestamp.getTime() - prevTimestamp.getTime()) / 3600000;
  if (timeDiffHours <= 0) return true;
  return (distance / timeDiffHours) > maxSpeedKmh;
}

// City slug banao SEO ke liye
// "Jaipur" → "jaipur"
// "New Delhi" → "new-delhi"
export function cityToSlug(cityName: string): string {
  return cityName.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// Service URL slug
// "Home Cleaning" → "home-cleaning"
export function serviceToSlug(serviceName: string): string {
  return serviceName.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// SEO URL generate karo
// "electrician-in-jaipur"
export function generateSeoUrl(service: string, city: string): string {
  return `${serviceToSlug(service)}-in-${cityToSlug(city)}`;
}

// ──────────────────────────────────────────
// 3. DATE & TIME
// ──────────────────────────────────────────

export function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);

  if (seconds < 60) return 'Abhi abhi';
  if (minutes < 60) return `${minutes} min pehle`;
  if (hours < 24) return `${hours} ghante pehle`;
  if (days < 30) return `${days} din pehle`;
  if (months < 12) return `${months} mahine pehle`;
  return `${Math.floor(months / 12)} saal pehle`;
}

export function formatBookingTime(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 86400000);
  const bookingDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const timeStr = date.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  if (bookingDay.getTime() === today.getTime()) return `Aaj, ${timeStr}`;
  if (bookingDay.getTime() === tomorrow.getTime()) return `Kal, ${timeStr}`;

  return `${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${timeStr}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hrs} hr`;
  return `${hrs} hr ${mins} min`;
}

export function isPeakHour(date: Date): boolean {
  const hour = date.getHours();
  return (hour >= 8 && hour < 11) || (hour >= 17 && hour < 20);
}

export function isSubscriptionExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return true;
  return new Date() > expiresAt;
}

export function daysRemaining(expiresAt: Date): number {
  return Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000));
}

export function getFinancialYear(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${(year + 1).toString().slice(2)}`;
}

export function getQuarter(date: Date): 'Q1' | 'Q2' | 'Q3' | 'Q4' {
  const month = date.getMonth();
  if (month >= 3 && month <= 5) return 'Q2';  // Apr-Jun
  if (month >= 6 && month <= 8) return 'Q3';  // Jul-Sep
  if (month >= 9 && month <= 11) return 'Q4'; // Oct-Dec
  return 'Q1';                                  // Jan-Mar
}

// ──────────────────────────────────────────
// 4. STRING & FORMAT
// ──────────────────────────────────────────

export function formatMobile(mobile: string): string {
  const clean = mobile.replace(/\D/g, '').slice(-10);
  return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
}

export function maskMobile(mobile: string): string {
  const clean = mobile.replace(/\D/g, '').slice(-10);
  return `${clean.slice(0, 5)}XXXXX`;
}

export function maskAadhaar(aadhaar: string): string {
  const clean = aadhaar.replace(/\D/g, '');
  return `XXXX XXXX ${clean.slice(-4)}`;
}

export function maskBankAccount(account: string): string {
  const clean = account.replace(/\D/g, '');
  return `XXXXXXXX${clean.slice(-4)}`;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(0, local.length - 2))}@${domain}`;
}

export function titleCase(str: string): string {
  return str.toLowerCase().split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function shortName(fullName: string): string {
  const parts = fullName.trim().split(' ');
  if (parts.length === 1) return parts[0] ?? fullName;
  return `${parts[0]} ${parts[parts.length - 1]?.charAt(0)}.`;
}

export function getInitials(name: string): string {
  return name.trim().split(' ').filter(Boolean)
    .slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('');
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

export function generateBookingNumber(sequence: number): string {
  return `INS-${new Date().getFullYear()}-${sequence.toString().padStart(6, '0')}`;
}

export function generateReferralCode(name: string): string {
  const prefix = name.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
  return `${prefix}${Math.floor(1000 + Math.random() * 9000)}`;
}

export function generateTicketNumber(prefix: 'DIS' | 'SOS' | 'SUP', sequence: number): string {
  return `${prefix}-${new Date().getFullYear()}-${sequence.toString().padStart(4, '0')}`;
}

// Deep link generate karo
export function generateDeepLink(
  type: 'booking' | 'worker' | 'service' | 'referral',
  id: string
): string {
  const base = 'inistnt://';
  const paths = {
    booking: `booking/${id}`,
    worker: `worker/${id}`,
    service: `service/${id}`,
    referral: `referral/${id}`,
  };
  return `${base}${paths[type]}`;
}

// Web shareable link
export function generateShareLink(
  type: 'booking' | 'service' | 'referral',
  id: string
): string {
  const base = 'https://inistnt.in';
  const paths = {
    booking: `/track/${id}`,
    service: `/services/${id}`,
    referral: `/join?ref=${id}`,
  };
  return `${base}${paths[type]}`;
}

// ──────────────────────────────────────────
// 5. OTP
// ──────────────────────────────────────────

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function generateBookingOtp(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export function isOtpExpired(createdAt: Date, expiryMinutes: number = 5): boolean {
  return Date.now() > createdAt.getTime() + expiryMinutes * 60000;
}

// ──────────────────────────────────────────
// 6. HASH (Blacklist ke liye)
// ──────────────────────────────────────────

// Simple hash — production mein Node.js crypto use karo
export function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// Aadhaar hash — blacklist check ke liye
// Production mein: crypto.createHash('sha256').update(aadhaar).digest('hex')
export function hashAadhaar(aadhaarNumber: string): string {
  const clean = aadhaarNumber.replace(/\D/g, '');
  return simpleHash(clean);
}

// ──────────────────────────────────────────
// 7. RATING & SCORE
// ──────────────────────────────────────────

export function calculateNewRating(
  currentRating: number,
  totalReviews: number,
  newRating: number
): number {
  return Math.round(((currentRating * totalReviews + newRating) / (totalReviews + 1)) * 100) / 100;
}

export function calculateTrustScore(params: {
  rating: number;
  completionRate: number;
  acceptanceRate: number;
  fraudFlags: number;
  totalJobs: number;
}): number {
  const { rating, completionRate, acceptanceRate, fraudFlags, totalJobs } = params;
  const score =
    (rating / 5) * 30 +
    (completionRate / 100) * 25 +
    (acceptanceRate / 100) * 20 +
    Math.min(totalJobs / 100, 1) * 15 -
    Math.min(fraudFlags * 10, 25);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function calculateMatchingScore(params: {
  distanceKm: number;
  rating: number;
  acceptanceRate: number;
  completionRate: number;
  tier: 'new' | 'verified' | 'trusted' | 'elite';
  subscriptionPlan: 'free' | 'silver' | 'gold' | 'platinum';
}): number {
  const tierScores = { new: 25, verified: 50, trusted: 75, elite: 100 };
  const planScores = { free: 25, silver: 50, gold: 75, platinum: 100 };
  const noise = (Math.random() - 0.5) * 4;

  return Math.max(0, Math.min(100, Math.round(
    Math.max(0, (1 - params.distanceKm / 15)) * 40 +
    (params.rating / 5) * 25 +
    (params.acceptanceRate / 100) * 10 +
    (params.completionRate / 100) * 10 +
    (tierScores[params.tier] / 100) * 8 +
    (planScores[params.subscriptionPlan] / 100) * 5 +
    noise
  )));
}

// Worker tier upgrade check
export function checkTierUpgrade(
  currentTier: 'new' | 'verified' | 'trusted' | 'elite',
  totalJobs: number,
  rating: number,
  isVerified: boolean,
  isPoliceVerified: boolean
): 'new' | 'verified' | 'trusted' | 'elite' {
  // Elite: 200+ jobs, 4.8+ rating, police verified
  if (totalJobs >= 200 && rating >= 4.8 && isPoliceVerified) return 'elite';
  // Trusted: 50+ jobs, 4.5+ rating, aadhaar verified
  if (totalJobs >= 50 && rating >= 4.5 && isVerified) return 'trusted';
  // Verified: Aadhaar done + 10+ jobs
  if (isVerified && totalJobs >= 10) return 'verified';
  return 'new';
}

// ──────────────────────────────────────────
// 8. BOOKING STATUS
// ──────────────────────────────────────────

// Kaunse status se kaunse status pe ja sakte hain
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  searching:   ['assigned', 'cancelled'],
  assigned:    ['en_route', 'cancelled'],
  en_route:    ['arrived', 'cancelled'],
  arrived:     ['in_progress'],
  in_progress: ['completed', 'disputed', 'sos_active'],
  sos_active:  ['in_progress', 'cancelled', 'disputed'],
  completed:   [],  // Terminal state
  cancelled:   [],  // Terminal state
  disputed:    ['resolved'],
};

export function isValidStatusTransition(
  currentStatus: string,
  newStatus: string
): boolean {
  const allowed = VALID_STATUS_TRANSITIONS[currentStatus] ?? [];
  return allowed.includes(newStatus);
}

export function isBookingActive(status: string): boolean {
  return ['searching', 'assigned', 'en_route', 'arrived', 'in_progress', 'sos_active'].includes(status);
}

export function isBookingTerminal(status: string): boolean {
  return ['completed', 'cancelled'].includes(status);
}

export function canUserCancelBooking(
  status: string,
  minutesSinceCreated: number
): { canCancel: boolean; reason?: string } {
  if (!['searching', 'assigned', 'en_route'].includes(status)) {
    return { canCancel: false, reason: 'Is stage pe cancel nahi ho sakta' };
  }
  if (status === 'in_progress') {
    return { canCancel: false, reason: 'Kaam shuru ho gaya hai' };
  }
  return { canCancel: true };
}

export function calculateCancellationFee(
  bookingAmount: number,
  minutesSinceAssigned: number
): number {
  if (minutesSinceAssigned <= 5) return 0;
  if (minutesSinceAssigned <= 15) return 30;
  if (minutesSinceAssigned <= 30) return Math.round(bookingAmount * 0.1);
  return Math.round(bookingAmount * 0.2);
}

export function isOtpLocationValid(
  workerLat: number, workerLng: number,
  bookingLat: number, bookingLng: number,
  radiusMeters: number = 200
): boolean {
  return calculateDistance(workerLat, workerLng, bookingLat, bookingLng) * 1000 <= radiusMeters;
}

export function isCompletionSpeedSuspicious(
  estimatedMinutes: number,
  actualMinutes: number
): boolean {
  return actualMinutes < estimatedMinutes * 0.3;
}

// ──────────────────────────────────────────
// 9. WORKER REWARDS (T-shirt etc)
// ──────────────────────────────────────────

export interface MilestoneCheck {
  earned: boolean;
  milestone: string;
  rewardType: 'tshirt' | 'cash_bonus' | 'badge' | 'certificate';
  rewardTitle: string;
  rewardDescription: string;
  amount?: number;
}

export function checkWorkerMilestones(params: {
  totalJobs: number;
  rating: number;
  consecutiveFiveStars: number;
  onTimeArrivals: number;
  previousMilestones: string[];
}): MilestoneCheck[] {
  const { totalJobs, rating, consecutiveFiveStars, onTimeArrivals, previousMilestones } = params;
  const earned: MilestoneCheck[] = [];

  // Milestone 1: Pehli T-shirt
  // 5 orders complete + 4+ rating
  if (
    totalJobs >= 5 &&
    rating >= 4.0 &&
    !previousMilestones.includes('5_orders_4star')
  ) {
    earned.push({
      earned: true,
      milestone: '5_orders_4star',
      rewardType: 'tshirt',
      rewardTitle: '🎽 Inistnt T-Shirt Mili!',
      rewardDescription: '5 orders complete aur 4+ rating — badhai ho! Aapki Inistnt T-Shirt bhejenge.',
    });
  }

  // Milestone 2: Cash bonus
  // 25 orders + 4.5+ rating
  if (
    totalJobs >= 25 &&
    rating >= 4.5 &&
    !previousMilestones.includes('25_orders_bonus')
  ) {
    earned.push({
      earned: true,
      milestone: '25_orders_bonus',
      rewardType: 'cash_bonus',
      rewardTitle: '💰 ₹500 Bonus Mila!',
      rewardDescription: '25 orders aur 4.5+ rating — ₹500 aapke wallet mein add ho gaye.',
      amount: 500,
    });
  }

  // Milestone 3: Star badge
  // 10 consecutive 5-star ratings
  if (
    consecutiveFiveStars >= 10 &&
    !previousMilestones.includes('10_consecutive_5star')
  ) {
    earned.push({
      earned: true,
      milestone: '10_consecutive_5star',
      rewardType: 'badge',
      rewardTitle: '⭐ Star Worker Badge!',
      rewardDescription: 'Lagatar 10 five-star ratings — aap Star Worker ban gaye!',
    });
  }

  // Milestone 4: 100 orders certificate
  if (
    totalJobs >= 100 &&
    !previousMilestones.includes('100_orders_certificate')
  ) {
    earned.push({
      earned: true,
      milestone: '100_orders_certificate',
      rewardType: 'certificate',
      rewardTitle: '🏆 100 Orders Certificate!',
      rewardDescription: '100 orders complete — aapka achievement certificate email pe bheja gaya.',
    });
  }

  // Milestone 5: Punctuality bonus
  // 20 on-time arrivals in a month
  if (
    onTimeArrivals >= 20 &&
    !previousMilestones.includes('20_ontime_bonus')
  ) {
    earned.push({
      earned: true,
      milestone: '20_ontime_bonus',
      rewardType: 'cash_bonus',
      rewardTitle: '⏰ Punctuality Bonus ₹200!',
      rewardDescription: '20 baar time pe pahunche — ₹200 bonus aapke wallet mein.',
      amount: 200,
    });
  }

  return earned;
}

// ──────────────────────────────────────────
// 10. NOTIFICATION PAYLOAD BUILDERS
// ──────────────────────────────────────────

export interface NotificationPayload {
  title: string;
  body: string;
  data: Record<string, string>;
  imageUrl?: string;
}

export function buildBookingRequestNotification(params: {
  bookingId: string;
  serviceName: string;
  userAddress: string;
  distanceKm: number;
  estimatedAmount: number;
  timeoutSeconds: number;
}): NotificationPayload {
  return {
    title: `🔔 Naya ${params.serviceName} ka kaam!`,
    body: `${formatDistance(params.distanceKm)} door | ${formatPrice(params.estimatedAmount)} | ${params.timeoutSeconds} sec mein accept karo`,
    data: {
      type: 'booking_request',
      bookingId: params.bookingId,
      action: 'open_booking',
    },
  };
}

export function buildWorkerAssignedNotification(params: {
  bookingId: string;
  workerName: string;
  workerRating: number;
  estimatedArrivalMinutes: number;
}): NotificationPayload {
  return {
    title: `✅ Worker Mil Gaya — ${params.workerName}`,
    body: `⭐ ${params.workerRating} rating | ${params.estimatedArrivalMinutes} min mein pahunchenge`,
    data: {
      type: 'worker_assigned',
      bookingId: params.bookingId,
      action: 'track_worker',
    },
  };
}

export function buildPaymentConfirmationNotification(params: {
  bookingId: string;
  amount: number;
  workerName: string;
}): NotificationPayload {
  return {
    title: `💳 Payment Successful — ${formatPrice(params.amount)}`,
    body: `${params.workerName} ka kaam complete. Rating do aur feedback share karo!`,
    data: {
      type: 'payment_confirmed',
      bookingId: params.bookingId,
      action: 'rate_booking',
    },
  };
}

export function buildPayoutNotification(params: {
  amount: number;
  period: string;
}): NotificationPayload {
  return {
    title: `💰 ${formatPrice(params.amount)} Aapke Account Mein!`,
    body: `${params.period} ki kamaai transfer ho gayi. UPI/Bank pe check karo.`,
    data: {
      type: 'payout_processed',
      action: 'view_earnings',
    },
  };
}

export function buildSosNotification(params: {
  sosId: string;
  bookingId: string;
  triggeredByType: 'user' | 'worker';
  location: string;
}): NotificationPayload {
  return {
    title: `🚨 SOS ALERT — Turant Dhyan Do!`,
    body: `${params.triggeredByType === 'user' ? 'Customer' : 'Worker'} ne SOS trigger kiya — ${params.location}`,
    data: {
      type: 'sos_alert',
      sosId: params.sosId,
      bookingId: params.bookingId,
      action: 'open_sos',
      priority: 'critical',
    },
  };
}

export function buildRewardNotification(params: {
  rewardTitle: string;
  rewardDescription: string;
  rewardId: string;
}): NotificationPayload {
  return {
    title: params.rewardTitle,
    body: params.rewardDescription,
    data: {
      type: 'reward_earned',
      rewardId: params.rewardId,
      action: 'claim_reward',
    },
  };
}

// ──────────────────────────────────────────
// 11. SMS TEMPLATE BUILDERS
// ──────────────────────────────────────────

export function buildOtpSms(otp: string, expiryMinutes: number = 5): string {
  return `${otp} aapka Inistnt OTP hai. ${expiryMinutes} minute mein use karein. Kisi ko share na karein. -Inistnt`;
}

export function buildWorkerAssignedSms(params: {
  workerName: string;
  mobile: string;
  arrivalMinutes: number;
  trackingUrl: string;
}): string {
  return `Aapke worker ${params.workerName} (${formatMobile(params.mobile)}) ${params.arrivalMinutes} min mein pahunchenge. Track karein: ${params.trackingUrl} -Inistnt`;
}

export function buildArrivalOtpSms(otp: string, workerName: string): string {
  return `Worker ${workerName} pahunch gaye hain. Arrival OTP: ${otp} — sirf worker ko batayein. -Inistnt`;
}

export function buildPaymentReceiptSms(params: {
  amount: number;
  bookingId: string;
  workerName: string;
}): string {
  return `${formatPrice(params.amount)} payment received. Booking: ${params.bookingId}. ${params.workerName} ka shukriya! -Inistnt`;
}

// ──────────────────────────────────────────
// 12. VALIDATION HELPERS
// ──────────────────────────────────────────

export function isValidIndianMobile(mobile: string): boolean {
  return /^[6-9]\d{9}$/.test(mobile.replace(/\D/g, '').slice(-10));
}

export function isValidPincode(pincode: string): boolean {
  return /^[1-9][0-9]{5}$/.test(pincode);
}

export function isValidIfsc(ifsc: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase());
}

export function isValidUpiId(upi: string): boolean {
  return /^[\w.\-_]{3,}@[a-zA-Z]{3,}$/.test(upi);
}

export function isValidAadhaar(aadhaar: string): boolean {
  const clean = aadhaar.replace(/\D/g, '');
  return clean.length === 12 && /^[2-9]/.test(clean);
}

export function isValidPan(pan: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan.toUpperCase());
}

export function isValidFileType(
  mimeType: string,
  allowed: string[]
): boolean {
  return allowed.includes(mimeType);
}

export function isValidFileSize(
  sizeBytes: number,
  maxMb: number = 10
): boolean {
  return sizeBytes <= maxMb * 1024 * 1024;
}

// ──────────────────────────────────────────
// 13. LOYALTY POINTS
// ──────────────────────────────────────────

export function calculatePointsEarned(
  bookingAmount: number,
  pointsPerRupee: number = 0.1
): number {
  return Math.floor(bookingAmount * pointsPerRupee);
}

export function calculatePointsValue(
  points: number,
  valuePerPoint: number = 0.1
): number {
  return Math.floor(points * valuePerPoint);
}

// ──────────────────────────────────────────
// 14. PAGINATION
// ──────────────────────────────────────────

export function getPaginationOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

export function getTotalPages(total: number, limit: number): number {
  return Math.ceil(total / limit);
}

export function buildPaginationMeta(params: {
  page: number;
  limit: number;
  total: number;
}) {
  const totalPages = getTotalPages(params.total, params.limit);
  return {
    page: params.page,
    limit: params.limit,
    total: params.total,
    totalPages,
    hasNextPage: params.page < totalPages,
    hasPrevPage: params.page > 1,
  };
}

// ──────────────────────────────────────────
// 15. ANALYTICS EVENT BUILDERS
// ──────────────────────────────────────────

export function buildAnalyticsEvent(
  event: string,
  userId: string | null,
  properties: Record<string, unknown> = {}
): {
  event: string;
  userId: string | null;
  properties: Record<string, unknown>;
  timestamp: string;
  sessionId: string;
} {
  return {
    event,
    userId,
    properties,
    timestamp: new Date().toISOString(),
    sessionId: generateId(),
  };
}

// ──────────────────────────────────────────
// 16. MISC
// ──────────────────────────────────────────

export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(() => resolve(), Math.max(0, ms));
  });
}

export function safeJsonParse<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T; }
  catch { return fallback; }
}

export function removeEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== '')
  ) as Partial<T>;
}

export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 1; i <= maxAttempts; i++) {
    try { return await fn(); }
    catch (e) {
      lastError = e as Error;
      if (i < maxAttempts) await sleep(delayMs * i);
    }
  }
  throw lastError;
}

export function pickFields<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  return keys.reduce((acc, key) => {
    acc[key] = obj[key];
    return acc;
  }, {} as Record<K, T[K]>) as Pick<T, K>;
}

export function omitFields<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  keys.forEach(key => delete result[key]);
  return result as Omit<T, K>;
}
