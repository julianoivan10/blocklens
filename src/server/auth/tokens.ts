import { prisma } from '@/server/db';
import { VERIFICATION_TOKEN_EXPIRY_HOURS, RESET_TOKEN_EXPIRY_HOURS } from '@/lib/constants';

export function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createVerificationToken(userId: string): Promise<string> {
  const token = generateToken();
  await prisma.user.update({
    where: { id: userId },
    data: {
      verificationToken: token,
      verificationTokenExpiry: new Date(
        Date.now() + VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000
      ),
    },
  });
  return token;
}

export async function verifyEmailToken(token: string): Promise<{ success: boolean; error?: string }> {
  // The expiry window is enforced here. Previously the constant was
  // declared but never applied, so a verification link stayed valid
  // forever.
  const user = await prisma.user.findFirst({
    where: {
      verificationToken: token,
      verificationTokenExpiry: { gt: new Date() },
    },
  });

  if (!user) {
    return { success: false, error: 'This verification link is invalid or has expired' };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: new Date(),
      verificationToken: null,
      verificationTokenExpiry: null,
    },
  });

  return { success: true };
}

export async function createResetToken(email: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;

  const token = generateToken();
  const expiry = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetToken: token,
      resetTokenExpiry: expiry,
    },
  });

  return token;
}

export async function verifyResetToken(token: string): Promise<{ success: boolean; userId?: string; error?: string }> {
  const user = await prisma.user.findFirst({
    where: {
      resetToken: token,
      resetTokenExpiry: { gt: new Date() },
    },
  });

  if (!user) {
    return { success: false, error: 'Invalid or expired reset token' };
  }

  return { success: true, userId: user.id };
}

export async function clearResetToken(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      resetToken: null,
      resetTokenExpiry: null,
    },
  });
}
