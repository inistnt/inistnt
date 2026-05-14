// ═══════════════════════════════════════════════════════════════════
// INISTNT — SuperAdmin Auth Service
//
// SECURITY FEATURES:
//   1. 2-Step login: Email+Password → OTP email → JWT
//   2. Email OTP on EVERY login (6-digit, bcrypt hashed, 10 min TTL)
//   3. Login location email alert (IP geolocation via free ip-api.com)
//   4. Account lockout after 5 failed OTP attempts (30 min)
//   5. Suspicious login detection (new IP)
//   6. All login events logged in AdminLoginLog
//   7. Session management — remote revoke possible
//   8. Rate limiting in Redis
//   9. Password strength enforcement (12+ chars, upper+number+special)
// ═══════════════════════════════════════════════════════════════════

import bcrypt     from 'bcryptjs';
import nodemailer from 'nodemailer';
import { db }     from '../../infrastructure/database';
import { redis }  from '../../infrastructure/redis';
import { config } from '../../config';
import { tokenService } from '../auth/auth.service';
import { logger } from '../../config/logger';

// ─── Mail transporter ─────────────────────────────────────────────
let _mailer: nodemailer.Transporter | null = null;
function getMailer() {
  if (_mailer) return _mailer;
  _mailer = nodemailer.createTransport({
    host:   config.SMTP_HOST,
    port:   config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth:   config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
    tls:    { rejectUnauthorized: false },
  });
  return _mailer;
}

// ─── IP Geolocation (free — ip-api.com, no key needed) ───────────
interface GeoInfo {
  country: string; region: string; city: string;
  isp: string; lat: number; lon: number; query: string;
}

