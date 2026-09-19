import { NextResponse } from 'next/server';
import { verifySession } from '@/server/auth/session';
import type { ApiResponse, SessionUser } from '@/types';

export async function GET(): Promise<NextResponse<ApiResponse<SessionUser>>> {
  try {
    const user = await verifySession();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    console.error('Session error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to verify session' },
      { status: 500 }
    );
  }
}
