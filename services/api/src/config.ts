// ═══════════════════════════════════════════════════════════
// INISTNT API — Config
// All env variables typed and validated at startup
// ═══════════════════════════════════════════════════════════

import 'dotenv/config';

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env variable: ${key}`);
  return value;
}

function optional(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

function optionalInt(key: string, fallback: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : fallback;
}

export const config = {
  // App
  NODE_ENV:    optional('NODE_ENV', 'development') as 'development' | 'production' | 'test',
  PORT:        optionalInt('PORT', 4000),
  LOG_LEVEL:   optional('LOG_LEVEL', 'info'),

  // Database
  DATABASE_URL: required('DATABASE_URL'),

  // Redis
  REDIS_URL:    required('REDIS_URL'),
  REDIS_PREFIX: optional('REDIS_PREFIX', 'inistnt:'),

  // Kafka
  KAFKA_BROKERS:   optional('KAFKA_BROKERS', 'localhost:9092').split(','),
  KAFKA_CLIENT_ID: optional('KAFKA_CLIENT_ID', 'inistnt-api'),
  KAFKA_GROUP_ID:  optional('KAFKA_GROUP_ID', 'inistnt-api-group'),

  // Elasticsearch
  ELASTICSEARCH_URL:          optional('ELASTICSEARCH_URL', 'http://localhost:9200'),
  ELASTICSEARCH_INDEX_PREFIX: optional('ELASTICSEARCH_INDEX_PREFIX', 'inistnt_'),

  // ClickHouse
  CLICKHOUSE_HOST:     optional('CLICKHOUSE_HOST', 'localhost'),
  CLICKHOUSE_PORT:     optionalInt('CLICKHOUSE_PORT', 8123),
  CLICKHOUSE_USER:     optional('CLICKHOUSE_USER', 'inistnt'),
  CLICKHOUSE_PASSWORD: optional('CLICKHOUSE_PASSWORD', ''),
  CLICKHOUSE_DATABASE: optional('CLICKHOUSE_DATABASE', 'inistnt_analytics'),

  // S3 / MinIO
  S3_ENDPOINT:          optional('S3_ENDPOINT', 'http://localhost:9003'),
  S3_ACCESS_KEY:        required('S3_ACCESS_KEY'),
  S3_SECRET_KEY:        required('S3_SECRET_KEY'),
  S3_BUCKET_DOCUMENTS:  optional('S3_BUCKET_DOCUMENTS', 'inistnt-documents'),
  S3_BUCKET_PHOTOS:     optional('S3_BUCKET_PHOTOS', 'inistnt-photos'),
  S3_BUCKET_BANNERS:    optional('S3_BUCKET_BANNERS', 'inistnt-banners'),
  S3_REGION:            optional('S3_REGION', 'ap-south-1'),
  S3_PUBLIC_URL:        optional('S3_PUBLIC_URL', 'http://localhost:9003'),

  // JWT
  JWT_ACCESS_SECRET:  required('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET'),
  JWT_ACCESS_EXPIRY:  optional('JWT_ACCESS_EXPIRY', '15m'),
  JWT_REFRESH_EXPIRY: optional('JWT_REFRESH_EXPIRY', '30d'),

  // OTP
  OTP_EXPIRY_SECONDS:           optionalInt('OTP_EXPIRY_SECONDS', 300),
  OTP_MAX_ATTEMPTS:             optionalInt('OTP_MAX_ATTEMPTS', 3),
  OTP_RESEND_COOLDOWN_SECONDS:  optionalInt('OTP_RESEND_COOLDOWN_SECONDS', 60),
  OTP_DEV_BYPASS:               optional('OTP_DEV_BYPASS', ''),

  // SMS
  MSG91_AUTH_KEY:      optional('MSG91_AUTH_KEY'),
  MSG91_SENDER_ID:     optional('MSG91_SENDER_ID', 'INSTN'),
  MSG91_TEMPLATE_ID_OTP: optional('MSG91_TEMPLATE_ID_OTP'),

  // Email
  SMTP_HOST:     optional('SMTP_HOST', 'localhost'),
  SMTP_PORT:     optionalInt('SMTP_PORT', 1025),
  SMTP_USER:     optional('SMTP_USER'),
  SMTP_PASS:     optional('SMTP_PASS'),
  EMAIL_FROM:    optional('EMAIL_FROM', 'noreply@inistnt.in'),
  EMAIL_FROM_NAME: optional('EMAIL_FROM_NAME', 'Inistnt'),
  RESEND_API_KEY: optional('RESEND_API_KEY'),

  // Firebase
  FIREBASE_PROJECT_ID:   optional('FIREBASE_PROJECT_ID'),
  FIREBASE_PRIVATE_KEY:  optional('FIREBASE_PRIVATE_KEY'),
  FIREBASE_CLIENT_EMAIL: optional('FIREBASE_CLIENT_EMAIL'),

  // Razorpay
  RAZORPAY_KEY_ID:       optional('RAZORPAY_KEY_ID'),
  RAZORPAY_KEY_SECRET:   optional('RAZORPAY_KEY_SECRET'),
  RAZORPAY_WEBHOOK_SECRET: optional('RAZORPAY_WEBHOOK_SECRET'),

  // Google Maps
  GOOGLE_MAPS_API_KEY: optional('GOOGLE_MAPS_API_KEY'),

  // AI
  ROBOFLOW_API_KEY:  optional('ROBOFLOW_API_KEY'),
  ROBOFLOW_MODEL_ID: optional('ROBOFLOW_MODEL_ID', 'inistnt-uniform-check/1'),

  // CORS
  ALLOWED_ORIGINS: optional('ALLOWED_ORIGINS', 'http://localhost:3000,http://localhost:3001').split(','),

  // Rate limiting
  RATE_LIMIT_MAX:       optionalInt('RATE_LIMIT_MAX', 100),
  RATE_LIMIT_WINDOW_MS: optionalInt('RATE_LIMIT_WINDOW_MS', 60000),

  // Internal services
  MATCHING_ENGINE_URL:     optional('MATCHING_ENGINE_URL', 'http://localhost:4001'),
  LOCATION_SERVICE_URL:    optional('LOCATION_SERVICE_URL', 'http://localhost:4002'),
  NOTIFICATION_SERVICE_URL: optional('NOTIFICATION_SERVICE_URL', 'http://localhost:4003'),
} as const;

export type Config = typeof config;