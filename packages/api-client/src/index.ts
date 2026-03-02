// ═══════════════════════════════════════════════════════════
// INISTNT — Production-Grade API Client v4.1
//
// Token Strategy (Industry Standard):
//   Access Token  → Memory only (15 min) — XSS safe
//   Refresh Token → HttpOnly Cookie (web) / SecureStore (RN)
//
// Fixes in v4.1:
//   ✅ Removed broken custom DOM declarations
//   ✅ Fixed JWT base64 decode (URL-safe + padding)
//   ✅ Fixed atob browser crash
//   ✅ Removed redundant custom setTimeout
//   ✅ tsconfig DOM lib se sab milega
// ═══════════════════════════════════════════════════════════

import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';
import type {
  ApiResponse,
  Booking,
  BookingStatus,
  BookingTimelineEvent,
  User,
  Worker,
  WorkerStatus,
  WorkerTier,
  WorkerSkill,
  WorkerDocument,
  WorkerReward,
  WorkerPayout,
  Service,
  ServiceCategory,
  ServicePricing,
  Review,
  Notification,
  AuthTokens,
  JwtPayload,
  City,
  SurgeZone,
  Address,
  Dispute,
  SosIncident,
  ChatMessage,
  FraudFlag,
  FraudFlagType,
  FraudFlagSeverity,
  AuditLog,
  Staff,
  StaffRole,
  FeatureFlag,
  PaginationMeta,
  PaginationParams,
  ReferralRecord,
  LoyaltyPoints,
  Transaction,
  TransactionType,
  WorkerVerification,
  SubscriptionPlan,
  UserSession,
} from '@inistnt/types';
import type {
  SendOtpInput,
  VerifyOtpInput,
  CreateBookingInput,
  CancelBookingInput,
  VerifyBookingOtpInput,
  CreateReviewInput,
  CreateDisputeInput,
  ResolveDisputeInput,
  UpdateUserProfileInput,
  AddressInput,
  WorkerRegistrationInput,
  UpdateWorkerLocationInput,
  TriggerSosInput,
  SendMessageInput,
  WorkerActionInput,
  InviteStaffInput,
  ServiceSearchInput,
  FileUploadInput,
  TrackEventInput,
  UpdateWorkerStatusInput,
  WorkerBankDetailsInput,
  AddWorkerSkillInput,
  ReviewResponseInput,
  FlagReviewInput,
  EscalateDisputeInput,
  NotificationPreferencesInput,
  ClaimRewardInput,
  BuySubscriptionInput,
  RedeemPointsInput,
  ApplyCouponInput,
  InitiatePaymentInput,
  RequestPayoutInput,
} from '@inistnt/validators';
import { API, ERROR_CODES } from '@inistnt/constants';

// ──────────────────────────────────────────
// JWT DECODE UTILITY
// Fix 1: URL-safe base64 + padding handle karo
// Fix 2: Browser aur Node dono support
// ──────────────────────────────────────────

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (!part) throw new Error('Invalid JWT format');

  const base64 = part
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(part.length + (4 - (part.length % 4)) % 4, '=');

  // Browser (Chrome, Safari, Firefox — sab mein atob available hai)
  if (typeof globalThis.atob === 'function') {
    return JSON.parse(globalThis.atob(base64));
  }

  // Node.js / SSR — globalThis se access karo (TypeScript ko bypass)
  const NodeBuffer = (globalThis as Record<string, unknown>)['Buffer'] as
    | { from(s: string, enc: string): { toString(enc: string): string } }
    | undefined;

  if (NodeBuffer) {
    return JSON.parse(NodeBuffer.from(base64, 'base64').toString('utf-8'));
  }

  throw new Error('Base64 decoding not available');
}

// ──────────────────────────────────────────
// RESPONSE TYPES
// ──────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  isNetworkError: boolean;
}

export interface PresignedUrlResponse {
  uploadUrl: string;
  fileUrl: string;
  key: string;
  expiresAt: string;
}

export interface PaymentOrderResponse {
  razorpayOrderId: string;
  amount: number; // Paise mein
  currency: string;
  keyId: string;
}

export interface WorkerPublicProfile {
  id: string;
  name: string;
  profilePhoto: string | null;
  tier: WorkerTier;
  rating: number;
  totalReviews: number;
  totalJobs: number;
  skills: WorkerSkill[];
  city: string;
  isVerified: boolean;
  isPoliceVerified: boolean;
  badges: string[];
  distanceKm?: number;
  estimatedArrivalMin?: number;
}

export interface EarningsSummary {
  totalEarnings: number;
  pendingPayout: number;
  thisMonth: number;
  lastMonth: number;
  thisWeek: number;
  todayEarnings: number;
  breakdown: Array<{
    date: string;
    amount: number;
    bookings: number;
    commission: number;
  }>;
}

export interface DashboardSummary {
  totalBookingsToday: number;
  revenueToday: number;
  activeWorkers: number;
  activeBookings: number;
  searchingBookings: number;
  openSos: number;
  openDisputes: number;
  conversionRate: number;
  avgMatchingTimeSec: number;
}

export interface SurgeInfo {
  multiplier: number;
  zone: SurgeZone | null;
  isActive: boolean;
  estimatedNormalizeMinutes: number | null;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
}

export interface SearchSuggestion {
  id: string;
  type: 'service' | 'category' | 'area';
  nameHi: string;
  nameEn: string;
  iconUrl: string | null;
}

export interface AppVersionInfo {
  currentVersion: string;
  minVersion: string;
  forceUpdate: boolean;
  updateMessage: string | null;
  storeUrl: string;
}

export interface VerificationStatus {
  status: string;
  completedSteps: string[];
  pendingSteps: string[];
  rejectedDocuments: WorkerDocument[];
  selfieMatchScore: number | null;
  reviewNotes: string | null;
}

export interface SubscriptionDetails {
  plan: SubscriptionPlan;
  status: 'active' | 'expired' | 'cancelled' | 'grace_period';
  startedAt: string | null;
  expiresAt: string | null;
  daysRemaining: number;
  autoRenew: boolean;
}

export interface WalletInfo {
  balance: number;
  pendingAmount: number;
  totalEarned: number;
  totalWithdrawn: number;
}

export interface FinanceSummary {
  gmv: number;
  revenue: number;
  payouts: number;
  refunds: number;
  takeRate: number;
  tdsCollected: number;
  activeSubscriptions: number;
}

export interface IncentiveProgram {
  id: string;
  title: string;
  titleHi: string;
  description: string;
  target: 'new_workers' | 'all_workers' | 'specific_tier';
  targetTier: WorkerTier | null;
  bonusAmount: number;
  requiredBookings: number;
  requiredRating: number | null;
  validFrom: string;
  validTo: string;
  isActive: boolean;
  enrolledCount: number;
  completedCount: number;
}

// ──────────────────────────────────────────
// TOKEN MEMORY STORE
// Access token sirf memory mein
// Page reload pe automatically clear
// XSS se safe — localStorage bilkul nahi
// ──────────────────────────────────────────

class TokenMemoryStore {
  private accessToken: string | null = null;
  private userType: string | null = null;
  private userId: string | null = null;

