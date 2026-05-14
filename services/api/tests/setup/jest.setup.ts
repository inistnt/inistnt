// ═══════════════════════════════════════════════════════════
// GLOBAL JEST SETUP — runs before every test file
// ═══════════════════════════════════════════════════════════

// Load test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/inistnt_test';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.REDIS_PREFIX = 'test:';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_32_chars_minimum_x';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_32_chars_minimum';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '30d';
process.env.OTP_EXPIRY_SECONDS = '300';
process.env.OTP_MAX_ATTEMPTS = '3';
process.env.OTP_RESEND_COOLDOWN_SECONDS = '60';
process.env.OTP_DEV_BYPASS = '123456';
process.env.S3_ACCESS_KEY = 'test_access_key';
process.env.S3_SECRET_KEY = 'test_secret_key';
process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'rzp_test_webhook_secret';
process.env.KAFKA_BROKERS = 'localhost:9092';
process.env.LOG_LEVEL = 'silent';
process.env.RATE_LIMIT_MAX = '1000';
process.env.RATE_LIMIT_WINDOW_MS = '60000';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';

// Suppress console logs in tests unless debugging
if (!process.env.DEBUG_TESTS) {
  global.console.log = jest.fn();
  global.console.info = jest.fn();
}
