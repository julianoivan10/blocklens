import 'server-only';

import type { EmailMessage, EmailResult, EmailService } from './interface';
import { ConsoleEmailService, DisabledEmailService } from './console';
import { ResendEmailService } from './resend';
import { passwordResetEmail, verificationEmail } from './templates';
import { siteConfig } from '@/config/site';

let emailServiceInstance: EmailService | null = null;

/**
 * The sender address. `RESEND_FROM_EMAIL` is the documented name;
 * `EMAIL_FROM` is still read so an environment configured before the
 * rename keeps working. The domain must be verified in Resend — the
 * sandbox sender `onboarding@resend.dev` only delivers to the Resend
 * account owner's own address.
 */
export function emailSender(): string {
  return (
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    'BlockLens <onboarding@resend.dev>'
  );
}

export function getEmailService(): EmailService {
  if (emailServiceInstance) return emailServiceInstance;

  const key = process.env.RESEND_API_KEY?.trim();
  if (key) {
    emailServiceInstance = new ResendEmailService(key, emailSender());
  } else if (process.env.NODE_ENV === 'production') {
    emailServiceInstance = new DisabledEmailService();
  } else {
    emailServiceInstance = new ConsoleEmailService();
  }

  return emailServiceInstance;
}

/** Test seam: lets a test substitute a fake transport. */
export function setEmailServiceForTesting(service: EmailService | null): void {
  emailServiceInstance = service;
}

/**
 * Sends and logs. Every failure is logged server-side with the provider's
 * own reason; the caller decides what, if anything, the user is told.
 */
export async function deliver(scope: string, message: EmailMessage): Promise<EmailResult> {
  const service = getEmailService();
  const result = await service.send(message);

  if (!result.success) {
    console.error(
      `[email:${scope}] delivery failed provider=${service.provider} systemic=${result.systemic} ` +
        `from=${emailSender().replace(/^.*</, '').replace(/>$/, '')} reason=${result.error}`
    );
    if (result.systemic) {
      console.error(
        `[email:${scope}] hint: check RESEND_API_KEY and that the RESEND_FROM_EMAIL domain is ` +
          'verified at https://resend.com/domains. The sandbox sender onboarding@resend.dev ' +
          'can only deliver to the Resend account owner.'
      );
    }
  }
  return result;
}

export function sendVerificationEmail(to: string, token: string): Promise<EmailResult> {
  return deliver(
    'verification',
    verificationEmail(to, `${siteConfig.url}/verify-email?token=${token}`)
  );
}

export function sendPasswordResetEmail(to: string, token: string): Promise<EmailResult> {
  return deliver(
    'password-reset',
    passwordResetEmail(to, `${siteConfig.url}/reset-password?token=${token}`)
  );
}

export type { EmailService, EmailResult, EmailMessage } from './interface';
