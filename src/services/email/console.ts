import type { EmailService } from './interface';
import { siteConfig } from '@/config/site';

export class ConsoleEmailService implements EmailService {
  async sendVerificationEmail(to: string, token: string): Promise<{ success: boolean }> {
    const verifyUrl = `${siteConfig.url}/verify-email?token=${token}`;
    console.log('\n========================================');
    console.log('📧 EMAIL VERIFICATION (Dev Mode)');
    console.log('========================================');
    console.log(`To: ${to}`);
    console.log(`Verification URL: ${verifyUrl}`);
    console.log('========================================\n');
    return { success: true };
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<{ success: boolean }> {
    const resetUrl = `${siteConfig.url}/reset-password?token=${token}`;
    console.log('\n========================================');
    console.log('📧 PASSWORD RESET (Dev Mode)');
    console.log('========================================');
    console.log(`To: ${to}`);
    console.log(`Reset URL: ${resetUrl}`);
    console.log('========================================\n');
    return { success: true };
  }
}