  getAccessToken(): string | null {
    return this.accessToken;
  }

  setAccessToken(token: string): void {
    this.accessToken = token;

    // JWT se user info nikaalo (decode only — verify server karta hai)
    try {
      const payload = decodeJwtPayload(token);
      this.userType = (payload.userType as string) ?? null;
      this.userId = (payload.userId as string) ?? null;
    } catch {
      // Invalid token format — ignore, server verify karega
    }
  }

  getUserType(): string | null {
    return this.userType;
  }

  getUserId(): string | null {
    return this.userId;
  }

  clear(): void {
    this.accessToken = null;
    this.userType = null;
    this.userId = null;
  }

  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }
}

// ──────────────────────────────────────────
// PLATFORM ADAPTER
// Web aur React Native dono ke liye
// ──────────────────────────────────────────

export interface PlatformAdapter {
  // Web: HttpOnly Cookie — server manages, client nahi touch karta
  // React Native: SecureStore mein refresh token
  getRefreshToken: () => string | null | Promise<string | null>;
  setRefreshToken: (token: string) => void | Promise<void>;
  clearRefreshToken: () => void | Promise<void>;

  // Logout callback — platform specific navigation
  onLogout: () => void;

  // Platform identification
  isWeb: boolean;
}

// Web adapter — HttpOnly cookie server manage karta hai
export const webAdapter: PlatformAdapter = {
  getRefreshToken: () => null,       // Cookie auto-send hoti hai
  setRefreshToken: () => {},         // Server Set-Cookie header se set karta hai
  clearRefreshToken: () => {},       // Server cookie clear karta hai logout pe
  onLogout: () => {
    // Web app yeh override karega
    // e.g., router.push('/login')
  },
  isWeb: true,
};

// React Native adapter — caller inject karega:
// import * as SecureStore from 'expo-secure-store';
// export const mobileAdapter: PlatformAdapter = {
//   getRefreshToken: () => SecureStore.getItemAsync('refresh_token'),
//   setRefreshToken: (t) => SecureStore.setItemAsync('refresh_token', t),
//   clearRefreshToken: () => SecureStore.deleteItemAsync('refresh_token'),
//   onLogout: () => router.replace('/login'),
//   isWeb: false,
// };

// ──────────────────────────────────────────
// REFRESH QUEUE
// Race condition fix:
// 5 requests ek saath 401 paayein →
// Sirf 1 refresh call hoga
// Baaki 4 queue mein wait karenge
// ──────────────────────────────────────────

type QueueItem = {
  resolve: (token: string) => void;
  reject: (error: ApiError) => void;
};

class RefreshQueue {
  private queue: QueueItem[] = [];
  private isRefreshing = false;

  async waitForRefresh(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.queue.push({ resolve, reject });
    });
  }

  get isActive(): boolean {
    return this.isRefreshing;
  }

  start(): void {
    this.isRefreshing = true;
  }

  resolveAll(token: string): void {
    this.isRefreshing = false;
    this.queue.forEach(item => item.resolve(token));
    this.queue = [];
  }

  rejectAll(error: ApiError): void {
    this.isRefreshing = false;
    this.queue.forEach(item => item.reject(error));
    this.queue = [];
  }
}

// ──────────────────────────────────────────
// WEBSOCKET CLIENT
// Platform-agnostic
// Exponential backoff reconnect
// ──────────────────────────────────────────

export class InistntWebSocket {
  private ws: WebSocket | null = null;
  private reconnectCount = 0;
  private readonly MAX_RECONNECTS = 5;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private currentToken: string | null = null;
  private handlers = new Map<string, Set<(data: unknown) => void>>();
  private _isConnected = false;

  constructor(private readonly wsUrl: string) {}

  get isConnected(): boolean {
    return this._isConnected;
  }

  connect(accessToken: string): void {
    this.currentToken = accessToken;
    this.reconnectCount = 0;
    this._open();
  }

  disconnect(): void {
    this.currentToken = null;
    this._clearPing();
    this._isConnected = false;
    this.ws?.close(1000);
    this.ws = null;
    this.reconnectCount = 0;
  }

  send(type: string, data: unknown): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data, ts: Date.now() }));
      return true;
    }
    return false;
  }

  on(event: string, handler: (data: unknown) => void): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  // ─── TYPED LISTENERS ────────────────────

  onBookingUpdate(cb: (b: Partial<Booking>) => void): () => void {
    return this.on('booking:update', cb as (d: unknown) => void);
  }

  onBookingRequest(cb: (b: Booking) => void): () => void {
    return this.on('booking:request', cb as (d: unknown) => void);
  }

  onBookingTimeout(cb: (bookingId: string) => void): () => void {
    return this.on('booking:timeout', cb as (d: unknown) => void);
  }

  onWorkerLocation(cb: (d: {
    workerId: string;
    lat: number;
    lng: number;
    heading?: number;
  }) => void): () => void {
    return this.on('worker:location', cb as (d: unknown) => void);
  }

  onSosAlert(cb: (sos: SosIncident) => void): () => void {
    return this.on('sos:alert', cb as (d: unknown) => void);
  }

  onMessage(cb: (msg: ChatMessage) => void): () => void {
    return this.on('chat:message', cb as (d: unknown) => void);
  }

  onTyping(cb: (d: { userId: string; bookingId: string }) => void): () => void {
    return this.on('chat:typing', cb as (d: unknown) => void);
  }

  onConnected(cb: () => void): () => void {
    return this.on('ws:connected', cb as (d: unknown) => void);
  }

  onDisconnected(cb: () => void): () => void {
    return this.on('ws:disconnected', cb as (d: unknown) => void);
  }

  onReconnectFailed(cb: () => void): () => void {
    return this.on('ws:reconnect_failed', cb as (d: unknown) => void);
  }

  sendLocation(data: UpdateWorkerLocationInput): void {
    this.send('location:update', data);
  }

  sendTyping(bookingId: string): void {
    this.send('chat:typing', { bookingId });
  }

  // ─── INTERNALS ──────────────────────────

  private _open(): void {
    if (!this.currentToken) return;

    try {
      this.ws = new WebSocket(`${this.wsUrl}?token=${this.currentToken}`);
    } catch {
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this._isConnected = true;
      this.reconnectCount = 0;
      this._startPing();
      this._emit('ws:connected', null);
    };

    this.ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as {
          type: string;
          data: unknown;
        };
        this._emit(parsed.type, parsed.data);
      } catch { /* ignore malformed messages */ }
    };

    this.ws.onclose = (event) => {
      this._isConnected = false;
      this._clearPing();
      this._emit('ws:disconnected', { code: event.code });

      // Normal close — reconnect mat karo
      if (event.code === 1000 || !this.currentToken) return;
      this._scheduleReconnect();
    };

    this.ws.onerror = () => {
      this._emit('ws:error', null);
    };
  }

  private _scheduleReconnect(): void {
    if (this.reconnectCount >= this.MAX_RECONNECTS) {
      this._emit('ws:reconnect_failed', null);
      return;
    }
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const delay = Math.pow(2, this.reconnectCount) * 1000;
    this.reconnectCount++;
    setTimeout(() => this._open(), delay);
  }

  private _startPing(): void {
    this.pingTimer = setInterval(() => {
      this.send('ping', { ts: Date.now() });
    }, 25000);
  }

  private _clearPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private _emit(event: string, data: unknown): void {
    this.handlers.get(event)?.forEach(h => h(data));
  }
}

