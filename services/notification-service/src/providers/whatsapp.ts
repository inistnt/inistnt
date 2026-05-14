// ═══════════════════════════════════════════════════════════════════
// INISTNT — WhatsApp Provider
// Supports: MSG91 WhatsApp Business API + Interakt (fallback)
//
// Templates (pre-approved in Meta Business Manager):
//   booking_confirmed    — booking_number, service_name, date, amount
//   worker_assigned      — worker_name, eta, booking_number
//   booking_completed    — booking_number, amount, review_link
//   otp_verification     — otp, expiry_minutes
//   payout_processed     — amount, utr_number
//   booking_reminder     — service_name, date, time  (1hr before)
//
// .env:
//   WHATSAPP_PROVIDER=msg91
//   MSG91_WHATSAPP_TOKEN=your_token
//   MSG91_WHATSAPP_SENDER=918888888888
//   INTERAKT_API_KEY=your_key  (optional fallback)
// ═══════════════════════════════════════════════════════════════════

export type WhatsAppTemplateId =
  | 'booking_confirmed'
  | 'worker_assigned'
  | 'booking_completed'
  | 'otp_verification'
  | 'payout_processed'
  | 'booking_reminder'
  | 'booking_cancelled'
  | 'worker_verified';

interface WhatsAppMessage {
  to:           string;           // Indian mobile: 9XXXXXXXXX (without +91)
  templateId:   WhatsAppTemplateId;
  variables:    string[];         // Ordered params for template placeholders
  mediaUrl?:    string;           // Optional image/doc attachment
}

// ─── MSG91 PROVIDER ───────────────────────────────────────────────
async function sendViaMSG91(msg: WhatsAppMessage): Promise<boolean> {
  const token  = process.env.MSG91_WHATSAPP_TOKEN;
  const sender = process.env.MSG91_WHATSAPP_SENDER ?? '918888888888';

  if (!token) return false;

  const mobile = msg.to.replace(/\D/g, '');
  const to     = mobile.startsWith('91') ? mobile : `91${mobile}`;

  try {
    const res = await fetch('https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'authkey':      token,
      },
      body: JSON.stringify({
        integrated_number: sender,
        content_type:      'template',
        payload: {
          to:          [to],
          type:        'template',
          template: {
            name:     msg.templateId,
            language: { code: 'hi' }, // Hindi templates — change to 'en' if needed
            components: msg.variables.length > 0
              ? [{
                  type: 'body',
                  parameters: msg.variables.map(v => ({ type: 'text', text: v })),
                }]
              : [],
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const data = await res.json() as any;
    if (!res.ok || data.type === 'error') {
      console.error('[WhatsApp:MSG91] Error:', data.message ?? res.status);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error('[WhatsApp:MSG91] Request failed:', err.message);
    return false;
  }
}

// ─── INTERAKT PROVIDER ────────────────────────────────────────────
async function sendViaInterakt(msg: WhatsAppMessage): Promise<boolean> {
  const apiKey = process.env.INTERAKT_API_KEY;
  if (!apiKey) return false;

  const mobile = msg.to.replace(/\D/g, '');
  const to     = mobile.startsWith('91') ? mobile : `91${mobile}`;

  try {
    const res = await fetch('https://api.interakt.ai/v1/public/message/', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Basic ${Buffer.from(apiKey).toString('base64')}`,
      },
      body: JSON.stringify({
        countryCode: '+91',
        phoneNumber: to.replace('91', ''),
        callbackData: msg.templateId,
        type: 'Template',
        template: {
          name:           msg.templateId,
          languageCode:   'hi',
          headerValues:   [],
          bodyValues:     msg.variables,
          buttonValues:   { '0': [] },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const data = await res.json() as any;
    if (!res.ok || !data.result) {
      console.error('[WhatsApp:Interakt] Error:', data.message ?? res.status);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error('[WhatsApp:Interakt] Request failed:', err.message);
    return false;
  }
}

// ─── DEV: Console log ─────────────────────────────────────────────
function sendViaDev(msg: WhatsAppMessage): boolean {
  console.log('\n─────────────────────────────────────────');
  console.log(`📱 WHATSAPP (DEV) → ${msg.to}`);
  console.log(`   Template: ${msg.templateId}`);
  console.log(`   Vars:     ${msg.variables.join(' | ')}`);
  console.log('─────────────────────────────────────────\n');
  return true;
}

// ─── MAIN SEND FUNCTION ───────────────────────────────────────────
export async function sendWhatsApp(msg: WhatsAppMessage): Promise<boolean> {
  const isDev     = process.env.NODE_ENV === 'development';
  const provider  = process.env.WHATSAPP_PROVIDER ?? 'msg91';

  if (isDev && !process.env.MSG91_WHATSAPP_TOKEN && !process.env.INTERAKT_API_KEY) {
    return sendViaDev(msg);
  }

  const sent = provider === 'interakt'
    ? await sendViaInterakt(msg)
    : await sendViaMSG91(msg);

  // Fallback to other provider
  if (!sent && provider === 'msg91' && process.env.INTERAKT_API_KEY) {
    console.log('[WhatsApp] MSG91 failed, trying Interakt...');
    return sendViaInterakt(msg);
  }

  return sent;
}

// ─── TYPED HELPERS ────────────────────────────────────────────────

export const whatsapp = {
  bookingConfirmed: (to: string, bookingNumber: string, serviceName: string, dateTime: string, amount: string) =>
    sendWhatsApp({ to, templateId: 'booking_confirmed', variables: [bookingNumber, serviceName, dateTime, amount] }),

  workerAssigned: (to: string, workerName: string, eta: string, bookingNumber: string, workerMobile: string) =>
    sendWhatsApp({ to, templateId: 'worker_assigned', variables: [workerName, eta, bookingNumber, workerMobile] }),

  bookingCompleted: (to: string, bookingNumber: string, amount: string, reviewLink: string) =>
    sendWhatsApp({ to, templateId: 'booking_completed', variables: [bookingNumber, amount, reviewLink] }),

  otpVerification: (to: string, otp: string, expiryMinutes: string = '5') =>
    sendWhatsApp({ to, templateId: 'otp_verification', variables: [otp, expiryMinutes] }),

  payoutProcessed: (to: string, amount: string, utrNumber: string) =>
    sendWhatsApp({ to, templateId: 'payout_processed', variables: [amount, utrNumber] }),

  bookingReminder: (to: string, serviceName: string, date: string, time: string) =>
    sendWhatsApp({ to, templateId: 'booking_reminder', variables: [serviceName, date, time] }),

  bookingCancelled: (to: string, bookingNumber: string, reason: string) =>
    sendWhatsApp({ to, templateId: 'booking_cancelled', variables: [bookingNumber, reason] }),

  workerVerified: (to: string, workerName: string) =>
    sendWhatsApp({ to, templateId: 'worker_verified', variables: [workerName] }),
};
