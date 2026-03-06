import nodemailer from 'nodemailer';
import { config } from '../config';
import { logger } from '../logger';

// ─── TRANSPORTER ─────────────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: config.SMTP_PORT === 465,
  auth: config.SMTP_USER
    ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
    : undefined,
});

transporter.verify().then(() => {
  logger.info('✅ Email transporter ready');
}).catch(err => {
  logger.warn({ err: err.message }, '⚠️ Email transporter not ready (dev: use Mailhog)');
});

// ─── SEND EMAIL ──────────────────────────────────────────────────────────────

export interface EmailPayload {
  to:      string;
  subject: string;
  html:    string;
  text?:   string;
}

export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  try {
    const info = await transporter.sendMail({
      from:    config.EMAIL_FROM,
      to:      payload.to,
      subject: payload.subject,
      html:    payload.html,
      text:    payload.text ?? payload.html.replace(/<[^>]+>/g, ''),
    });
    logger.info({ messageId: info.messageId, to: payload.to }, '✅ Email sent');
    return true;
  } catch (err: any) {
    logger.error({ err: err.message, to: payload.to }, '❌ Email failed');
    return false;
  }
}

// ─── EMAIL TEMPLATES ─────────────────────────────────────────────────────────

function baseTemplate(content: string) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; }
    .header { background: #6C3CE1; padding: 24px; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 24px; }
    .body { padding: 32px; color: #333; line-height: 1.6; }
    .cta { display: inline-block; background: #6C3CE1; color: white; padding: 12px 24px;
           border-radius: 8px; text-decoration: none; font-weight: bold; margin: 16px 0; }
    .footer { background: #f9f9f9; padding: 16px; text-align: center; color: #999; font-size: 12px; }
    .highlight { background: #f0ebff; border-radius: 8px; padding: 16px; margin: 16px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>⚡ Inistnt</h1></div>
    <div class="body">${content}</div>
    <div class="footer">Inistnt Services Pvt. Ltd. · Lucknow, India<br>
      <a href="mailto:support@inistnt.in">support@inistnt.in</a>
    </div>
  </div>
</body>
</html>`;
}

export async function sendWelcomeEmail(to: string, name: string): Promise<boolean> {
  return sendEmail({
    to,
    subject: 'Inistnt pe aapka swagat hai! 🎉',
    html: baseTemplate(`
      <h2>Namaste ${name}!</h2>
      <p>Inistnt family mein aapka swagat hai — India ka sabse bharosemand home services platform.</p>
      <div class="highlight">
        <strong>Pehli booking pe milega:</strong><br>
        Coupon <strong>WELCOME50</strong> use karein — 50% off (max ₹150)
      </div>
      <p>App download karein aur apne ghar ki services book karein!</p>
      <a class="cta" href="https://inistnt.in/app">App Download Karein</a>
    `),
  });
}

export async function sendBookingConfirmEmail(to: string, details: {
  name: string; bookingNo: string; service: string;
  workerName: string; eta: number; amount: number;
}): Promise<boolean> {
  return sendEmail({
    to,
    subject: `Booking Confirm — ${details.bookingNo}`,
    html: baseTemplate(`
      <h2>Booking Confirmed! ✅</h2>
      <p>Namaste ${details.name},</p>
      <div class="highlight">
        <strong>Booking ID:</strong> ${details.bookingNo}<br>
        <strong>Service:</strong> ${details.service}<br>
        <strong>Worker:</strong> ${details.workerName}<br>
        <strong>ETA:</strong> ~${details.eta} minutes<br>
        <strong>Amount:</strong> ₹${details.amount / 100}
      </div>
      <p>Worker ${details.workerName} aa rahe hain. App pe track karein!</p>
    `),
  });
}

export async function sendBookingCompletedEmail(to: string, details: {
  name: string; bookingNo: string; service: string; amount: number;
}): Promise<boolean> {
  return sendEmail({
    to,
    subject: `Service Complete — ${details.bookingNo}`,
    html: baseTemplate(`
      <h2>Service Complete! 🎉</h2>
      <p>Namaste ${details.name},</p>
      <p>Aapki <strong>${details.service}</strong> service successfully complete ho gayi.</p>
      <div class="highlight">
        <strong>Amount Charged:</strong> ₹${details.amount / 100}<br>
        <strong>Booking:</strong> ${details.bookingNo}
      </div>
      <p>Kaisi rahi service? App mein rating zaroor dein! ⭐</p>
    `),
  });
}
