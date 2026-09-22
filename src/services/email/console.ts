import type { EmailMessage, EmailResult, EmailService } from './interface';

/**
 * Development delivery: the message is written to the server console so
 * links can be followed locally without a Resend account.
 */
export class ConsoleEmailService implements EmailService {
  readonly provider = 'console' as const;

  async send(message: EmailMessage): Promise<EmailResult> {
    console.log('\n========================================');
    console.log(`📧 ${message.subject} (dev mode — not sent)`);
    console.log('========================================');
    console.log(`To: ${message.to}`);
    console.log(message.text);
    console.log('========================================\n');
    return { success: true };
  }
}

/**
 * Production without RESEND_API_KEY. Previously production silently
 * fell back to the console, reporting every verification and reset email
 * as sent while nobody received anything. It now fails, and says why.
 */
export class DisabledEmailService implements EmailService {
  readonly provider = 'disabled' as const;

  async send(): Promise<EmailResult> {
    return {
      success: false,
      error: 'RESEND_API_KEY is not set in this environment',
      systemic: true,
    };
  }
}
