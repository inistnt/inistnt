import axios from 'axios';
import { config } from '../config';
import { logger } from '../logger';

// ─── MSG91 SMS ────────────────────────────────────────────────────────────────

const MSG91_API = 'https://control.msg91.com/api/v5';

export async function sendSms(mobile: string, message: string, templateId?: string): Promise<boolean> {
  if (!config.MSG91_AUTH_KEY) {
    // Dev mode — just log
    logger.info({ mobile, message }, '📱 [DEV] SMS (not sent — no MSG91 key)');
    return true;
  }

  // Normalize mobile number (add 91 if not present)
  const normalized = mobile.startsWith('91') ? mobile : `91${mobile.replace(/^0/, '')}`;

  try {
    const response = await axios.post(
      `${MSG91_API}/flow/`,
      {
        template_id: templateId ?? config.MSG91_TEMPLATE_ID,
        sender:      config.MSG91_SENDER_ID,
        short_url:   '0',
        mobiles:     normalized,
        // Dynamic variables — passed as extra fields
        message,
      },
      {
        headers: {
          authkey:       config.MSG91_AUTH_KEY,
          'Content-Type': 'application/JSON',
        },
        timeout: 10_000,
      }
    );

    if (response.data?.type === 'success') {
      logger.info({ mobile: normalized.slice(-4) }, '✅ SMS sent');
      return true;
    } else {
      logger.warn({ response: response.data, mobile: normalized.slice(-4) }, '⚠️ SMS send failed');
      return false;
    }
  } catch (err: any) {
    logger.error({ err: err.message, mobile: normalized.slice(-4) }, '❌ SMS error');
    return false;
  }
}

// ─── OTP SMS ────────────────────────────────────────────────────────────────

export async function sendOtpSms(mobile: string, otp: string): Promise<boolean> {
  return sendSms(mobile, `Your Inistnt OTP is ${otp}. Valid for 10 minutes. Do not share. - INSTN`);
}

// ─── BOOKING SMS TEMPLATES ───────────────────────────────────────────────────

export async function sendBookingAssignedSms(mobile: string, workerName: string, eta: number): Promise<boolean> {
  return sendSms(mobile, `Your Inistnt booking confirmed! ${workerName} is on the way, arriving in ${eta} mins. - INSTN`);
}

export async function sendBookingCompletedSms(mobile: string, amount: number): Promise<boolean> {
  return sendSms(mobile, `Your Inistnt service is complete. ₹${amount / 100} charged. Rate your experience on the app. - INSTN`);
}

export async function sendNoWorkerSms(mobile: string): Promise<boolean> {
  return sendSms(mobile, `Sorry, no worker available right now. Please try again in a few minutes. - INSTN`);
}
