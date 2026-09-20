import { NextResponse } from 'next/server';
import { destroySession } from '@/server/auth/session';
import type { ApiResponse } from '@/types';
import { logServerError } from '@/server/log';

export async function POST(): Promise<NextResponse<ApiResponse>> {
  try {
    await destroySession();
    return NextResponse.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    logServerError('auth:logout', error);
    return NextResponse.json(
      { success: false, error: 'Failed to log out' },
      { status: 500 }
    );
  }
}
