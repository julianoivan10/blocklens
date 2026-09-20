import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db';
import { hashPassword } from '@/server/auth/password';
import { createSession } from '@/server/auth/session';
import { createVerificationToken } from '@/server/auth/tokens';
import { getEmailService } from '@/services/email';
import { registerSchema } from '@/lib/validations';
import type { ApiResponse, SessionUser } from '@/types';
import { logServerError } from '@/server/log';

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<SessionUser>>> {
  try {
    const body = await request.json();
    const result = registerSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const { name, email, password } = result.data;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    // Create user
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { name, email, passwordHash },
    });

    // Create verification token and send email
    const token = await createVerificationToken(user.id);
    const emailService = getEmailService();
    await emailService.sendVerificationEmail(email, token);

    // Create session
    await createSession(user.id);

    return NextResponse.json(
      {
        success: true,
        data: { id: user.id, email: user.email, name: user.name },
        message: 'Account created. Please check your email to verify your account.',
      },
      { status: 201 }
    );
  } catch (error) {
    logServerError('auth:register', error);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
