import { NextRequest, NextResponse } from 'next/server';
import { verifyEmailToken } from '@/server/auth/tokens';
import type { ApiResponse } from '@/types';

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const { token } = await request.json();
    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Verification token is required' },
        { status: 400 }
      );
    }

    const result = await verifyEmailToken(token);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    console.error('Email verification error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to verify email' },
      { status: 500 }
    );
  }
}
