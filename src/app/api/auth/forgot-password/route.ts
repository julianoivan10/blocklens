import { NextRequest, NextResponse } from 'next/server';
import { createResetToken } from '@/server/auth/tokens';
import { sendPasswordResetEmail } from '@/services/email';
import { forgotPasswordSchema } from '@/lib/validations';
import type { ApiResponse } from '@/types';
import { logServerError } from '@/server/log';

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const body = await request.json();
    const result = forgotPasswordSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const { email } = result.data;
    const token = await createResetToken(email);

    // The response is identical whether or not the account exists, so it
    // cannot be used to discover which emails are registered. A delivery
    // failure is therefore not surfaced here — deliver() logs it with the
    // provider's reason, where an operator sees it.
    if (token) {
      await sendPasswordResetEmail(email, token);
    }

    return NextResponse.json({
      success: true,
      message: 'If an account with that email exists, we sent a password reset link.',
    });
  } catch (error) {
    logServerError('auth:forgot-password', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