async function getGeoInfo(ip: string): Promise<GeoInfo | null> {
  if (['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip) || ip.startsWith('192.168') || ip.startsWith('10.')) {
    return { country: 'India (Local)', region: 'Dev Machine', city: 'Localhost', isp: 'Local', lat: 0, lon: 0, query: ip };
  }
  try {
    const res  = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city,isp,lat,lon,query`, { signal: AbortSignal.timeout(4000) });
    const data = await res.json() as any;
    if (data.status !== 'success') return null;
    return { country: data.country, region: data.regionName, city: data.city, isp: data.isp, lat: data.lat, lon: data.lon, query: data.query };
  } catch { return null; }
}

// ─── OTP + Redis keys ─────────────────────────────────────────────
const generateOtp   = () => String(Math.floor(100000 + Math.random() * 900000));
const rateLimitKey  = (email: string)   => `sa:rate:${email}`;
const otpCooldownKey = (email: string)  => `sa:otpcool:${email}`;

// ─── Email templates ──────────────────────────────────────────────
async function sendOtpEmail(to: string, name: string, otp: string, geo: GeoInfo | null) {
  const loc = geo ? `${geo.city}, ${geo.region}, ${geo.country} (IP: ${geo.query})` : 'Unknown';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f2f5;margin:0;padding:20px}
.wrap{max-width:520px;margin:auto}
.card{background:#fff;border-radius:16px;padding:40px;box-shadow:0 4px 32px rgba(0,0,0,.1)}
.logo{font-size:22px;font-weight:900;color:#FF5733;margin-bottom:4px}
.role{background:#fff0eb;color:#FF5733;border:1.5px solid #FF5733;border-radius:20px;padding:3px 14px;font-size:11px;font-weight:700;display:inline-block;margin-bottom:24px;letter-spacing:1px}
.otp-box{background:linear-gradient(135deg,#FF5733,#ff9a7a);border-radius:16px;padding:32px;text-align:center;margin:28px 0}
.otp-label{color:rgba(255,255,255,.85);font-size:11px;letter-spacing:3px;text-transform:uppercase;margin-bottom:12px}
.otp{color:#fff;font-size:48px;font-weight:900;letter-spacing:12px;font-variant-numeric:tabular-nums}
.otp-expire{color:rgba(255,255,255,.8);font-size:13px;margin-top:12px}
.loc-box{background:#f8fafc;border-left:4px solid #FF5733;border-radius:0 10px 10px 0;padding:16px 20px;margin:20px 0}
.loc-box h4{margin:0 0 8px;font-size:13px;color:#333;letter-spacing:.5px}
.loc-box p{margin:0;font-size:13px;color:#555;line-height:1.7}
.warn{background:#fff8e1;border:1px solid #ffc107;border-radius:10px;padding:14px 18px;font-size:13px;color:#856404;margin-top:20px}
.footer{text-align:center;font-size:11px;color:#aaa;margin-top:28px}
</style></head><body><div class="wrap"><div class="card">
<div class="logo">⚡ INISTNT</div><br>
<div class="role">🔐 SUPER ADMIN ACCESS</div>
<h2 style="margin:0 0 6px;color:#111;font-size:22px">Login OTP</h2>
<p style="color:#666;font-size:14px;margin:0">Namaste <strong>${name}</strong>, aapke admin panel login ke liye:</p>
<div class="otp-box">
  <div class="otp-label">One-Time Password</div>
  <div class="otp">${otp}</div>
  <div class="otp-expire">⏳ Valid for 10 minutes only</div>
</div>
<div class="loc-box">
  <h4>📍 LOGIN ATTEMPT DETAILS</h4>
  <p><strong>Location:</strong> ${loc}<br>
  <strong>Time:</strong> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>
</div>
<div class="warn">⚠️ <strong>Aapne yeh request nahi kiya?</strong><br>
OTP kisi ke saath share mat karo. Apna password turant change karo aur team ko alert karo.</div>
<p style="font-size:12px;color:#aaa;margin-top:20px">Yeh OTP sirf ek baar use hoga. Inistnt team kabhi OTP nahi maangti.</p>
<div class="footer">Inistnt Admin System • Auto-generated • Do not reply</div>
</div></div></body></html>`;

  await getMailer().sendMail({
    from:    `"Inistnt Security" <${config.EMAIL_FROM}>`,
    to,
    subject: `🔐 ${otp} — Inistnt Admin Login OTP (10 min)`,
    html,
  });
}

async function sendLoginAlertEmail(to: string, name: string, geo: GeoInfo | null, isNewDevice: boolean) {
  const loc = geo ? `${geo.city}, ${geo.region}, ${geo.country}\nIP: ${geo.query} | ISP: ${geo.isp}` : 'Unknown';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f2f5;margin:0;padding:20px}
.card{background:#fff;border-radius:16px;max-width:480px;margin:auto;padding:40px;box-shadow:0 4px 32px rgba(0,0,0,.1)}
.icon{font-size:52px;text-align:center;margin-bottom:16px}
.row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #f3f3f3;font-size:14px}
.label{color:#888}.val{color:#111;font-weight:600;text-align:right;white-space:pre-line}
.alert-box{background:#fff3cd;border:1px solid #ffc107;border-radius:10px;padding:16px;font-size:13px;color:#856404;margin-top:20px}
.footer{text-align:center;font-size:11px;color:#aaa;margin-top:24px}
</style></head><body><div class="card">
<div class="icon">${isNewDevice ? '⚠️' : '✅'}</div>
<h2 style="text-align:center;margin:0 0 6px;color:#111">${isNewDevice ? 'New Location Login!' : 'Login Successful'}</h2>
<p style="text-align:center;color:#888;margin:0 0 24px;font-size:14px">Inistnt Admin Panel</p>
<div class="row"><span class="label">Admin</span><span class="val">${name}</span></div>
<div class="row"><span class="label">Time</span><span class="val">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</span></div>
<div class="row"><span class="label">Location</span><span class="val">${loc}</span></div>
${isNewDevice ? `<div class="alert-box">⚠️ <strong>Pehli baar is location/IP se login detect hua.</strong><br>Agar aap nahi the — <strong>security@inistnt.com</strong> pe immediately report karein.</div>` : ''}
<div class="footer">Inistnt Admin Security • ${new Date().getFullYear()}</div>
</div></body></html>`;

  await getMailer().sendMail({
    from:    `"Inistnt Security" <${config.EMAIL_FROM}>`,
    to,
    subject: isNewDevice
      ? `🚨 New Location Login — Inistnt Admin [${geo?.city ?? 'Unknown'}]`
      : `✅ Login Successful — Inistnt Admin Panel`,
    html,
  }).catch(err => logger.warn({ err: err.message }, '[SuperAdmin] Alert email failed'));
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTED SERVICE
// ═══════════════════════════════════════════════════════════════════

export const superAdminAuthService = {

  // STEP 1 — Email + Password → send OTP
  initiateLogin: async (email: string, password: string, ip: string, userAgent?: string) => {
    const rKey    = rateLimitKey(email);
    const attempts = parseInt(await redis.get(rKey) ?? '0');
    if (attempts >= 5) {
      throw { statusCode: 429, code: 'RATE_LIMITED', message: 'Bahut zyada attempts. 15 minute baad try karo.' };
    }

    const staff = await db.staff.findUnique({
      where:  { email: email.toLowerCase().trim() },
      select: { id: true, name: true, email: true, role: true, isActive: true,
                passwordHash: true, lockedUntil: true, loginCount: true },
    });

    if (staff?.lockedUntil && staff.lockedUntil > new Date()) {
      const mins = Math.ceil((staff.lockedUntil.getTime() - Date.now()) / 60000);
      throw { statusCode: 423, code: 'ACCOUNT_LOCKED', message: `Account ${mins} minute ke liye lock hai.` };
    }

    const valid = staff?.passwordHash ? await bcrypt.compare(password, staff.passwordHash) : false;
    if (!staff || !valid) {
      await redis.set(rKey, String(attempts + 1), 'EX', 900);
      if (staff) await db.adminLoginLog.create({ data: { staffId: staff.id, event: 'LOGIN_FAILED', ipAddress: ip, userAgent } });
      throw { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Email ya password galat hai.' };
    }
    if (!staff.isActive) throw { statusCode: 403, code: 'ACCOUNT_DISABLED', message: 'Account disabled hai.' };

    // OTP cooldown
    const coolKey = otpCooldownKey(email);
    if (await redis.get(coolKey)) {
      throw { statusCode: 429, code: 'OTP_COOLDOWN', message: 'OTP pehle se bheja gaya. 60 second baad try karo.' };
    }

    // Generate OTP
    const otp     = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);

    await db.staffLoginOtp.updateMany({ where: { staffId: staff.id, isUsed: false }, data: { isUsed: true } });
    await db.staffLoginOtp.create({
      data: { staffId: staff.id, otp: otpHash, purpose: 'LOGIN', expiresAt: new Date(Date.now() + 600_000), ipAddress: ip, userAgent },
    });

    await redis.set(coolKey, '1', 'EX', 60);
    await redis.set(rKey, String(attempts + 1), 'EX', 900);

    const geo = await getGeoInfo(ip);
    await sendOtpEmail(staff.email, staff.name, otp, geo);

    await db.adminLoginLog.create({
      data: { staffId: staff.id, event: 'OTP_SENT', ipAddress: ip, userAgent, country: geo?.country, region: geo?.region, city: geo?.city, isp: geo?.isp },
    });

    logger.info({ staffId: staff.id, ip }, '[SuperAdmin] OTP sent');

    return {
      message:   `OTP bheja gaya ${staff.email} pe. 10 minute valid.`,
      email:     staff.email,
      expiresIn: 600,
      ...(config.NODE_ENV === 'development' ? { _dev_otp: otp } : {}),
    };
  },

  // STEP 2 — OTP verify → JWT
  verifyOtp: async (email: string, otp: string, ip: string, userAgent?: string) => {
    const staff = await db.staff.findUnique({
      where:  { email: email.toLowerCase().trim() },
      select: {
        id: true, name: true, email: true, role: true, isActive: true,
        permissions: true, lockedUntil: true, loginCount: true, lastLoginIp: true,
        loginOtps: { where: { isUsed: false, purpose: 'LOGIN' }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!staff?.isActive) throw { statusCode: 401, code: 'INVALID', message: 'Staff nahi mila ya disabled hai.' };
    if (staff.lockedUntil && staff.lockedUntil > new Date()) throw { statusCode: 423, code: 'ACCOUNT_LOCKED', message: 'Account locked hai.' };

    const otpRecord = (staff as any).loginOtps[0];
    if (!otpRecord) throw { statusCode: 400, code: 'NO_OTP', message: 'OTP request nahi kiya ya expire ho gaya. Dobara login karo.' };
    if (otpRecord.expiresAt < new Date()) throw { statusCode: 400, code: 'OTP_EXPIRED', message: 'OTP expire ho gaya. Dobara try karo.' };
    if (otpRecord.attempts >= otpRecord.maxAttempts) throw { statusCode: 429, code: 'MAX_ATTEMPTS', message: 'Max attempts cross. Dobara login karo.' };

    const valid = await bcrypt.compare(otp, otpRecord.otp);
    if (!valid) {
      await db.staffLoginOtp.update({ where: { id: otpRecord.id }, data: { attempts: { increment: 1 } } });
      const rem = otpRecord.maxAttempts - otpRecord.attempts - 1;
      if (rem <= 0) {
        await db.staff.update({ where: { id: staff.id }, data: { lockedUntil: new Date(Date.now() + 1800_000) } });
        await db.adminLoginLog.create({ data: { staffId: staff.id, event: 'ACCOUNT_LOCKED', ipAddress: ip } });
        throw { statusCode: 423, code: 'ACCOUNT_LOCKED', message: '5 baar galat OTP. Account 30 minute lock.' };
      }
      await db.adminLoginLog.create({ data: { staffId: staff.id, event: 'OTP_FAILED', ipAddress: ip } });
      throw { statusCode: 400, code: 'OTP_INVALID', message: `OTP galat. ${rem} attempts bache.` };
    }

    await db.staffLoginOtp.update({ where: { id: otpRecord.id }, data: { isUsed: true } });

    const { accessToken, refreshToken } = tokenService.generatePair(
      staff.id, 'staff',
      { role: staff.role, permissions: staff.permissions ?? {} },
    );

    await db.staffSession.create({
      data: { staffId: staff.id, refreshToken, ipAddress: ip, userAgent, expiresAt: tokenService.refreshExpiryDate() },
    });

    const geo = await getGeoInfo(ip);
    const isNewDevice = staff.lastLoginIp !== ip;

    await db.staff.update({
      where: { id: staff.id },
      data:  { lastLoginAt: new Date(), lastLoginIp: ip, loginCount: { increment: 1 }, failedLoginAttempts: 0, lockedUntil: null },
    });

    await db.adminLoginLog.create({
      data: {
        staffId: staff.id, event: 'LOGIN_SUCCESS', ipAddress: ip, userAgent,
        country: geo?.country, region: geo?.region, city: geo?.city, isp: geo?.isp,
        isNewDevice, isSuspicious: isNewDevice && (staff.loginCount ?? 0) > 3,
      },
    });

    sendLoginAlertEmail(staff.email, staff.name, geo, isNewDevice).catch(() => {});
    await redis.del(rateLimitKey(email));

    return {
      accessToken, refreshToken, expiresIn: 900,
      staff: { id: staff.id, name: staff.name, email: staff.email, role: staff.role, permissions: staff.permissions },
    };
  },

  // Resend OTP
  resendOtp: async (email: string, ip: string) => {
    if (await redis.get(otpCooldownKey(email))) {
      throw { statusCode: 429, code: 'OTP_COOLDOWN', message: '60 second baad try karo.' };
    }
    const staff = await db.staff.findUnique({ where: { email: email.toLowerCase() }, select: { id: true, name: true, email: true, isActive: true } });
    if (!staff?.isActive) throw { statusCode: 404, message: 'Staff nahi mila.' };

    const otp = generateOtp();
    await db.staffLoginOtp.updateMany({ where: { staffId: staff.id, isUsed: false }, data: { isUsed: true } });
    await db.staffLoginOtp.create({ data: { staffId: staff.id, otp: await bcrypt.hash(otp, 10), purpose: 'LOGIN', expiresAt: new Date(Date.now() + 600_000), ipAddress: ip } });
    await redis.set(otpCooldownKey(email), '1', 'EX', 60);
    await sendOtpEmail(staff.email, staff.name, otp, await getGeoInfo(ip));

    return { message: 'OTP dobara bheja gaya.', ...(config.NODE_ENV === 'development' ? { _dev_otp: otp } : {}) };
  },

  // Sessions
  getSessions:      async (staffId: string) =>
    db.staffSession.findMany({ where: { staffId, isActive: true, expiresAt: { gt: new Date() } }, select: { id: true, ipAddress: true, userAgent: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),

  revokeSession:    async (sessionId: string, requesterId: string) => {
    const s = await db.staffSession.findUnique({ where: { id: sessionId } });
    if (!s) throw { statusCode: 404, message: 'Session nahi mili.' };
    const req = await db.staff.findUnique({ where: { id: requesterId }, select: { role: true } });
    if (s.staffId !== requesterId && req?.role !== 'SUPER_ADMIN') throw { statusCode: 403, message: 'Access denied.' };
    await db.staffSession.update({ where: { id: sessionId }, data: { isActive: false, revokedAt: new Date() } });
    return { message: 'Session revoke ho gayi.' };
  },

  revokeAllSessions: async (targetId: string) => {
    await db.staffSession.updateMany({ where: { staffId: targetId, isActive: true }, data: { isActive: false, revokedAt: new Date() } });
    return { message: 'Saari sessions terminate.' };
  },

  getLoginHistory:  async (staffId: string, limit = 30) =>
    db.adminLoginLog.findMany({ where: { staffId }, orderBy: { createdAt: 'desc' }, take: limit }),

  // Change password
  changePassword: async (staffId: string, current: string, newPass: string) => {
    const staff = await db.staff.findUnique({ where: { id: staffId }, select: { passwordHash: true, email: true, name: true } });
    if (!staff) throw { statusCode: 404, message: 'Staff nahi mila.' };
    if (!await bcrypt.compare(current, staff.passwordHash ?? '')) throw { statusCode: 401, code: 'WRONG_PASSWORD', message: 'Current password galat hai.' };

    const checks = [
      [newPass.length < 12,              'Password 12+ characters ka hona chahiye.'],
      [!/[A-Z]/.test(newPass),           'Ek capital letter zaroor ho.'],
      [!/[0-9]/.test(newPass),           'Ek number zaroor ho.'],
      [!/[!@#$%^&*()_+]/.test(newPass),  'Ek special character (!@#$%&*) zaroor ho.'],
    ] as [boolean, string][];

    for (const [fail, msg] of checks) {
      if (fail) throw { statusCode: 400, code: 'WEAK_PASSWORD', message: msg };
    }

    await db.staff.update({ where: { id: staffId }, data: { passwordHash: await bcrypt.hash(newPass, 12) } });
    await db.staffSession.updateMany({ where: { staffId, isActive: true }, data: { isActive: false, revokedAt: new Date() } });
    await getMailer().sendMail({
      from: `"Inistnt Security" <${config.EMAIL_FROM}>`,
      to:   staff.email,
      subject: '🔑 Password Changed — Inistnt Admin',
      html: `<p>Namaste ${staff.name},<br>Aapka admin password change ho gaya — ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST.<br><strong>Agar aap nahi the: security@inistnt.com pe immediately contact karein.</strong></p>`,
    }).catch(() => {});

    return { message: 'Password change ho gaya. Sabhi sessions terminate kar diye. Dobara login karein.' };
  },
};
