import 'server-only';

import { Resend } from 'resend';
import type { EmailService } from './interface';
import { siteConfig } from '@/config/site';

export class ResendEmailService implements EmailService {
  private client: Resend;
  private from: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }
    this.client = new Resend(apiKey);
    this.from = process.env.EMAIL_FROM || 'noreply@blocklens.app';
  }

  async sendVerificationEmail(to: string, token: string): Promise<{ success: boolean; error?: string }> {
    try {
      const verifyUrl = `${siteConfig.url}/verify-email?token=${token}`;
      await this.client.emails.send({
        from: this.from,
        to,
        subject: 'Verify your BlockLens account',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
            <h1 style="color: #e8e8ed; font-size: 24px; font-weight: 600; margin-bottom: 16px;">Verify your email</h1>
            <p style="color: #8888a0; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">Click the button below to verify your email address and activate your BlockLens account.</p>
            <a href="${verifyUrl}" style="display: inline-block; background-color: #3b82f6; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 500;">Verify Email</a>
            <p style="color: #555568; font-size: 12px; margin-top: 32px;">If you didn't create a BlockLens account, you can safely ignore this email.</p>
            <p style="color: #555568; font-size: 12px;">This link expires in 24 hours.</p>
          </div>
        `,
      });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send email';
      return { success: false, error: message };
    }
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<{ success: boolean; error?: string }> {
    try {
      const resetUrl = `${siteConfig.url}/reset-password?token=${token}`;
      await this.client.emails.send({
        from: this.from,
        to,
        subject: 'Reset your BlockLens password',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
            <h1 style="color: #e8e8ed; font-size: 24px; font-weight: 600; margin-bottom: 16px;">Reset your password</h1>
            <p style="color: #8888a0; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">Click the button below to reset your BlockLens password.</p>
            <a href="${resetUrl}" style="display: inline-block; background-color: #3b82f6; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 500;">Reset Password</a>
            <p style="color: #555568; font-size: 12px; margin-top: 32px;">If you didn't request a password reset, you can safely ignore this email.</p>
            <p style="color: #555568; font-size: 12px;">This link expires in 1 hour.</p>
          </div>
        `,
      });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send email';
      return { success: false, error: message };
    }
  }
}
