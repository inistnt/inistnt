// ═══════════════════════════════════════════════════════════════════
// INISTNT — Email Service (Resend)
// Provider: Resend (https://resend.com)
//
// Dev: Mailhog fallback (localhost:1025) jab RESEND_API_KEY nahi hai
// Prod: Resend API — transactional + bulk emails
//
// Install: pnpm add resend
//
// .env:
//   RESEND_API_KEY=re_xxxxxxxxxxxx
//   EMAIL_FROM=Inistnt <noreply@inistnt.in>
//   EMAIL_FROM_NAME=Inistnt
//
// Single export: sendEmail() — sab jagah se yahi call hogi
// ═══════════════════════════════════════════════════════════════════

import { Resend } from 'resend';
import { logger } from '../../config/logger';

// ─── Client (lazy init) ───────────────────────────────────────────
let resendClient: Resend | null = null;

function getClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY not set');
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

const FROM = process.env.EMAIL_FROM ?? 'Inistnt <noreply@inistnt.in>';

// ─── Dev fallback: Mailhog via fetch ──────────────────────────────
async function sendViaMailhog(params: { to: string; subject: string; html: string }): Promise<void> {
  // Mailhog accepts raw SMTP — we use a tiny fetch to its HTTP API
  const body = {
    From: { Email: 'noreply@inistnt.in', Name: 'Inistnt [DEV]' },
    To:   [{ Email: params.to }],
    Subject: params.subject,
    HTMLPart: params.html,
  };

  try {
    // Mailhog doesn't have a REST API — use nodemailer in dev if needed
    // For simplicity, just log it
    console.log('\n─────────────────────────────────────────────');
    console.log(`📧 EMAIL (DEV — would send via Resend in prod)`);
    console.log(`   To:      ${params.to}`);
    console.log(`   Subject: ${params.subject}`);
    console.log('─────────────────────────────────────────────\n');
  } catch { /* silent */ }
}

// ─── Template variable substitution ──────────────────────────────
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}

