import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { destroySession, verifySession } from '@/server/auth/session';
import type { ApiResponse } from '@/types';

const confirmSchema = z.object({
  /** The account's own email, retyped — the confirmation gesture. */
  confirmEmail: z.string().trim().min(1, 'Type your email address to confirm'),
});

/**
 * Permanently deletes the signed-in account.
 *
 * Sessions, watchlists, research history and saved research all cascade
 * from the User row in the schema, so removing the user removes
 * everything belonging to it.
 */
export async function DELETE(request: NextRequest): Promise<NextResponse<ApiResponse<null>>> {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const parsed = confirmSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }

    // Compare case-insensitively; the address is the confirmation, not
    // a credential.
    if (parsed.data.confirmEmail.toLowerCase() !== session.email.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'That does not match the email on this account' },
        { status: 400 }
      );
    }

    await destroySession();
    await prisma.user.delete({ where: { id: session.id } });

    return NextResponse.json({ success: true, data: null, message: 'Account deleted' });
  } catch (error) {
    console.error('Account deletion failed:', error);
    return NextResponse.json(
      { success: false, error: 'Could not delete the account. Please try again.' },
      { status: 500 }
    );
  }
}
