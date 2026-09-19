import 'server-only';

import type { EmailService } from './interface';
import { ConsoleEmailService } from './console';
import { ResendEmailService } from './resend';

let emailServiceInstance: EmailService | null = null;

export function getEmailService(): EmailService {
  if (emailServiceInstance) return emailServiceInstance;

  if (process.env.RESEND_API_KEY) {
    emailServiceInstance = new ResendEmailService();
  } else {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '⚠️  RESEND_API_KEY is not set. Emails will be logged to console. Set RESEND_API_KEY for production email delivery.'
      );
    }
    emailServiceInstance = new ConsoleEmailService();
  }

  return emailServiceInstance;
}

export type { EmailService } from './interface';
