// ═══════════════════════════════════════════════════════════════════
// INISTNT — Email Template Seeds
//
// Ye file seed.ts mein import karke run karo:
//   import { seedEmailTemplates } from './email-templates.seed';
//   await seedEmailTemplates();
//
// Ya seedha run karo:
//   npx tsx prisma/email-templates.seed.ts
// ═══════════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const templates = [
  {
    slug:      'booking_confirmed',
    nameEn:    'Booking Confirmed',
    nameHi:    'बुकिंग कन्फर्म',
    subject:   'Booking Confirmed #{{bookingNumber}} — Inistnt',
    variables: ['userName', 'bookingNumber', 'serviceName', 'scheduledFor', 'address', 'amount'],
    bodyHtml:  `<h2>Booking Confirm Ho Gayi! 🎉</h2>
<p>Hi {{userName}}, aapki booking confirm ho gayi hai.</p>
<table style="width:100%;background:#f8f9fa;padding:16px;border-radius:8px;">
  <tr><td style="color:#6c757d;padding:6px 0;width:140px;">Booking #</td><td><strong>{{bookingNumber}}</strong></td></tr>
  <tr><td style="color:#6c757d;padding:6px 0;">Service</td><td>{{serviceName}}</td></tr>
  <tr><td style="color:#6c757d;padding:6px 0;">Date</td><td>{{scheduledFor}}</td></tr>
  <tr><td style="color:#6c757d;padding:6px 0;">Address</td><td>{{address}}</td></tr>
  <tr><td style="color:#6c757d;padding:6px 0;">Amount</td><td><strong style="color:#198754;">₹{{amount}}</strong></td></tr>
</table>`,
  },
  {
    slug:      'worker_assigned',
    nameEn:    'Worker Assigned',
    nameHi:    'वर्कर असाइन',
    subject:   '{{workerName}} aa raha hai | Booking #{{bookingNumber}} — Inistnt',
    variables: ['userName', 'bookingNumber', 'workerName', 'workerMobile', 'workerRating', 'eta'],
    bodyHtml:  `<h2>Worker On The Way! 🛵</h2>
<p>Hi {{userName}}, aapki booking ke liye worker assign ho gaya hai.</p>
<div style="background:#e8f5e9;padding:16px;border-radius:8px;border-left:4px solid #4caf50;">
  <p><strong>Worker:</strong> {{workerName}}</p>
  <p><strong>Mobile:</strong> {{workerMobile}}</p>
  <p><strong>Rating:</strong> ⭐ {{workerRating}}</p>
  <p><strong>ETA:</strong> {{eta}}</p>
</div>`,
  },
  {
    slug:      'booking_completed',
    nameEn:    'Booking Completed',
    nameHi:    'बुकिंग पूरी',
    subject:   'Service Complete — Booking #{{bookingNumber}} | Inistnt',
    variables: ['userName', 'bookingNumber', 'serviceName', 'workerName', 'amount', 'reviewUrl'],
    bodyHtml:  `<h2>Service Complete! ✅</h2>
<p>Hi {{userName}}, aapki service complete ho gayi!</p>
<table style="width:100%;background:#f8f9fa;padding:16px;border-radius:8px;">
  <tr><td style="color:#6c757d;width:140px;">Booking #</td><td>{{bookingNumber}}</td></tr>
  <tr><td style="color:#6c757d;">Service</td><td>{{serviceName}}</td></tr>
  <tr><td style="color:#6c757d;">Worker</td><td>{{workerName}}</td></tr>
  <tr><td style="color:#6c757d;">Amount</td><td><strong style="color:#198754;">₹{{amount}}</strong></td></tr>
</table>
<br>
<a href="{{reviewUrl}}" style="background:#ffc107;color:#212529;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">⭐ Review Dein</a>`,
  },
  {
    slug:      'welcome_user',
    nameEn:    'Welcome New User',
    nameHi:    'नए यूज़र का स्वागत',
    subject:   'Inistnt mein aapka swagat hai, {{name}}! 🏠',
    variables: ['name', 'mobile'],
    bodyHtml:  `<h2>Inistnt mein swagat hai! 🎊</h2>
<p>Hi {{name}}, aapka account ready hai.</p>
<div style="background:linear-gradient(135deg,#f3e5f5,#e8eaf6);padding:20px;border-radius:8px;text-align:center;">
  <p style="font-size:24px;margin:0;">🏠</p>
  <p style="color:#4a148c;font-weight:700;margin:8px 0;">Ghar baitha service mangwaiye</p>
  <p style="color:#6a1b9a;font-size:13px;margin:0;">Plumbing • Cleaning • Electrician • AC & more</p>
</div>
<br>
<a href="https://app.inistnt.com/services" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Pehli Booking Karein →</a>`,
  },
  {
    slug:      'dispute_raised',
    nameEn:    'Dispute / Complaint Raised',
    nameHi:    'शिकायत दर्ज',
    subject:   'Complaint Registered — Ticket #{{ticketId}} | Inistnt',
    variables: ['userName', 'bookingNumber', 'disputeReason', 'ticketId'],
    bodyHtml:  `<h2>Complaint Receive Ho Gayi 📋</h2>
<p>Hi {{userName}}, hum aapki problem jaldi resolve karenge.</p>
<div style="background:#fff3cd;padding:16px;border-radius:8px;border-left:4px solid #ffc107;">
  <p><strong>Booking #:</strong> {{bookingNumber}}</p>
  <p><strong>Ticket ID:</strong> {{ticketId}}</p>
  <p><strong>Issue:</strong> {{disputeReason}}</p>
</div>
<p style="color:#6c757d;font-size:13px;">Hamari team 24-48 ghante mein aapko update degi.</p>`,
  },
  {
    slug:      'payout_processed',
    nameEn:    'Payout Processed (Worker)',
    nameHi:    'भुगतान प्रोसेस',
    subject:   '₹{{amount}} Payout Processed — UTR: {{utrNumber}} | Inistnt',
    variables: ['workerName', 'amount', 'utrNumber', 'method'],
    bodyHtml:  `<h2>Payout Ho Gaya! 💰</h2>
<p>Hi {{workerName}}, aapka payment process ho gaya hai.</p>
<div style="background:#e8f5e9;padding:16px;border-radius:8px;border-left:4px solid #4caf50;">
  <p><strong style="font-size:20px;color:#198754;">₹{{amount}}</strong></p>
  <p><strong>Method:</strong> {{method}}</p>
  <p><strong>UTR:</strong> <code>{{utrNumber}}</code></p>
</div>
<p style="color:#6c757d;font-size:13px;">Paise 1-2 working days mein aa jayenge.</p>`,
  },
];

export async function seedEmailTemplates() {
  console.log('Seeding email templates...');

  for (const template of templates) {
    await db.emailTemplate.upsert({
      where:  { slug: template.slug },
      create: { ...template, lastEditedAt: new Date() },
      update: { ...template, lastEditedAt: new Date() },
    });
    console.log(`  ✓ ${template.slug}`);
  }

  console.log(`Done — ${templates.length} templates seeded.`);
  await db.$disconnect();
}

// Run directly if called as script
if (require.main === module) {
  seedEmailTemplates().catch(console.error);
}