// ──────────────────────────────────────────
// MAIN API CLIENT
// ──────────────────────────────────────────

export class InistntApiClient {
  private readonly http: AxiosInstance;

  // Separate axios instance refresh ke liye
  // Main instance use karna circular dependency create karta hai
  private readonly refreshHttp: AxiosInstance;

  private readonly tokenStore = new TokenMemoryStore();
  private readonly refreshQueue = new RefreshQueue();

  public readonly ws: InistntWebSocket;

  constructor(
    private readonly baseURL: string,
    private readonly adapter: PlatformAdapter = webAdapter,
    wsURL?: string
  ) {
    const apiBase = `${baseURL}${API.BASE_PATH}`;

    this.ws = new InistntWebSocket(wsURL ?? baseURL.replace(/^http/, 'ws'));

    // Main HTTP client
    this.http = axios.create({
      baseURL: apiBase,
      timeout: API.TIMEOUT_MS,
      withCredentials: true, // HttpOnly cookie automatically send hogi
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest', // CSRF protection
      },
    });

    // Separate refresh client — no interceptors (circular dependency avoid)
    this.refreshHttp = axios.create({
      baseURL: apiBase,
      timeout: 10000,
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    this._setupInterceptors();
  }

  // Public getters
  get currentUserId(): string | null {
    return this.tokenStore.getUserId();
  }

  get currentUserType(): string | null {
    return this.tokenStore.getUserType();
  }

  get isAuthenticated(): boolean {
    return this.tokenStore.isAuthenticated();
  }

  // ─── INTERCEPTORS ───────────────────────

  private _setupInterceptors(): void {
    // REQUEST: Access token attach karo
    this.http.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        const token = this.tokenStore.getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      }
    );

