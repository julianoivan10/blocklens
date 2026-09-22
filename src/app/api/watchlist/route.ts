import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifySession } from '@/server/auth/session';
import {
  addToWatchlist,
  getWatchlist,
  removeFromWatchlist,
  setWatchlistNote,
} from '@/server/data/watchlist';
import type { ApiResponse, WatchlistWithItems } from '@/types';

const mutateSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1, 'Symbol is required')
    .max(16, 'Symbol is too long')
    // Ticker shape only — this value is used as a lookup key.
    .regex(/^[A-Za-z0-9.-]+$/, 'Symbol contains unsupported characters'),
  name: z.string().trim().min(1).max(120),
});

export async function GET(): Promise<NextResponse<ApiResponse<WatchlistWithItems>>> {
  const user = await verifySession();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const watchlist = await getWatchlist(user.id);
    return NextResponse.json({ success: true, data: watchlist });
  } catch (error) {
    console.error('Watchlist read failed:', error);
    return NextResponse.json(
      { success: false, error: 'Could not load your watchlist' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<null>>> {
  const user = await verifySession();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const parsed = mutateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }

    await addToWatchlist(user.id, parsed.data.symbol, parsed.data.name);
    return NextResponse.json({ success: true, data: null, message: 'Added to watchlist' });
  } catch (error) {
    console.error('Watchlist add failed:', error);
    return NextResponse.json(
      { success: false, error: 'Could not update your watchlist' },
      { status: 500 }
    );
  }
}

const noteSchema = z.object({
  symbol: mutateSchema.shape.symbol,
  notes: z.string().trim().max(500, 'Notes are limited to 500 characters').nullable(),
});

/** Sets the private note on a watchlist row. Notes never leave the database. */
export async function PATCH(request: NextRequest): Promise<NextResponse<ApiResponse<null>>> {
  const user = await verifySession();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const parsed = noteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }
    const count = await setWatchlistNote(user.id, parsed.data.symbol, parsed.data.notes || null);
    if (count === 0) {
      return NextResponse.json({ success: false, error: 'Not on your watchlist' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: null, message: 'Note saved' });
  } catch (error) {
    console.error('Watchlist note failed:', error);
    return NextResponse.json({ success: false, error: 'Could not save the note' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse<ApiResponse<null>>> {
  const user = await verifySession();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const symbol = request.nextUrl.searchParams.get('symbol');
    const parsed = mutateSchema.shape.symbol.safeParse(symbol);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid symbol' },
        { status: 400 }
      );
    }

    await removeFromWatchlist(user.id, parsed.data);
    return NextResponse.json({ success: true, data: null, message: 'Removed from watchlist' });
  } catch (error) {
    console.error('Watchlist remove failed:', error);
    return NextResponse.json(
      { success: false, error: 'Could not update your watchlist' },
      { status: 500 }
    );
  }
}
