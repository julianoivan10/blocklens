export interface EmailService {
  sendVerificationEmail(to: string, token: string): Promise<{ success: boolean; error?: string }>;
  sendPasswordResetEmail(to: string, token: string): Promise<{ success: boolean; error?: string }>;
}
