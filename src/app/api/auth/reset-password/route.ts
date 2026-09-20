import { NextRequest, NextResponse } from 'next/server';
import { verifyResetToken, clearResetToken } from '@/server/auth/tokens';
import { hashPassword } from '@/server/auth/password';
import { prisma } from '@/server/db';
import { resetPasswordSchema } from '@/lib/validations';
import type { ApiResponse } from '@/types';
import { logServerError } from '@/server/log';

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const body = await request.json();
    const result = resetPasswordSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const { token, password } = result.data;

    const verifyResult = await verifyResetToken(token);
    if (!verifyResult.success || !verifyResult.userId) {
      return NextResponse.json(
        { success: false, error: verifyResult.error || 'Invalid or expired reset token' },
        { status: 400 }
      );
    }

    // Update password
    const passwordHash = await hashPassword(password);
    await prisma.user.update({
      where: { id: verifyResult.userId },
      data: { passwordHash },
    });

    // Clear reset token
    await clearResetToken(verifyResult.userId);

    // Invalidate all existing sessions
    await prisma.session.deleteMany({
      where: { userId: verifyResult.userId },
    });

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully. Please log in with your new password.',
    });
  } catch (error) {
    logServerError('auth:reset-password', error);
    return NextResponse.json(
      { success: false, error: 'Failed to reset password' },
      { status: 500 }
    );
  }
}
