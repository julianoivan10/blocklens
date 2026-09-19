import 'server-only';

import { prisma } from '@/server/db';
import { getTokenSnapshot } from './market';
import type { WatchlistItemWithData, WatchlistWithItems } from '@/types';

/**
 * Watchlist and research-history persistence.
 *
 * The Prisma models for these existed from the start but nothing read
 * or wrote them — the watchlist screen was a hardcoded empty state.
 * This is the missing layer, kept server-side and reached through the
 * API routes.
 */

async function getOrCreateDefaultWatchlist(userId: string) {
  const existing = await prisma.watchlist.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) return existing;

  return prisma.watchlist.create({ data: { userId, name: 'Default' } });
}

/** The user's watchlist, enriched with a current market reading. */
export async function getWatchlist(userId: string): Promise<WatchlistWithItems> {
  const watchlist = await getOrCreateDefaultWatchlist(userId);

  const items = await prisma.watchlistItem.findMany({
    where: { watchlistId: watchlist.id },
    orderBy: { addedAt: 'desc' },
  });

  // One market read per held asset, concurrently. A missing snapshot
  // leaves the row intact without its figures rather than failing the
  // whole list.
  const enriched: WatchlistItemWithData[] = await Promise.all(
    items.map(async (item) => {
      const snapshot = await getTokenSnapshot(item.symbol).catch(() => null);
      return {
        id: item.id,
        symbol: item.symbol,
        name: item.name,
        addedAt: item.addedAt,
        currentPrice: snapshot?.currentPrice,
        priceChangePercentage24h: snapshot?.priceChangePercentage24h,
        marketCap: snapshot?.marketCap,
      };
    })
  );

  return {
    id: watchlist.id,
    name: watchlist.name,
    items: enriched,
    createdAt: watchlist.createdAt,
    updatedAt: watchlist.updatedAt,
  };
}

export async function getWatchedSymbols(userId: string): Promise<string[]> {
  const watchlist = await prisma.watchlist.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { items: { select: { symbol: true } } },
  });
  return watchlist?.items.map((i) => i.symbol) ?? [];
}

export async function isWatched(userId: string, symbol: string): Promise<boolean> {
  const upper = symbol.toUpperCase();
  const count = await prisma.watchlistItem.count({
    where: { symbol: upper, watchlist: { userId } },
  });
  return count > 0;
}

export async function addToWatchlist(userId: string, symbol: string, name: string) {
  const watchlist = await getOrCreateDefaultWatchlist(userId);
  const upper = symbol.toUpperCase();

  // Idempotent: the unique index on (watchlistId, symbol) makes a
  // repeat add a no-op rather than an error.
  return prisma.watchlistItem.upsert({
    where: { watchlistId_symbol: { watchlistId: watchlist.id, symbol: upper } },
    create: { watchlistId: watchlist.id, symbol: upper, name },
    update: { name },
  });
}

export async function removeFromWatchlist(userId: string, symbol: string) {
  const upper = symbol.toUpperCase();
  await prisma.watchlistItem.deleteMany({
    where: { symbol: upper, watchlist: { userId } },
  });
}

/**
 * Records that the user looked at an asset. Fire-and-forget from the
 * research page: a failure here must never break the page, so callers
 * swallow the rejection.
 */
export async function recordResearchView(userId: string, symbol: string, name: string) {
  await prisma.researchHistory.create({
    data: { userId, symbol: symbol.toUpperCase(), name },
  });
}

/** The most recently viewed assets, one row per asset. */
export async function getRecentResearch(userId: string, limit = 6) {
  const rows = await prisma.researchHistory.findMany({
    where: { userId },
    orderBy: { viewedAt: 'desc' },
    take: limit * 4,
  });

  const seen = new Set<string>();
  const unique: typeof rows = [];
  for (const row of rows) {
    if (seen.has(row.symbol)) continue;
    seen.add(row.symbol);
    unique.push(row);
    if (unique.length === limit) break;
  }
  return unique;
}
