import 'dotenv/config';

function env(key: string, fallback?: string): string {
  const v = process.env[key];
  if (!v && fallback === undefined) throw new Error(`Missing env: ${key}`);
  return v ?? fallback!;
}

export const config = {
  NODE_ENV: env('NODE_ENV', 'development'),

  // Kafka
  KAFKA_BROKERS:   env('KAFKA_BROKERS', 'localhost:9092').split(','),
  KAFKA_CLIENT_ID: env('KAFKA_CLIENT_ID', 'notification-service'),
  KAFKA_GROUP_ID:  env('KAFKA_GROUP_ID', 'notification-service-group'),

  // Redis
  REDIS_URL:      env('REDIS_URL', 'redis://:inistnt_redis_password@localhost:6379'),

  // FCM — Firebase
  FIREBASE_PROJECT_ID:     env('FIREBASE_PROJECT_ID', ''),
  FIREBASE_CLIENT_EMAIL:   env('FIREBASE_CLIENT_EMAIL', ''),
  FIREBASE_PRIVATE_KEY:    env('FIREBASE_PRIVATE_KEY', '').replace(/\\n/g, '\n'),

  // SMS — MSG91
  MSG91_AUTH_KEY:       env('MSG91_AUTH_KEY', ''),
  MSG91_SENDER_ID:      env('MSG91_SENDER_ID', 'INSTN'),
  MSG91_TEMPLATE_ID:    env('MSG91_TEMPLATE_ID', ''),

  // Email — SMTP
  SMTP_HOST:  env('SMTP_HOST', 'localhost'),
  SMTP_PORT:  parseInt(env('SMTP_PORT', '1025')),
  SMTP_USER:  env('SMTP_USER', ''),
  SMTP_PASS:  env('SMTP_PASS', ''),
  EMAIL_FROM: env('EMAIL_FROM', 'Inistnt <noreply@inistnt.in>'),

  // DB (for fetching fcmToken if not in event)
  DATABASE_URL: env('DATABASE_URL',
    'postgresql://inistnt:inistnt_dev_password@localhost:5432/inistnt_db'),
};
