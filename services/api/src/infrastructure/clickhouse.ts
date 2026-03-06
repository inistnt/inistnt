import { createClient } from '@clickhouse/client';
import { config } from '../config';

// ─────────────────────────────────────────────────────────────
// CLICKHOUSE CLIENT
// ─────────────────────────────────────────────────────────────

export const ch = createClient({
  host:     config.CLICKHOUSE_URL     ?? 'http://localhost:8123',
  username: config.CLICKHOUSE_USER    ?? 'inistnt',
  password: config.CLICKHOUSE_PASSWORD ?? 'inistnt_ch_password',
  database: config.CLICKHOUSE_DB      ?? 'inistnt_analytics',
});

// ─── CREATE TABLES (run once on startup) ─────────────────────

export async function createAnalyticsTables() {
  // Booking events — full history
  await ch.exec({ query: `
    CREATE TABLE IF NOT EXISTS booking_events (
      event_type    String,
      booking_id    String,
      booking_number String,
      user_id       String,
      worker_id     Nullable(String),
      service_id    String,
      category_id   String,
      city_id       String,
      area_id       Nullable(String),
      amount        UInt32,
      discount      UInt32,
      platform_fee  UInt32,
      worker_earning UInt32,
      payment_method Nullable(String),
      cancel_reason  Nullable(String),
      cancelled_by   Nullable(String),
      lat            Nullable(Float64),
      lng            Nullable(Float64),
      duration_min   Nullable(UInt16),
      rating         Nullable(Float32),
      created_at     DateTime,
      event_at       DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (city_id, created_at, booking_id)
    PARTITION BY toYYYYMM(created_at)
  ` });

  // Payment events
  await ch.exec({ query: `
    CREATE TABLE IF NOT EXISTS payment_events (
      event_type    String,
      payment_id    String,
      booking_id    String,
      user_id       String,
      worker_id     Nullable(String),
      amount        UInt32,
      method        Nullable(String),
      city_id       Nullable(String),
      created_at    DateTime,
      event_at      DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (created_at, payment_id)
    PARTITION BY toYYYYMM(created_at)
  ` });

  // Worker location history (for heatmaps)
  await ch.exec({ query: `
    CREATE TABLE IF NOT EXISTS worker_locations (
      worker_id  String,
      city_id    String,
      lat        Float64,
      lng        Float64,
      is_online  UInt8,
      recorded_at DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY (city_id, recorded_at)
    PARTITION BY toYYYYMMDD(recorded_at)
    TTL recorded_at + INTERVAL 30 DAY
  ` });

  // Worker performance daily snapshots
  await ch.exec({ query: `
    CREATE TABLE IF NOT EXISTS worker_daily_stats (
      worker_id        String,
      city_id          String,
      date             Date,
      bookings_done    UInt16,
      bookings_cancelled UInt16,
      earnings         UInt32,
      online_minutes   UInt16,
      avg_rating       Float32,
      created_at       DateTime DEFAULT now()
    ) ENGINE = ReplacingMergeTree(created_at)
    ORDER BY (worker_id, date)
  ` });

  // SOS incidents
  await ch.exec({ query: `
    CREATE TABLE IF NOT EXISTS sos_events (
      sos_id      String,
      booking_id  String,
      triggered_by String,
      city_id     String,
      lat         Nullable(Float64),
      lng         Nullable(Float64),
      resolved_at Nullable(DateTime),
      created_at  DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY created_at
  ` });

  console.log('[CH] ✅ Analytics tables ready');
}

// ─── INSERT HELPERS ───────────────────────────────────────────

export async function insertBookingEvent(row: Partial<{
  event_type:     string;
  booking_id:     string;
  booking_number: string;
  user_id:        string;
  worker_id:      string | null;
  service_id:     string;
  category_id:    string;
  city_id:        string;
  area_id:        string | null;
  amount:         number;
  discount:       number;
  platform_fee:   number;
  worker_earning: number;
  payment_method: string | null;
  cancel_reason:  string | null;
  cancelled_by:   string | null;
  lat:            number | null;
  lng:            number | null;
  duration_min:   number | null;
  rating:         number | null;
  created_at:     string;
}>) {
  await ch.insert({
    table:  'booking_events',
    values: [row],
    format: 'JSONEachRow',
  });
}

export async function insertPaymentEvent(row: Partial<{
  event_type:  string;
  payment_id:  string;
  booking_id:  string;
  user_id:     string;
  worker_id:   string | null;
  amount:      number;
  method:      string | null;
  city_id:     string | null;
  created_at:  string;
}>) {
  await ch.insert({
    table:  'payment_events',
    values: [row],
    format: 'JSONEachRow',
  });
}

export async function insertWorkerLocation(row: {
  worker_id:   string;
  city_id:     string;
  lat:         number;
  lng:         number;
  is_online:   number;
}) {
  await ch.insert({
    table:  'worker_locations',
    values: [row],
    format: 'JSONEachRow',
  });
}

export async function insertSosEvent(row: Partial<{
  sos_id:       string;
  booking_id:   string;
  triggered_by: string;
  city_id:      string;
  lat:          number | null;
  lng:          number | null;
  created_at:   string;
}>) {
  await ch.insert({
    table:  'sos_events',
    values: [row],
    format: 'JSONEachRow',
  });
}
