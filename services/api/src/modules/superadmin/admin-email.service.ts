// ═══════════════════════════════════════════════════════════════════
// INISTNT — Admin Email Service
// Security emails: OTP, login alerts, account lock, staff invite
// Provider: Resend (via src/infrastructure/email.service.ts)
// ═══════════════════════════════════════════════════════════════════

// All functions now live in email.service.ts — re-export them
export {
  sendLoginOtpEmail,
  sendLoginAlertEmail,
  sendAccountLockedEmail,
  sendAdminWelcomeEmail,
} from '../../infrastructure/email.service';