    // RESPONSE: Errors handle karo
    this.http.interceptors.response.use(
      (res) => res,
      async (error) => {
        // Network error — server se koi response nahi
        if (!error.response) {
          return Promise.reject(
            this._makeError(
              'Network error. Internet connection check karein.',
              'NETWORK_ERROR',
              0,
              true
            )
          );
        }

        const status = error.response.status as number;
        const config = error.config as InternalAxiosRequestConfig & {
          _retry?: boolean;
        };

        // 401 — Token expired, refresh karo
        if (status === 401 && !config._retry) {
          config._retry = true;

          // Agar refresh already chal raha hai — queue mein wait karo
          if (this.refreshQueue.isActive) {
            try {
              const newToken = await this.refreshQueue.waitForRefresh();
              config.headers.Authorization = `Bearer ${newToken}`;
              return this.http(config);
            } catch (queueError) {
              return Promise.reject(queueError);
            }
          }

          // Refresh start karo
          this.refreshQueue.start();

          try {
            const newToken = await this._performRefresh();
            this.refreshQueue.resolveAll(newToken);
            config.headers.Authorization = `Bearer ${newToken}`;
            return this.http(config);
          } catch {
            const logoutError = this._makeError(
              'Session expire ho gayi. Dobara login karein.',
              ERROR_CODES.TOKEN_EXPIRED,
              401,
              false
            );
            this.refreshQueue.rejectAll(logoutError);
            this._handleLogout();
            return Promise.reject(logoutError);
          }
        }

        // 403 — Permission nahi hai
        if (status === 403) {
          return Promise.reject(
            this._makeError(
              'Aapke paas yeh karne ka permission nahi hai.',
              ERROR_CODES.FORBIDDEN,
              403,
              false
            )
          );
        }

        return Promise.reject(this._formatError(error));
      }
    );
  }

  // ─── REFRESH LOGIC ──────────────────────

  private async _performRefresh(): Promise<string> {
    // Web: HttpOnly cookie automatically jaati hai (withCredentials: true)
    // React Native: SecureStore se manually bhejo
    const body = this.adapter.isWeb
      ? {}
      : { refreshToken: await this.adapter.getRefreshToken() };

    const res = await this.refreshHttp.post<ApiResponse<{
      accessToken: string;
      refreshToken?: string;
    }>>('/auth/refresh', body);

    const responseData = res.data.data;
    if (!responseData) {
      throw this._makeError(
        'Invalid refresh response',
        ERROR_CODES.TOKEN_EXPIRED,
        401,
        false
      );
    }

    const { accessToken, refreshToken } = responseData;
    this.tokenStore.setAccessToken(accessToken);

    // React Native: SecureStore update karo
    if (!this.adapter.isWeb && refreshToken) {
      await this.adapter.setRefreshToken(refreshToken);
    }

    // WebSocket reconnect with new token
    if (this.ws.isConnected) {
      this.ws.connect(accessToken);
    }

    return accessToken;
  }

  private _handleLogout(): void {
    this.tokenStore.clear();
    this.ws.disconnect();
    this.adapter.clearRefreshToken();
    this.adapter.onLogout();
  }

  // ─── HELPERS ────────────────────────────

  private _makeError(
    message: string,
    code: string,
    status: number,
    isNetworkError: boolean
  ): ApiError {
    const err = new Error(message) as ApiError;
    err.code = code;
    err.status = status;
    err.isNetworkError = isNetworkError;
    return err;
  }

  private _formatError(error: unknown): ApiError {
    if (axios.isAxiosError(error)) {
      const responseData = error.response?.data as Record<string, unknown> | undefined;
      return this._makeError(
        (responseData?.message as string) ?? error.message,
        ((responseData?.error as Record<string, unknown>)?.code as string) ?? ERROR_CODES.INTERNAL_ERROR,
        error.response?.status ?? 0,
        false
      );
    }
    if (error instanceof Error) {
      return this._makeError(error.message, ERROR_CODES.INTERNAL_ERROR, 0, false);
    }
    return this._makeError('Unknown error', ERROR_CODES.INTERNAL_ERROR, 0, false);
  }

  private _qs(params?: Record<string, unknown>): string {
    if (!params) return '';
    const parts: string[] = [];
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) {
        v.forEach(item => parts.push(`${k}[]=${encodeURIComponent(String(item))}`));
      } else {
        parts.push(`${k}=${encodeURIComponent(String(v))}`);
      }
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  // ─── HTTP METHODS ────────────────────────

  private async _get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.http.get<ApiResponse<T>>(url, config);
    return res.data.data as T;
  }

  private async _getPaginated<T>(
    url: string,
    params?: PaginationParams & Record<string, unknown>
  ): Promise<PaginatedResponse<T>> {
    const res = await this.http.get<ApiResponse<T[]>>(url + this._qs(params));
    return {
      items: res.data.data as T[],
      meta: res.data.meta as PaginationMeta,
    };
  }

  private async _post<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const res = await this.http.post<ApiResponse<T>>(url, data, config);
    return res.data.data as T;
  }

  private async _put<T>(url: string, data?: unknown): Promise<T> {
    const res = await this.http.put<ApiResponse<T>>(url, data);
    return res.data.data as T;
  }

  private async _patch<T>(url: string, data?: unknown): Promise<T> {
    const res = await this.http.patch<ApiResponse<T>>(url, data);
    return res.data.data as T;
  }

  private async _delete<T = void>(url: string): Promise<T> {
    const res = await this.http.delete<ApiResponse<T>>(url);
    return res.data.data as T;
  }

  // File upload with progress tracking
  private async _upload<T>(
    url: string,
    file: File | Blob,
    fields?: Record<string, string>,
    onProgress?: (p: UploadProgress) => void
  ): Promise<T> {
    const form = new FormData();
    form.append('file', file);
    if (fields) {
      Object.entries(fields).forEach(([k, v]) => form.append(k, v));
    }

    const res = await this.http.post<ApiResponse<T>>(url, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress({
            loaded: e.loaded,
            total: e.total,
            percentage: Math.round((e.loaded / e.total) * 100),
          });
        }
      },
    });

    return res.data.data as T;
  }

  // ──────────────────────────────────────────
  // 1. AUTH
  // ──────────────────────────────────────────

  auth = {
    sendOtp: (data: SendOtpInput) =>
      this._post<{ mobile: string; expiresIn: number }>('/auth/send-otp', data),

    verifyOtp: async (data: VerifyOtpInput) => {
      const result = await this._post<{
        accessToken: string;
        refreshToken?: string; // RN ke liye, web pe cookie
        expiresIn: number;
        user: User | Worker;
        isNewUser: boolean;
      }>('/auth/verify-otp', data);

      this.tokenStore.setAccessToken(result.accessToken);

      if (!this.adapter.isWeb && result.refreshToken) {
        await this.adapter.setRefreshToken(result.refreshToken);
      }

      this.ws.connect(result.accessToken);
      return result;
    },

    logout: async (logoutAll = false) => {
      try {
        await this._post<void>('/auth/logout', { logoutAll });
      } finally {
        this._handleLogout();
      }
    },

    logoutAllDevices: async () => {
      await this.auth.logout(true);
    },

    updateFcmToken: (fcmToken: string, deviceId?: string) =>
      this._post<void>('/auth/fcm-token', { fcmToken, deviceId }),

    getSessions: () =>
      this._get<UserSession[]>('/auth/sessions'),

    revokeSession: (sessionId: string) =>
      this._delete(`/auth/sessions/${sessionId}`),

    revokeAllOtherSessions: () =>
      this._delete('/auth/sessions/others'),

    getMe: () =>
      this._get<JwtPayload>('/auth/me'),

    checkAppVersion: (platform: 'android' | 'ios', version: string) =>
      this._get<AppVersionInfo>(
        `/auth/app-version?platform=${platform}&version=${version}`
      ),
  };

  // ──────────────────────────────────────────
  // 2. USER
  // ──────────────────────────────────────────

  users = {
    getProfile: () =>
      this._get<User>('/users/me'),

    updateProfile: (data: UpdateUserProfileInput) =>
      this._patch<User>('/users/me', data),

    uploadProfilePhoto: (file: File, onProgress?: (p: UploadProgress) => void) =>
      this._upload<{ photoUrl: string }>('/users/me/photo', file, undefined, onProgress),

    deleteAccount: (reason: string) =>
      this._post<void>('/users/me/delete', { reason }),

    exportMyData: () =>
      this._get<{ downloadUrl: string; expiresAt: string }>('/users/me/export'),

    // Addresses
    getAddresses: () =>
      this._get<Address[]>('/users/me/addresses'),

    addAddress: (data: AddressInput) =>
      this._post<Address>('/users/me/addresses', data),

    updateAddress: (addressId: string, data: Partial<AddressInput>) =>
      this._put<Address>(`/users/me/addresses/${addressId}`, data),

    deleteAddress: (addressId: string) =>
      this._delete(`/users/me/addresses/${addressId}`),

    setDefaultAddress: (addressId: string) =>
      this._patch<void>(`/users/me/addresses/${addressId}/default`),

    // Loyalty
    getLoyaltyPoints: () =>
      this._get<LoyaltyPoints>('/users/me/points'),

    redeemPoints: (data: RedeemPointsInput) =>
      this._post<{ discount: number; remainingPoints: number }>(
        '/users/me/points/redeem', data
      ),

    getPointsHistory: (params?: PaginationParams) =>
      this._getPaginated<{
        id: string;
        type: 'earned' | 'redeemed' | 'expired';
        points: number;
        description: string;
        createdAt: string;
      }>('/users/me/points/history', params as PaginationParams & Record<string, unknown>),

    // Transactions
    getTransactions: (params?: PaginationParams & { type?: TransactionType }) =>
      this._getPaginated<Transaction>('/users/me/transactions', params as PaginationParams & Record<string, unknown>),

    // Notifications
    getNotifications: (params?: PaginationParams) =>
      this._getPaginated<Notification>('/users/me/notifications', params as PaginationParams & Record<string, unknown>),

    getUnreadCount: () =>
      this._get<{ count: number }>('/users/me/notifications/unread-count'),

    markNotificationsRead: (ids: string[]) =>
      this._post<void>('/users/me/notifications/read', { notificationIds: ids }),

    markAllRead: () =>
      this._post<void>('/users/me/notifications/read-all'),

    getNotificationPreferences: () =>
      this._get<NotificationPreferencesInput>('/users/me/notification-preferences'),

    updateNotificationPreferences: (data: NotificationPreferencesInput) =>
      this._put<void>('/users/me/notification-preferences', data),

    // Referral
    getReferralInfo: () =>
      this._get<{
        code: string;
        shareUrl: string;
        totalReferred: number;
        totalEarned: number;
        pendingRewards: number;
        records: ReferralRecord[];
      }>('/users/me/referral'),

    applyReferralCode: (code: string) =>
      this._post<{ discount: number; message: string }>(
        '/users/me/referral/apply', { referralCode: code }
      ),
  };

  // ──────────────────────────────────────────
  // 3. WORKER
  // ──────────────────────────────────────────

  workers = {
    register: (data: WorkerRegistrationInput) =>
      this._post<Worker>('/workers/register', data),

    getProfile: () =>
      this._get<Worker>('/workers/me'),

    getPublicProfile: (workerId: string) =>
      this._get<WorkerPublicProfile>(`/workers/${workerId}/profile`),

    getReviews: (workerId: string, params?: PaginationParams) =>
      this._getPaginated<Review>(`/workers/${workerId}/reviews`, params as PaginationParams & Record<string, unknown>),

    updateProfile: (data: {
      name?: string;
      preferredLanguage?: 'hi' | 'en';
      tshirtSize?: string;
    }) => this._patch<Worker>('/workers/me', data),

    uploadProfilePhoto: (file: File, onProgress?: (p: UploadProgress) => void) =>
      this._upload<{ photoUrl: string }>('/workers/me/photo', file, undefined, onProgress),

    goOnline: () =>
      this._patch<Worker>('/workers/me/status', { status: 'online' }),

    goOffline: () =>
      this._patch<Worker>('/workers/me/status', { status: 'offline' }),

    updateStatus: (data: UpdateWorkerStatusInput) =>
      this._patch<Worker>('/workers/me/status', data),

    updateLocation: (data: UpdateWorkerLocationInput) =>
      this._post<void>('/workers/me/location', data),

    // Skills
    getSkills: () =>
      this._get<WorkerSkill[]>('/workers/me/skills'),

    addSkill: (data: AddWorkerSkillInput) =>
      this._post<WorkerSkill>('/workers/me/skills', data),

    removeSkill: (skillId: string) =>
      this._delete(`/workers/me/skills/${skillId}`),

    // Earnings
    getEarnings: (period?: string) =>
      this._get<EarningsSummary>(
        `/workers/me/earnings${period ? `?period=${period}` : ''}`
      ),

    getWallet: () =>
      this._get<WalletInfo>('/workers/me/wallet'),

    getTransactions: (params?: PaginationParams & { type?: TransactionType }) =>
      this._getPaginated<Transaction>('/workers/me/transactions', params as PaginationParams & Record<string, unknown>),

    getPayoutHistory: (params?: PaginationParams) =>
      this._getPaginated<WorkerPayout>('/workers/me/payouts', params as PaginationParams & Record<string, unknown>),

    requestPayout: (data: RequestPayoutInput) =>
      this._post<WorkerPayout>('/workers/me/payouts', data),

    getBankDetails: () =>
      this._get<{
        payoutMethod: 'bank' | 'upi';
        maskedAccount: string;
        ifscCode: string | null;
        bankName: string | null;
        upiId: string | null;
      }>('/workers/me/bank-details'),

    updateBankDetails: (data: WorkerBankDetailsInput) =>
      this._put<void>('/workers/me/bank-details', data),

    // Documents & Verification
    getDocuments: () =>
      this._get<WorkerDocument[]>('/workers/me/documents'),

    uploadDocument: (
      type: WorkerDocument['type'],
      file: File,
      onProgress?: (p: UploadProgress) => void
    ) => this._upload<WorkerDocument>('/workers/me/documents', file, { type }, onProgress),

    getVerificationStatus: () =>
      this._get<VerificationStatus>('/workers/me/verification/status'),

    submitForVerification: () =>
      this._post<void>('/workers/me/verification/submit'),

    startAadhaarVerification: (aadhaarNumber: string) =>
      this._post<{ transactionId: string; message: string }>(
        '/workers/me/verification/aadhaar/start', { aadhaarNumber }
      ),

    verifyAadhaarOtp: (transactionId: string, otp: string) =>
      this._post<WorkerVerification>(
        '/workers/me/verification/aadhaar/verify', { transactionId, otp }
      ),

    // Subscription
    getSubscription: () =>
      this._get<SubscriptionDetails>('/workers/me/subscription'),

    buySubscription: (data: BuySubscriptionInput) =>
      this._post<PaymentOrderResponse>('/workers/me/subscription', data),

    cancelSubscription: (reason: string) =>
      this._post<void>('/workers/me/subscription/cancel', { reason }),

    // Rewards & Milestones
    getRewards: () =>
      this._get<WorkerReward[]>('/workers/me/rewards'),

    claimReward: (rewardId: string, data: ClaimRewardInput) =>
      this._post<WorkerReward>(`/workers/me/rewards/${rewardId}/claim`, data),

    getMilestoneProgress: () =>
      this._get<Array<{
        milestoneKey: string;
        titleHi: string;
        titleEn: string;
        progress: number;
        required: number;
        completed: boolean;
        rewardType: string;
        amount?: number;
      }>>('/workers/me/milestones'),

    // Incentive Programs
    getIncentivePrograms: () =>
      this._get<IncentiveProgram[]>('/workers/me/incentive-programs'),

    enrollInProgram: (programId: string) =>
      this._post<void>(`/workers/me/incentive-programs/${programId}/enroll`),

    // Referral
    getReferralInfo: () =>
      this._get<{
        code: string;
        shareUrl: string;
        totalReferred: number;
        totalEarned: number;
      }>('/workers/me/referral'),

    // Stats
    getStats: () =>
      this._get<{
        totalJobs: number;
        completedJobs: number;
        cancelledJobs: number;
        rating: number;
        totalReviews: number;
        completionRate: number;
        acceptanceRate: number;
        avgResponseTimeSec: number;
        trustScore: number;
        onTimeArrivalRate: number;
        consecutiveFiveStars: number;
      }>('/workers/me/stats'),

    // Notifications
    getNotifications: (params?: PaginationParams) =>
      this._getPaginated<Notification>('/workers/me/notifications', params as PaginationParams & Record<string, unknown>),

    getUnreadCount: () =>
      this._get<{ count: number }>('/workers/me/notifications/unread-count'),

    getNotificationPreferences: () =>
      this._get<NotificationPreferencesInput>('/workers/me/notification-preferences'),

    updateNotificationPreferences: (data: NotificationPreferencesInput) =>
      this._put<void>('/workers/me/notification-preferences', data),
  };

  // ──────────────────────────────────────────
  // 4. SERVICES
  // ──────────────────────────────────────────

  services = {
    getCategories: () =>
      this._get<ServiceCategory[]>('/services/categories'),

    getAll: (params?: ServiceSearchInput) =>
      this._getPaginated<Service>('/services', params as PaginationParams & Record<string, unknown>),

    getById: (serviceId: string) =>
      this._get<Service>(`/services/${serviceId}`),

    search: (query: string, params?: Omit<ServiceSearchInput, 'query'>) =>
      this._getPaginated<Service>(
        '/services/search', { q: query, ...params } as PaginationParams & Record<string, unknown>
      ),

    getSuggestions: (query: string, city?: string) =>
      this._get<SearchSuggestion[]>(
        `/services/suggestions?q=${encodeURIComponent(query)}${city ? `&city=${city}` : ''}`
      ),

    getPricing: (serviceId: string, cityId: string, workerTier?: WorkerTier) =>
      this._get<ServicePricing & {
        surgeMultiplier: number;
        estimatedTotal: number;
      }>(
        `/services/${serviceId}/pricing?cityId=${cityId}${workerTier ? `&tier=${workerTier}` : ''}`
      ),

    getAvailableWorkers: (
      serviceId: string,
      lat: number,
      lng: number,
      radiusKm?: number,
      gender?: 'male' | 'female' | 'any'
    ) => this._get<WorkerPublicProfile[]>(
      `/services/${serviceId}/workers` + this._qs({ lat, lng, radius: radiusKm, gender })
    ),
  };

  // ──────────────────────────────────────────
  // 5. CITIES
  // ──────────────────────────────────────────

  cities = {
    getAll: (onlyActive = true) =>
      this._get<City[]>(`/cities?active=${onlyActive}`),

    getById: (cityId: string) =>
      this._get<City>(`/cities/${cityId}`),

    getSurgeZones: (cityId: string) =>
      this._get<SurgeZone[]>(`/cities/${cityId}/surge-zones`),

    getCurrentSurge: (lat: number, lng: number) =>
      this._get<SurgeInfo>(`/cities/surge?lat=${lat}&lng=${lng}`),

    geocode: (address: string, city?: string) =>
      this._post<GeocodeResult>('/cities/geocode', { address, city }),

    reverseGeocode: (lat: number, lng: number) =>
      this._get<GeocodeResult>(`/cities/reverse-geocode?lat=${lat}&lng=${lng}`),
  };

  // ──────────────────────────────────────────
  // 6. BOOKINGS
  // ──────────────────────────────────────────

  bookings = {
    create: (data: CreateBookingInput) =>
      this._post<Booking>('/bookings', data),

    getAll: (params?: PaginationParams & {
      status?: BookingStatus | BookingStatus[];
      serviceId?: string;
      dateFrom?: string;
      dateTo?: string;
    }) => this._getPaginated<Booking>('/bookings', params as PaginationParams & Record<string, unknown>),

    getById: (bookingId: string) =>
      this._get<Booking>(`/bookings/${bookingId}`),

    getActive: () =>
      this._get<Booking | null>('/bookings/active'),

    cancel: (data: CancelBookingInput) =>
      this._post<Booking>(`/bookings/${data.bookingId}/cancel`, data),

    getCancellationFee: (bookingId: string) =>
      this._get<{ fee: number; policy: string }>(
        `/bookings/${bookingId}/cancellation-fee`
      ),

    verifyOtp: (data: VerifyBookingOtpInput) =>
      this._post<{ verified: boolean; nextStep: string }>(
        `/bookings/${data.bookingId}/verify-otp`, data
      ),

    addPhotos: (
      bookingId: string,
      photoType: 'before' | 'after' | 'evidence',
      urls: string[]
    ) => this._post<void>(`/bookings/${bookingId}/photos`, {
      photoType, photoUrls: urls,
    }),

    uploadPhoto: (
      bookingId: string,
      photoType: 'before' | 'after' | 'evidence',
      file: File,
      onProgress?: (p: UploadProgress) => void
    ) => this._upload<{ photoUrl: string }>(
      `/bookings/${bookingId}/photos/upload`, file, { photoType }, onProgress
    ),

    getTimeline: (bookingId: string) =>
      this._get<BookingTimelineEvent[]>(`/bookings/${bookingId}/timeline`),

    // Chat
    getMessages: (bookingId: string, params?: PaginationParams) =>
      this._getPaginated<ChatMessage>(`/bookings/${bookingId}/messages`, params as PaginationParams & Record<string, unknown>),

    sendMessage: (data: SendMessageInput) =>
      this._post<ChatMessage>(`/bookings/${data.bookingId}/messages`, data),

    markMessagesRead: (bookingId: string, lastMessageId: string) =>
      this._post<void>(`/bookings/${bookingId}/messages/read`, { lastMessageId }),

    // SOS
    triggerSos: (data: TriggerSosInput) =>
      this._post<SosIncident>(`/bookings/${data.bookingId}/sos`, data),

    // Worker actions
    workerRespond: (
      bookingId: string,
      action: 'accept' | 'reject',
      rejectionReason?: string
    ) => this._post<void>(`/bookings/${bookingId}/respond`, { action, rejectionReason }),

    workerUpdateStatus: (bookingId: string, status: BookingStatus) =>
      this._patch<Booking>(`/bookings/${bookingId}/status`, { status }),

    // Review
    createReview: (data: CreateReviewInput) =>
      this._post<Review>(`/bookings/${data.bookingId}/review`, data),

    respondToReview: (data: ReviewResponseInput) =>
      this._post<void>(`/reviews/${data.reviewId}/respond`, data),

    flagReview: (data: FlagReviewInput) =>
      this._post<void>(`/reviews/${data.reviewId}/flag`, data),

    getReview: (bookingId: string) =>
      this._get<Review | null>(`/bookings/${bookingId}/review`),

    // Dispute
    createDispute: (data: CreateDisputeInput) =>
      this._post<Dispute>(`/bookings/${data.bookingId}/dispute`, data),

    getDispute: (bookingId: string) =>
      this._get<Dispute | null>(`/bookings/${bookingId}/dispute`),

    // Payment
    initiatePayment: (data: InitiatePaymentInput) =>
      this._post<PaymentOrderResponse>(`/bookings/${data.bookingId}/payment`, data),

    confirmPayment: (
      bookingId: string,
      razorpayPaymentId: string,
      razorpaySignature: string
    ) => this._post<Booking>(`/bookings/${bookingId}/payment/confirm`, {
      razorpayPaymentId, razorpaySignature,
    }),

    applyCoupon: (data: ApplyCouponInput) =>
      this._post<{
        discount: number;
        finalAmount: number;
        couponCode: string;
      }>(`/bookings/${data.bookingId}/coupon`, data),

    removeCoupon: (bookingId: string) =>
      this._delete(`/bookings/${bookingId}/coupon`),
  };

  // ──────────────────────────────────────────
  // 7. ADMIN
  // ──────────────────────────────────────────

  admin = {
    getDashboard: (cityId?: string) =>
      this._get<DashboardSummary>(
        `/admin/dashboard${cityId ? `?cityId=${cityId}` : ''}`
      ),

    // Workers
    getWorkers: (params?: PaginationParams & {
      status?: WorkerStatus;
      tier?: WorkerTier;
      cityId?: string;
      isVerified?: boolean;
      subscriptionPlan?: SubscriptionPlan;
    }) => this._getPaginated<Worker>('/admin/workers', params as PaginationParams & Record<string, unknown>),

    getWorkerById: (workerId: string) =>
      this._get<Worker & {
        documents: WorkerDocument[];
        recentBookings: Booking[];
        fraudFlags: FraudFlag[];
        verification: WorkerVerification | null;
      }>(`/admin/workers/${workerId}`),

    workerAction: (data: WorkerActionInput) =>
      this._post<void>('/admin/workers/action', data),

    verifyDocument: (
      documentId: string,
      action: 'approve' | 'reject',
      reason?: string
    ) => this._post<void>('/admin/workers/verify-document', {
      documentId, action, rejectionReason: reason,
    }),

    addBonus: (workerId: string, amount: number, reason: string, programId?: string) =>
      this._post<void>(`/admin/workers/${workerId}/bonus`, { amount, reason, programId }),

    addPenalty: (workerId: string, amount: number, reason: string, bookingId?: string) =>
      this._post<void>(`/admin/workers/${workerId}/penalty`, { amount, reason, bookingId }),

    // Users
    getUsers: (params?: PaginationParams & {
      status?: string;
      cityId?: string;
    }) => this._getPaginated<User>('/admin/users', params as PaginationParams & Record<string, unknown>),

    getUserById: (userId: string) =>
      this._get<User & {
        recentBookings: Booking[];
        totalSpend: number;
        loyaltyPoints: number;
      }>(`/admin/users/${userId}`),

    // Bookings
    getBookings: (params?: PaginationParams & {
      status?: BookingStatus;
      cityId?: string;
      workerId?: string;
      userId?: string;
      dateFrom?: string;
      dateTo?: string;
    }) => this._getPaginated<Booking>('/admin/bookings', params as PaginationParams & Record<string, unknown>),

    reassignWorker: (bookingId: string, newWorkerId: string, reason: string) =>
      this._post<void>('/admin/bookings/reassign', { bookingId, newWorkerId, reason }),

    // Finance
    getFinanceSummary: (params?: { cityId?: string; period?: string }) =>
      this._get<FinanceSummary>('/admin/finance/summary' + this._qs(params)),

    getPayouts: (params?: PaginationParams & {
      status?: string;
      workerId?: string;
    }) => this._getPaginated<WorkerPayout>('/admin/finance/payouts', params as PaginationParams & Record<string, unknown>),

    processPayout: (workerIds: string[], period: string) =>
      this._post<{ processed: number; failed: number; totalAmount: number }>(
        '/admin/finance/payouts/process', { workerIds, period }
      ),

    holdPayout: (workerId: string, reason: string, holdUntil?: string) =>
      this._post<void>('/admin/finance/payouts/hold', { workerId, reason, holdUntil }),

    approveRefund: (
      bookingId: string,
      amount: number,
      reason: string,
      refundMethod: 'original_payment' | 'wallet' = 'original_payment'
    ) => this._post<void>('/admin/finance/refunds', {
      bookingId, amount, reason, refundMethod,
    }),

    exportFinanceReport: (params: {
      dateFrom: string;
      dateTo: string;
      type: 'gmv' | 'payouts' | 'tds';
    }) => this._post<{ downloadUrl: string; expiresAt: string }>(
      '/admin/finance/export', params
    ),

    // Cities
    getCities: () =>
      this._get<City[]>('/admin/cities'),

    createCity: (data: {
      nameHi: string;
      nameEn: string;
      state: string;
      tier: string;
      lat: number;
      lng: number;
    }) => this._post<City>('/admin/cities', data),

    updateCity: (cityId: string, data: Partial<City>) =>
      this._put<City>(`/admin/cities/${cityId}`, data),

    updateSurgeConfig: (cityId: string, config: object) =>
      this._put<void>(`/admin/cities/${cityId}/surge-config`, config),

    // Services
    getServices: (params?: PaginationParams) =>
      this._getPaginated<Service>('/admin/services', params as PaginationParams & Record<string, unknown>),

    createService: (data: object) =>
      this._post<Service>('/admin/services', data),

    updateService: (serviceId: string, data: Partial<Service>) =>
      this._put<Service>(`/admin/services/${serviceId}`, data),

    toggleService: (serviceId: string, isActive: boolean) =>
      this._patch<void>(`/admin/services/${serviceId}/toggle`, { isActive }),

    updatePricing: (data: object) =>
      this._post<void>('/admin/pricing', data),

    getPricingHistory: (serviceId: string, cityId: string) =>
      this._get<Array<{
        id: string;
        basePrice: number;
        hourlyRate: number;
        changedBy: string;
        changeReason: string;
        changedAt: string;
      }>>(`/admin/pricing/history?serviceId=${serviceId}&cityId=${cityId}`),

    // Coupons
    getCoupons: (params?: PaginationParams & { isActive?: boolean }) =>
      this._getPaginated<{
        id: string;
        code: string;
        discountType: 'percentage' | 'flat';
        discountValue: number;
        validFrom: string;
        validTo: string;
        isActive: boolean;
        usedCount: number;
      }>('/admin/coupons', params as PaginationParams & Record<string, unknown>),

    createCoupon: (data: object) =>
      this._post<{ id: string; code: string }>('/admin/coupons', data),

    toggleCoupon: (couponId: string, isActive: boolean) =>
      this._patch<void>(`/admin/coupons/${couponId}/toggle`, { isActive }),

    getCouponStats: (couponId: string) =>
      this._get<{
        totalUsed: number;
        totalDiscountGiven: number;
        totalRevenue: number;
        uniqueUsers: number;
      }>(`/admin/coupons/${couponId}/stats`),

    // Staff
    getStaff: (params?: PaginationParams & { role?: StaffRole }) =>
      this._getPaginated<Staff>('/admin/staff', params as PaginationParams & Record<string, unknown>),

    inviteStaff: (data: InviteStaffInput) =>
      this._post<void>('/admin/staff/invite', data),

    updateStaff: (staffId: string, data: {
      role?: StaffRole;
      assignedCities?: string[];
    }) => this._put<void>(`/admin/staff/${staffId}`, data),

    deactivateStaff: (staffId: string, reason: string) =>
      this._patch<void>(`/admin/staff/${staffId}/deactivate`, { reason }),

    // Disputes
    getDisputes: (params?: PaginationParams & {
      status?: string;
      priority?: string;
      assignedTo?: string;
    }) => this._getPaginated<Dispute>('/admin/disputes', params as PaginationParams & Record<string, unknown>),

    getDisputeById: (disputeId: string) =>
      this._get<Dispute>(`/admin/disputes/${disputeId}`),

    resolveDispute: (data: ResolveDisputeInput) =>
      this._post<void>('/admin/disputes/resolve', data),

    escalateDispute: (data: EscalateDisputeInput) =>
      this._post<void>('/admin/disputes/escalate', data),

    assignDispute: (disputeId: string, agentId: string) =>
      this._post<void>(`/admin/disputes/${disputeId}/assign`, { agentId }),

    addDisputeNote: (disputeId: string, note: string, isInternal = true) =>
      this._post<void>(`/admin/disputes/${disputeId}/notes`, { note, isInternal }),

    // SOS
    getSosIncidents: (params?: PaginationParams & { status?: string }) =>
      this._getPaginated<SosIncident>('/admin/sos', params as PaginationParams & Record<string, unknown>),

    getSosById: (sosId: string) =>
      this._get<SosIncident>(`/admin/sos/${sosId}`),

    acknowledgeSos: (sosId: string, notes?: string) =>
      this._post<void>('/admin/sos/acknowledge', { sosId, notes }),

    resolveSos: (
      sosId: string,
      outcome: string,
      incidentReport: string,
      emergencyDispatched = false
    ) => this._post<void>('/admin/sos/resolve', {
      sosId, outcome, incidentReport,
      emergencyServicesDispatched: emergencyDispatched,
    }),

    // Analytics
    getAnalytics: (params?: {
      cityId?: string;
      dateFrom?: string;
      dateTo?: string;
      metric?: string;
    }) => this._get<Record<string, unknown>>(
      '/admin/analytics' + this._qs(params)
    ),

    exportAnalytics: (params: {
      dateFrom: string;
      dateTo: string;
      metrics: string[];
      cityId?: string;
    }) => this._post<{ downloadUrl: string }>(
      '/admin/analytics/export', params
    ),

    // Feature Flags
    getFeatureFlags: () =>
      this._get<FeatureFlag[]>('/admin/feature-flags'),

    toggleFeatureFlag: (
      key: string,
      isEnabled: boolean,
      rolloutPercentage?: number,
      cities?: string[]
    ) => this._patch<void>(`/admin/feature-flags/${key}`, {
      isEnabled, rolloutPercentage, enabledCities: cities,
    }),

    // Banners
    getBanners: (params?: PaginationParams) =>
      this._getPaginated<{
        id: string;
        imageUrl: string;
        title: string | null;
        status: 'pending' | 'approved' | 'rejected' | 'expired';
        scheduledFrom: string;
        scheduledTo: string;
      }>('/admin/banners', params as PaginationParams & Record<string, unknown>),

    createBanner: (data: object) =>
      this._post<{ id: string }>('/admin/banners', data),

    approveBanner: (bannerId: string, action: 'approve' | 'reject', reason?: string) =>
      this._post<void>('/admin/banners/approve', {
        bannerId, action, rejectionReason: reason,
      }),

    deleteBanner: (bannerId: string) =>
      this._delete(`/admin/banners/${bannerId}`),

    // Bulk notifications
    sendBulkNotification: (params: {
      title: string;
      body: string;
      targetType: 'all_users' | 'all_workers' | 'specific_city' | 'specific_tier';
      cityId?: string;
      workerTier?: WorkerTier;
      deepLink?: string;
    }) => this._post<{ sent: number; failed: number }>(
      '/admin/notifications/bulk', params
    ),

    // Audit Log
    getAuditLog: (params?: PaginationParams & {
      actorId?: string;
      entityType?: string;
      action?: string;
    }) => this._getPaginated<AuditLog>('/admin/audit-log', params as PaginationParams & Record<string, unknown>),

    // Fraud
    getFraudFlags: (params?: PaginationParams & {
      severity?: FraudFlagSeverity;
      status?: string;
      flagType?: FraudFlagType;
    }) => this._getPaginated<FraudFlag>('/admin/fraud-flags', params as PaginationParams & Record<string, unknown>),

    reviewFraudFlag: (flagId: string, action: 'confirm' | 'dismiss', notes?: string) =>
      this._post<void>(`/admin/fraud-flags/${flagId}/review`, { action, notes }),

    // Incentive Programs
    getIncentivePrograms: (params?: PaginationParams) =>
      this._getPaginated<IncentiveProgram>('/admin/incentive-programs', params as PaginationParams & Record<string, unknown>),

    createIncentiveProgram: (data: Omit<IncentiveProgram, 'id' | 'enrolledCount' | 'completedCount'>) =>
      this._post<IncentiveProgram>('/admin/incentive-programs', data),

    toggleIncentiveProgram: (programId: string, isActive: boolean) =>
      this._patch<void>(`/admin/incentive-programs/${programId}/toggle`, { isActive }),

    getIncentiveProgramStats: (programId: string) =>
      this._get<{
        enrolled: number;
        completed: number;
        totalBonusPaid: number;
        completionRate: number;
      }>(`/admin/incentive-programs/${programId}/stats`),
  };

  // ──────────────────────────────────────────
  // 8. SUPPORT
  // ──────────────────────────────────────────

  support = {
    getLiveDashboard: () =>
      this._get<{
        activeBookings: number;
        searchingBookings: number;
        activeWorkers: number;
        openDisputes: number;
        activeSos: number;
        avgResponseTimeSec: number;
      }>('/support/dashboard/live'),

    getBookings: (params?: PaginationParams & {
      status?: BookingStatus;
      cityId?: string;
    }) => this._getPaginated<Booking>('/support/bookings', params as PaginationParams & Record<string, unknown>),

    getBookingDetails: (bookingId: string) =>
      this._get<Booking & {
        user: User;
        worker: Worker | null;
        timeline: BookingTimelineEvent[];
        dispute: Dispute | null;
        sosIncidents: SosIncident[];
        internalNotes: Array<{
          id: string;
          note: string;
          addedBy: string;
          isUrgent: boolean;
          createdAt: string;
        }>;
      }>(`/support/bookings/${bookingId}`),

    reassignWorker: (bookingId: string, newWorkerId: string, reason: string) =>
      this._post<void>('/support/bookings/reassign', { bookingId, newWorkerId, reason }),

    addNote: (
      entityType: 'booking' | 'worker' | 'user' | 'dispute',
      entityId: string,
      note: string,
      isUrgent = false
    ) => this._post<void>('/support/notes', { entityType, entityId, note, isUrgent }),

    flagForQa: (data: {
      entityType: string;
      entityId: string;
      flagType: FraudFlagType;
      severity: FraudFlagSeverity;
      description: string;
    }) => this._post<void>('/support/flag', data),

    getDisputes: (params?: PaginationParams & { status?: string }) =>
      this._getPaginated<Dispute>('/support/disputes', params as PaginationParams & Record<string, unknown>),

    assignDispute: (disputeId: string) =>
      this._post<void>(`/support/disputes/${disputeId}/assign`),

    getSosIncidents: (params?: { status?: string }) =>
      this._get<SosIncident[]>('/support/sos' + this._qs(params)),

    // Support chat (agent ↔ user/worker)
    getSupportChats: (params?: PaginationParams) =>
      this._getPaginated<{
        id: string;
        userId: string;
        userName: string;
        userType: 'user' | 'worker';
        lastMessage: string;
        unreadCount: number;
        status: 'open' | 'resolved';
        createdAt: string;
      }>('/support/chats', params as PaginationParams & Record<string, unknown>),

    getChatMessages: (chatId: string, params?: PaginationParams) =>
      this._getPaginated<ChatMessage>(
        `/support/chats/${chatId}/messages`, params as PaginationParams & Record<string, unknown>
      ),

    sendMessage: (chatId: string, content: string) =>
      this._post<ChatMessage>(`/support/chats/${chatId}/messages`, { content }),

    resolveChat: (chatId: string) =>
      this._patch<void>(`/support/chats/${chatId}/resolve`),
  };

  // ──────────────────────────────────────────
  // 9. UPLOADS
  // ──────────────────────────────────────────

  uploads = {
    getPresignedUrl: (data: FileUploadInput) =>
      this._post<PresignedUrlResponse>('/uploads/presigned-url', data),
  };

  // ──────────────────────────────────────────
  // 10. ANALYTICS
  // ──────────────────────────────────────────

  analytics = {
    track: (data: TrackEventInput) =>
      this._post<void>('/analytics/track', {
        ...data,
        timestamp: data.timestamp ?? new Date().toISOString(),
      }),

    trackBatch: (events: TrackEventInput[]) =>
      this._post<void>('/analytics/track/batch', { events }),
  };

  // ──────────────────────────────────────────
  // 11. HEALTH
  // ──────────────────────────────────────────

  health = {
    check: () =>
      this._get<{
        status: 'ok' | 'degraded';
        uptime: number;
        version: string;
        services: Record<string, 'up' | 'down'>;
      }>('/health'),
  };
}

// ──────────────────────────────────────────
// SINGLETON
// ──────────────────────────────────────────

let _instance: InistntApiClient | null = null;

export function createApiClient(
  baseURL: string,
  adapter?: PlatformAdapter,
  wsURL?: string
): InistntApiClient {
  _instance = new InistntApiClient(baseURL, adapter, wsURL);
  return _instance;
}

export function getApiClient(): InistntApiClient {
  if (!_instance) {
    throw new Error(
      'API client initialize nahi hua. Pehle createApiClient() call karo.'
    );
  }
  return _instance;
}

export type { AuthTokens, JwtPayload };