import 'server-only';

import { Resend } from 'resend';
import type { EmailMessage, EmailResult, EmailService } from './interface';

/**
 * Resend delivery.
 *
 * The Resend SDK does **not** throw on an API rejection: `emails.send`
 * resolves to `{ data: null, error }`. The previous adapter wrapped the
 * call in try/catch and returned success whenever nothing was thrown, so
 * every rejected message — including every one sent from the unverified
 * `blocklens.app` domain — was reported as delivered. The `error` field
 * is now the thing that decides the outcome.
 */

/** Resend error names that will recur for every message until config changes. */
const SYSTEMIC = new Set([
  'missing_api_key',
  'invalid_api_key',
  'restricted_api_key',
  'invalid_from_address',
  'validation_error',
]);

export class ResendEmailService implements EmailService {
  readonly provider = 'resend' as const;
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly from: string
  ) {
    this.client = new Resend(apiKey);
  }

  async send(message: EmailMessage): Promise<EmailResult> {
    try {
      const { data, error } = await this.client.emails.send({
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });

      if (error) {
        const name = (error as { name?: string }).name ?? 'unknown_error';
        const status = (error as { statusCode?: number | null }).statusCode ?? undefined;
        return {
          success: false,
          error: `resend ${name}${status ? ` (${status})` : ''}: ${error.message}`,
          // A 403 validation_error is how Resend reports an unverified
          // sender domain, or a sandbox sender used for someone other
          // than the account owner.
          systemic: SYSTEMIC.has(name) || status === 401 || status === 403,
        };
      }

      return { success: true, id: data?.id };
    } catch (error) {
      // Network failure, DNS, timeout — the SDK does throw for these.
      return {
        success: false,
        error: `resend transport: ${error instanceof Error ? error.message : String(error)}`,
        systemic: false,
      };
    }
  }
}
