import { NextResponse } from 'next/server';
import { prisma } from '@/server/db';
import { verifySession } from '@/server/auth/session';
import { createVerificationToken } from '@/server/auth/tokens';
import { sendVerificationEmail } from '@/services/email';
import { logServerError } from '@/server/log';
import type { ApiResponse } from '@/types';

/** One resend per minute per account, enforced from the token's own expiry. */
const RESEND_INTERVAL_MS = 60_000;
const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;

/**
 * Re-sends the verification email for the signed-in account. Unlike the
 * anonymous forgot-password flow, the caller already owns the account, so
 * a delivery failure is reported to them honestly.
 */
export async function POST(): Promise<NextResponse<ApiResponse>> {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { email: true, emailVerified: true, verificationTokenExpiry: true },
    });
    if (!user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (user.emailVerified) {
      return NextResponse.json({ success: true, message: 'Your email is already verified.' });
    }

    const issuedAt = user.verificationTokenExpiry
      ? user.verificationTokenExpiry.getTime() - TOKEN_LIFETIME_MS
      : 0;
    if (Date.now() - issuedAt < RESEND_INTERVAL_MS) {
      return NextResponse.json(
        { success: false, error: 'A verification email was sent moments ago. Try again in a minute.' },
        { status: 429 }
      );
    }

    const token = await createVerificationToken(session.id);
    const result = await sendVerificationEmail(user.email, token);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'We could not send the verification email right now. Please try again later.',
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, message: `Verification email sent to ${user.email}.` });
  } catch (error) {
    logServerError('auth:resend-verification', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
