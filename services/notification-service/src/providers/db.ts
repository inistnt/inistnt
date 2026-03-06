import { Pool } from 'pg';
import { config } from '../config';
import { logger } from '../logger';

const pool = new Pool({ connectionString: config.DATABASE_URL });

pool.on('error', (err) => logger.error({ err }, 'DB pool error'));

export interface RecipientInfo {
  id:       string;
  name:     string;
  mobile?:  string;
  email?:   string;
  fcmToken?: string;
}

// Fetch user token + contact info from DB
export async function getUserInfo(userId: string): Promise<RecipientInfo | null> {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, mobile, email, fcm_token FROM users WHERE id = $1`,
      [userId]
    );
    if (!rows[0]) return null;
    return {
      id:       rows[0].id,
      name:     rows[0].name,
      mobile:   rows[0].mobile,
      email:    rows[0].email,
      fcmToken: rows[0].fcm_token,
    };
  } catch (err) {
    logger.error({ err, userId }, 'getUserInfo failed');
    return null;
  }
}

// Fetch worker token + contact info
export async function getWorkerInfo(workerId: string): Promise<RecipientInfo | null> {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, mobile, email, fcm_token FROM workers WHERE id = $1`,
      [workerId]
    );
    if (!rows[0]) return null;
    return {
      id:       rows[0].id,
      name:     rows[0].name,
      mobile:   rows[0].mobile,
      email:    rows[0].email,
      fcmToken: rows[0].fcm_token,
    };
  } catch (err) {
    logger.error({ err, workerId }, 'getWorkerInfo failed');
    return null;
  }
}

// Remove stale FCM token from DB
export async function clearFcmToken(userId: string, type: 'user' | 'worker'): Promise<void> {
  const table = type === 'user' ? 'users' : 'workers';
  await pool.query(`UPDATE ${table} SET fcm_token = NULL WHERE id = $1`, [userId]);
}

export async function closeDb() {
  await pool.end();
}
