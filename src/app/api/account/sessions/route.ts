import { NextResponse } from 'next/server';
import { prisma } from '@/server/db';
import { destroySession, verifySession } from '@/server/auth/session';
import type { ApiResponse } from '@/types';

/**
 * Signs the account out of every device.
 *
 * Sessions are rows, so revoking them is a delete — this is the control
 * that makes the `Session` table meaningful to the person who owns it,
 * and the correct response to a password shared or a laptop lost.
 *
 * The current device's cookie is cleared last so the response still
 * carries the Set-Cookie that ends this session too.
 */
export async function DELETE(): Promise<NextResponse<ApiResponse<{ revoked: number }>>> {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { count } = await prisma.session.deleteMany({ where: { userId: session.id } });
    await destroySession();

    return NextResponse.json({
      success: true,
      data: { revoked: count },
      message: 'Signed out of all devices',
    });
  } catch (error) {
    console.error('Session revocation failed:', error);
    return NextResponse.json(
      { success: false, error: 'Could not revoke your sessions. Please try again.' },
      { status: 500 }
    );
  }
}
