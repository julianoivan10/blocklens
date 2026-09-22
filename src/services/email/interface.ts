/**
 * The outcome of one delivery attempt.
 *
 * `error` is a short, operator-facing reason and is never shown to an
 * anonymous caller verbatim. `systemic` marks failures that will repeat
 * for every recipient — a missing key, an unverified sender domain, a
 * revoked key — as opposed to a single bad address.
 */
export type EmailResult =
  | { success: true; id?: string }
  | { success: false; error: string; systemic: boolean };

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailService {
  readonly provider: 'resend' | 'console' | 'disabled';
  send(message: EmailMessage): Promise<EmailResult>;
}