// ─── BASE HTML WRAPPER ────────────────────────────────────────────
function wrapEmail(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="hi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:20px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;max-width:600px;width:100%;">
        <tr>
          <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">⚡ Inistnt</h1>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">India's Trusted Home Services</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            ${content}
          </td>
        </tr>
        <tr>
          <td style="background:#f8f9fa;padding:20px 32px;border-top:1px solid #e9ecef;">
            <p style="margin:0;color:#6c757d;font-size:12px;text-align:center;">
              Inistnt Home Services • India<br>
              <a href="https://inistnt.com" style="color:#6366f1;text-decoration:none;">inistnt.com</a> |
              <a href="mailto:support@inistnt.com" style="color:#6366f1;text-decoration:none;">support@inistnt.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── CORE SEND FUNCTION ───────────────────────────────────────────
export async function sendEmail(params: {
  to:         string | string[];
  subject:    string;
  htmlBody:   string;
  variables?: Record<string, string>;
  replyTo?:   string;
  tags?:      Array<{ name: string; value: string }>;
}): Promise<boolean> {
  const html = params.variables
    ? renderTemplate(params.htmlBody, params.variables)
    : params.htmlBody;

  const isDev = !process.env.RESEND_API_KEY || process.env.NODE_ENV === 'development';

  if (isDev) {
    const toArr = Array.isArray(params.to) ? params.to : [params.to];
    for (const addr of toArr) {
      await sendViaMailhog({ to: addr, subject: params.subject, html });
    }
    return true;
  }

  try {
    const { data, error } = await getClient().emails.send({
      from:     FROM,
      to:       Array.isArray(params.to) ? params.to : [params.to],
      subject:  params.subject,
      html,
      reply_to: params.replyTo,
      tags:     params.tags,
    });

    if (error) {
      logger.error({ error, to: params.to, subject: params.subject }, '[Email] Resend error');
      return false;
    }

    logger.debug({ id: data?.id, to: params.to, subject: params.subject }, '[Email] Sent via Resend');
    return true;

  } catch (err: any) {
    logger.error({ err: err.message, to: params.to }, '[Email] Send failed');
    return false;
  }
}

// ─── BATCH SEND (for campaigns) ───────────────────────────────────
export async function sendBatchEmails(emails: Array<{
  to:      string;
  subject: string;
  html:    string;
}>): Promise<{ sent: number; failed: number }> {
  if (!process.env.RESEND_API_KEY || process.env.NODE_ENV === 'development') {
    for (const e of emails) await sendViaMailhog(e);
    return { sent: emails.length, failed: 0 };
  }

  let sent = 0, failed = 0;

  // Resend batch API — max 100 per call
  const chunks = [];
  for (let i = 0; i < emails.length; i += 100) chunks.push(emails.slice(i, i + 100));

  for (const chunk of chunks) {
    try {
      const { error } = await getClient().batch.send(
        chunk.map(e => ({ from: FROM, to: e.to, subject: e.subject, html: e.html }))
      );
      if (error) { failed += chunk.length; logger.error({ error }, '[Email] Batch error'); }
      else sent += chunk.length;
    } catch (err: any) {
      failed += chunk.length;
      logger.error({ err: err.message }, '[Email] Batch chunk failed');
    }
  }

  return { sent, failed };
}

// ═══════════════════════════════════════════════════════════════════
// TRANSACTIONAL EMAIL TEMPLATES
// ═══════════════════════════════════════════════════════════════════

function infoRow(label: string, value: string) {
  return `<tr><td style="padding:7px 0;color:#6c757d;font-size:14px;width:140px;">${label}</td><td style="padding:7px 0;color:#212529;font-size:14px;font-weight:500;">${value}</td></tr>`;
}

function badge(text: string, color = '#6366f1') {
  return `<span style="display:inline-block;background:${color};color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;">${text}</span>`;
}

function btn(text: string, href: string, color = '#6366f1') {
  return `<a href="${href}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;padding:11px 24px;border-radius:6px;font-weight:600;font-size:14px;">${text}</a>`;
}

// ─── 1. Superadmin / Staff Login OTP ─────────────────────────────
export async function sendLoginOtpEmail(params: {
  to: string; name: string; otp: string;
  ipAddress: string; location: string; device: string; expiresIn: string;
}) {
  const content = `
    <h2 style="margin:0 0 6px;color:#212529;font-size:20px;">Login OTP 🔐</h2>
    <p style="margin:0 0 24px;color:#6c757d;">Hi ${params.name}, aapke Inistnt Admin account ke liye login request aayi hai.</p>
    <div style="background:#f3f0ff;border-radius:10px;padding:24px;text-align:center;margin-bottom:24px;border:2px dashed #6366f1;">
      <p style="margin:0 0 6px;color:#6366f1;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Your OTP</p>
      <p style="margin:0;font-size:40px;font-weight:800;letter-spacing:10px;color:#212529;">${params.otp}</p>
      <p style="margin:8px 0 0;color:#6c757d;font-size:12px;">Valid for ${params.expiresIn}</p>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8f0;border-radius:8px;padding:16px;margin-bottom:20px;">
      <tr><td colspan="2" style="padding-bottom:8px;color:#e65100;font-size:13px;font-weight:600;">Login Details</td></tr>
      ${infoRow('IP Address', params.ipAddress)}
      ${infoRow('Location', params.location)}
      ${infoRow('Device', params.device)}
    </table>
    <p style="margin:0;color:#dc3545;font-size:13px;">⚠️ Agar aapne login request nahi ki toh OTP kisi ko mat dein aur account secure karein.</p>`;
  return sendEmail({ to: params.to, subject: 'Inistnt Admin Login OTP', htmlBody: wrapEmail('Login OTP', content) });
}

// ─── 2. Login Alert (new device) ─────────────────────────────────
export async function sendLoginAlertEmail(params: {
  to: string; name: string; ipAddress: string;
  location: string; device: string; loginTime: string;
}) {
  const content = `
    <h2 style="margin:0 0 6px;color:#212529;font-size:20px;">New Login Detected 🔔</h2>
    <p style="margin:0 0 24px;color:#6c757d;">Hi ${params.name}, aapke admin account mein naya login hua hai.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:20px;">
      ${infoRow('Time', params.loginTime)}
      ${infoRow('IP Address', params.ipAddress)}
      ${infoRow('Location', params.location)}
      ${infoRow('Device', params.device)}
    </table>
    <p style="margin:0 0 16px;color:#495057;font-size:14px;">Agar yeh aap nahi the toh turant apna password change karein.</p>
    ${btn('Account Secure Karein', 'https://admin.inistnt.com/security', '#dc3545')}`;
  return sendEmail({ to: params.to, subject: 'New Login Alert — Inistnt Admin', htmlBody: wrapEmail('Login Alert', content) });
}

// ─── 3. Account Locked ───────────────────────────────────────────
export async function sendAccountLockedEmail(params: {
  to: string; name: string; reason: string; unlocksAt?: string;
}) {
  const content = `
    <h2 style="margin:0 0 6px;color:#dc3545;font-size:20px;">Account Locked 🔒</h2>
    <p style="margin:0 0 24px;color:#6c757d;">Hi ${params.name}, aapka Inistnt Admin account temporarily lock ho gaya hai.</p>
    <div style="background:#fff5f5;border-radius:8px;padding:16px;margin-bottom:20px;border-left:4px solid #dc3545;">
      <p style="margin:0 0 6px;font-weight:600;color:#212529;">Reason:</p>
      <p style="margin:0;color:#495057;">${params.reason}</p>
      ${params.unlocksAt ? `<p style="margin:8px 0 0;color:#6c757d;font-size:13px;">Unlocks at: ${params.unlocksAt}</p>` : ''}
    </div>
    <p style="margin:0;color:#6c757d;font-size:13px;">Kisi problem ke liye superadmin@inistnt.com pe contact karein.</p>`;
  return sendEmail({ to: params.to, subject: 'Account Locked — Inistnt Admin', htmlBody: wrapEmail('Account Locked', content) });
}

// ─── 4. Staff Welcome / Invite ───────────────────────────────────
export async function sendAdminWelcomeEmail(params: {
  to: string; name: string; role: string;
  tempPassword: string; loginUrl: string; invitedBy: string;
}) {
  const content = `
    <h2 style="margin:0 0 6px;color:#212529;font-size:20px;">Welcome to Inistnt Admin! 🎉</h2>
    <p style="margin:0 0 24px;color:#6c757d;">Hi ${params.name}, ${params.invitedBy} ne aapko Inistnt Admin panel mein invite kiya hai.</p>
    <div style="background:#f0fdf4;border-radius:8px;padding:20px;margin-bottom:24px;border-left:4px solid #22c55e;">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${infoRow('Role', badge(params.role, '#6366f1'))}
        ${infoRow('Login Email', params.to)}
        ${infoRow('Temp Password', `<code style="background:#e9ecef;padding:2px 8px;border-radius:4px;font-size:15px;">${params.tempPassword}</code>`)}
      </table>
    </div>
    <p style="margin:0 0 16px;color:#dc3545;font-size:13px;font-weight:600;">⚠️ Login hone ke baad turant password change karein.</p>
    ${btn('Admin Panel Kholo →', params.loginUrl)}`;
  return sendEmail({ to: params.to, subject: `Welcome to Inistnt Admin — ${params.role}`, htmlBody: wrapEmail('Welcome', content) });
}

// ─── 5. Booking Confirmed (to user) ──────────────────────────────
export async function sendBookingConfirmedEmail(params: {
  to: string; userName: string; bookingNumber: string;
  serviceName: string; scheduledFor: string; address: string;
  amount: string; bookingId: string;
}) {
  const content = `
    <h2 style="margin:0 0 6px;color:#212529;font-size:20px;">Booking Confirmed! 🎉</h2>
    <p style="margin:0 0 24px;color:#6c757d;">Hi ${params.userName}, aapki booking confirm ho gayi!</p>
    <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin-bottom:24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${infoRow('Booking #', `<strong>${params.bookingNumber}</strong>`)}
        ${infoRow('Service', params.serviceName)}
        ${infoRow('Date & Time', params.scheduledFor)}
        ${infoRow('Address', params.address)}
        ${infoRow('Amount', `<strong style="color:#198754;">₹${params.amount}</strong>`)}
        ${infoRow('Status', badge('Confirmed', '#198754'))}
      </table>
    </div>
    ${btn('Booking Track Karein →', `https://app.inistnt.com/bookings/${params.bookingId}`)}`;
  return sendEmail({ to: params.to, subject: `Booking Confirmed #${params.bookingNumber} — Inistnt`, htmlBody: wrapEmail('Booking Confirmed', content) });
}

// ─── 6. Worker Assigned ───────────────────────────────────────────
export async function sendWorkerAssignedEmail(params: {
  to: string; userName: string; bookingNumber: string;
  workerName: string; workerMobile: string; workerRating: string; eta: string;
}) {
  const content = `
    <h2 style="margin:0 0 6px;color:#212529;font-size:20px;">Worker On The Way! 🛵</h2>
    <p style="margin:0 0 24px;color:#6c757d;">Hi ${params.userName}, aapki booking ke liye worker assign ho gaya hai.</p>
    <div style="background:#e8f5e9;border-radius:8px;padding:20px;margin-bottom:24px;border-left:4px solid #4caf50;">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${infoRow('Worker', `<strong>${params.workerName}</strong>`)}
        ${infoRow('Mobile', params.workerMobile)}
        ${infoRow('Rating', `⭐ ${params.workerRating}`)}
        ${infoRow('ETA', `<strong style="color:#e65100;">${params.eta}</strong>`)}
      </table>
    </div>
    <p style="margin:0;color:#6c757d;font-size:13px;">Booking #${params.bookingNumber}</p>`;
  return sendEmail({ to: params.to, subject: `${params.workerName} aa raha hai | Inistnt`, htmlBody: wrapEmail('Worker Assigned', content) });
}

// ─── 7. Booking Completed ─────────────────────────────────────────
export async function sendBookingCompletedEmail(params: {
  to: string; userName: string; bookingNumber: string;
  serviceName: string; amount: string; workerName: string; reviewUrl: string;
}) {
  const content = `
    <h2 style="margin:0 0 6px;color:#212529;font-size:20px;">Service Complete! ✅</h2>
    <p style="margin:0 0 24px;color:#6c757d;">Hi ${params.userName}, aapki service complete ho gayi!</p>
    <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin-bottom:24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${infoRow('Booking #', params.bookingNumber)}
        ${infoRow('Service', params.serviceName)}
        ${infoRow('Worker', params.workerName)}
        ${infoRow('Amount', `<strong style="color:#198754;">₹${params.amount}</strong>`)}
        ${infoRow('Status', badge('Completed', '#198754'))}
      </table>
    </div>
    ${btn('⭐ Review Dein', params.reviewUrl, '#ffc107')}`;
  return sendEmail({ to: params.to, subject: `Service Complete — Booking #${params.bookingNumber} | Inistnt`, htmlBody: wrapEmail('Service Complete', content) });
}

// ─── 8. Welcome User ─────────────────────────────────────────────
export async function sendWelcomeEmail(params: { to: string; name: string }) {
  const content = `
    <h2 style="margin:0 0 6px;color:#212529;font-size:20px;">Inistnt mein Swagat! 🎊</h2>
    <p style="margin:0 0 24px;color:#6c757d;">Hi ${params.name}, account ready hai!</p>
    <div style="background:linear-gradient(135deg,#f3e5f5,#e8eaf6);border-radius:8px;padding:24px;margin-bottom:24px;text-align:center;">
      <p style="font-size:32px;margin:0;">🏠</p>
      <p style="margin:8px 0 4px;color:#4a148c;font-size:18px;font-weight:700;">Ghar baitha service mangwaiye</p>
      <p style="margin:0;color:#6a1b9a;font-size:13px;">Plumbing • Cleaning • Electrician • AC & more</p>
    </div>
    ${btn('Pehli Booking Karein →', 'https://app.inistnt.com/services')}`;
  return sendEmail({ to: params.to, subject: `Inistnt mein swagat hai, ${params.name}! 🏠`, htmlBody: wrapEmail('Welcome', content) });
}

// ─── 9. Dispute Raised ───────────────────────────────────────────
export async function sendDisputeRaisedEmail(params: {
  to: string; userName: string; bookingNumber: string;
  disputeReason: string; ticketId: string;
}) {
  const content = `
    <h2 style="margin:0 0 6px;color:#212529;font-size:20px;">Complaint Receive Ho Gayi 📋</h2>
    <p style="margin:0 0 24px;color:#6c757d;">Hi ${params.userName}, hum jaldi resolve karenge.</p>
    <div style="background:#fff3cd;border-radius:8px;padding:20px;margin-bottom:20px;border-left:4px solid #ffc107;">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${infoRow('Booking #', params.bookingNumber)}
        ${infoRow('Ticket', `<strong>${params.ticketId}</strong>`)}
        ${infoRow('Issue', params.disputeReason)}
        ${infoRow('Status', badge('Under Review', '#fd7e14'))}
      </table>
    </div>
    <p style="margin:0;color:#6c757d;font-size:13px;">24-48 ghante mein update milegi.</p>`;
  return sendEmail({ to: params.to, subject: `Complaint #${params.ticketId} | Inistnt`, htmlBody: wrapEmail('Complaint Received', content) });
}

// ─── 10. Payout Processed (to worker) ────────────────────────────
export async function sendPayoutProcessedEmail(params: {
  to: string; workerName: string; amount: string;
  utrNumber: string; method: string;
}) {
  const content = `
    <h2 style="margin:0 0 6px;color:#212529;font-size:20px;">Payout Ho Gaya! 💰</h2>
    <p style="margin:0 0 24px;color:#6c757d;">Hi ${params.workerName}, payment process ho gayi.</p>
    <div style="background:#e8f5e9;border-radius:8px;padding:20px;margin-bottom:20px;border-left:4px solid #4caf50;">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${infoRow('Amount', `<strong style="color:#198754;font-size:20px;">₹${params.amount}</strong>`)}
        ${infoRow('Method', badge(params.method.toUpperCase(), '#0d6efd'))}
        ${infoRow('UTR', `<code style="background:#f8f9fa;padding:2px 8px;border-radius:4px;">${params.utrNumber}</code>`)}
        ${infoRow('Status', badge('Processed', '#198754'))}
      </table>
    </div>
    <p style="margin:0;color:#6c757d;font-size:13px;">1-2 working days mein account mein aa jayega.</p>`;
  return sendEmail({ to: params.to, subject: `₹${params.amount} Payout Processed | Inistnt`, htmlBody: wrapEmail('Payout Processed', content) });
}
