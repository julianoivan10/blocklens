import type { EmailMessage } from './interface';

/**
 * Transactional templates. Plain-text bodies are always included: some
 * clients and most spam filters penalise HTML-only mail.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(title: string, body: string, action?: { href: string; label: string }): string {
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:40px 20px;color:#1f2328;">
  <h1 style="font-size:22px;font-weight:600;margin:0 0 16px;">${escapeHtml(title)}</h1>
  ${body}
  ${
    action
      ? `<a href="${escapeHtml(action.href)}" style="display:inline-block;background:#1f2328;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-size:14px;font-weight:500;margin-top:8px;">${escapeHtml(action.label)}</a>`
      : ''
  }
  <p style="color:#6e7781;font-size:12px;margin-top:32px;">BlockLens is a research tool. Nothing in this email is investment advice.</p>
</div>`;
}

const p = (text: string) =>
  `<p style="color:#424a53;font-size:14px;line-height:1.6;margin:0 0 16px;">${escapeHtml(text)}</p>`;

export function verificationEmail(to: string, url: string): EmailMessage {
  return {
    to,
    subject: 'Verify your BlockLens account',
    html: layout(
      'Verify your email',
      p('Confirm this address to activate your BlockLens account.') +
        p('This link expires in 24 hours. If you did not create an account, ignore this email.'),
      { href: url, label: 'Verify email' }
    ),
    text: `Verify your BlockLens account:\n${url}\n\nThis link expires in 24 hours. If you did not create an account, ignore this email.`,
  };
}

export function passwordResetEmail(to: string, url: string): EmailMessage {
  return {
    to,
    subject: 'Reset your BlockLens password',
    html: layout(
      'Reset your password',
      p('Someone asked to reset the password for this BlockLens account.') +
        p('This link expires in 1 hour. If it was not you, ignore this email — nothing changes.'),
      { href: url, label: 'Reset password' }
    ),
    text: `Reset your BlockLens password:\n${url}\n\nThis link expires in 1 hour. If it was not you, ignore this email.`,
  };
}

export function alertEmail(
  to: string,
  alerts: Array<{ title: string; detail: string }>,
  url: string
): EmailMessage {
  const subject =
    alerts.length === 1 ? `BlockLens alert: ${alerts[0].title}` : `BlockLens: ${alerts.length} alerts`;
  return {
    to,
    subject,
    html: layout(
      alerts.length === 1 ? 'An alert fired' : `${alerts.length} alerts fired`,
      alerts.map((a) => p(`${a.title} — ${a.detail}`)).join(''),
      { href: url, label: 'Open alerts' }
    ),
    text: `${alerts.map((a) => `• ${a.title} — ${a.detail}`).join('\n')}\n\n${url}`,
  };
}
