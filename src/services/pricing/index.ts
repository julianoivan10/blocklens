import 'server-only';

import { unstable_cache } from 'next/cache';
import { fetchJson, ProviderError } from '../http';
import { CoinGeckoMarketService, type MarketQuote } from '../market/coingecko';
import { providerKeys } from '../providers';
import { ALCHEMY_NETWORKS } from '../chains/networks';
import { parseAssetKey } from '@/lib/portfolio/chains';
import { DAY_MS, utcDay } from '@/lib/portfolio/timeline';

/**
 * MarketDataProvider — the one door through which portfolio code gets a
 * price.
 *
 * Routing is by asset key, not by caller:
 *   sym:<TICKER>              → CoinGecko (current, and ≤365 days of daily
 *                               closes); Alchemy Prices by symbol for
 *                               older history, which CoinGecko's demo
 *                               tier does not serve.
 *   erc20:<CHAIN>:<address>,
 *   spl:<mint>                → Alchemy Prices by contract address.
 *
 * Rules:
 *  - A missing price is absent from the result. Never zero, never guessed.
 *  - A quote older than STALE_AFTER_MS is returned with `stale: true` so
 *    the UI can say so; it is not silently treated as current.
 *  - A provider failure (rate limit included) costs the prices that
 *    provider would have supplied, and is logged; the rest still return.
 */

export interface PriceQuote extends MarketQuote {
  stale: boolean;
}

export type DailySeries = Array<{ time: number; value: number }>;

export const STALE_AFTER_MS = 60 * 60 * 1000;

const ALCHEMY_PRICES = 'https://api.g.alchemy.com/prices/v1';

interface AlchemyByAddress {
  data: Array<{
    network: string;
    address: string;
    prices: Array<{ currency: string; value: string; lastUpdatedAt: string }>;
    error?: { message: string } | null;
  }>;
}

interface AlchemyHistorical {
  data?: Array<{ value: string; timestamp: string }>;
  error?: { message: string };
}

let coingecko: CoinGeckoMarketService | null = null;
function cg() {
  coingecko ??= new CoinGeckoMarketService(providerKeys.coingecko);
  return coingecko;
}

function alchemyKey(): string | null {
  return providerKeys.alchemy ?? null;
}

function withStale(q: MarketQuote): PriceQuote {
  const age = Date.now() - Date.parse(q.asOf);
  return { ...q, stale: Number.isFinite(age) && age > STALE_AFTER_MS };
}

/* ---------- current prices ---------- */

async function alchemyCurrent(keys: string[]): Promise<Map<string, MarketQuote>> {
  const out = new Map<string, MarketQuote>();
  const apiKey = alchemyKey();
  if (!apiKey || keys.length === 0) return out;

  const addresses = keys
    .map((key) => {
      const parsed = parseAssetKey(key);
      if (parsed?.kind === 'erc20') return { key, network: ALCHEMY_NETWORKS[parsed.chain].prices, address: parsed.contract };
      if (parsed?.kind === 'spl') return { key, network: ALCHEMY_NETWORKS.SOLANA.prices, address: parsed.mint };
      return null;
    })
    .filter((x): x is { key: string; network: string; address: string } => x !== null);

  // The endpoint accepts at most 25 addresses per request; up to four
  // requests run at once, so a wallet full of airdrops does not serialise
  // dozens of round trips.
  const batches: Array<typeof addresses> = [];
  for (let i = 0; i < addresses.length; i += 25) batches.push(addresses.slice(i, i + 25));

  const fetchBatch = (batch: typeof addresses) =>
    fetchJson<AlchemyByAddress>(`${ALCHEMY_PRICES}/${apiKey}/tokens/by-address`, {
      provider: 'alchemy-prices',
      revalidate: 0,
      method: 'POST',
      body: { addresses: batch.map(({ network, address }) => ({ network, address })) },
    }).then((res) => ({ batch, res }));

  const results: Array<{ batch: typeof addresses; res: AlchemyByAddress }> = [];
  for (let i = 0; i < batches.length; i += 4) {
    results.push(...(await Promise.all(batches.slice(i, i + 4).map(fetchBatch))));
  }

  for (const { batch, res } of results) {
    for (const row of res.data ?? []) {
      const usd = row.prices?.find((p) => p.currency === 'usd');
      const price = usd ? Number(usd.value) : NaN;
      if (!usd || !Number.isFinite(price)) continue;
      const match = batch.find(
        (b) => b.network === row.network && b.address.toLowerCase() === row.address.toLowerCase()
      );
      if (match) {
        out.set(match.key, {
          price,
          change24hPct: null,
          marketCap: null,
          volume24h: null,
          asOf: usd.lastUpdatedAt,
          source: 'Alchemy Prices',
        });
      }
    }
  }
  return out;
}

const cachedAlchemyCurrent = unstable_cache(
  async (keys: string[]) => Object.fromEntries(await alchemyCurrent(keys)),
  ['pricing:alchemy-current'],
  { revalidate: 60 }
);

/**
 * Current quotes for a set of asset keys. Symbol pools carry market cap,
 * volume and 24h change; contract pools carry price only (that is all the
 * provider reports).
 */
export async function getCurrentPrices(assetKeys: readonly string[]): Promise<Map<string, PriceQuote>> {
  const unique = [...new Set(assetKeys)];
  const symbols = unique.filter((k) => k.startsWith('sym:'));
  const contracts = unique.filter((k) => !k.startsWith('sym:')).sort();
  const result = new Map<string, PriceQuote>();

  const [symbolQuotes, contractQuotes] = await Promise.all([
    symbols.length
      ? cg()
          .getQuotes(symbols.map((k) => k.slice(4)))
          .catch((error) => {
            console.error(`[pricing] CoinGecko quotes unavailable: ${(error as Error).message}`);
            return new Map<string, MarketQuote>();
          })
      : new Map<string, MarketQuote>(),
    contracts.length
      ? cachedAlchemyCurrent(contracts).catch((error) => {
          console.error(`[pricing] Alchemy quotes unavailable: ${(error as Error).message}`);
          return {} as Record<string, MarketQuote>;
        })
      : ({} as Record<string, MarketQuote>),
  ]);

  for (const key of symbols) {
    const q = symbolQuotes.get(key.slice(4));
    if (q) result.set(key, withStale(q));
  }
  for (const [key, q] of Object.entries(contractQuotes)) result.set(key, withStale(q));
  return result;
}

/* ---------- historical daily closes ---------- */

/** One 365-day Alchemy window, aligned so windows are reusable cache keys. */
async function alchemyWindow(assetKey: string, windowStart: number): Promise<DailySeries> {
  const apiKey = alchemyKey();
  if (!apiKey) return [];
  const parsed = parseAssetKey(assetKey);
  if (!parsed) return [];

  const end = Math.min(windowStart + 364 * DAY_MS, utcDay(Date.now()));
  const body: Record<string, unknown> = {
    startTime: new Date(windowStart).toISOString(),
    endTime: new Date(end).toISOString(),
    interval: '1d',
  };
  if (parsed.kind === 'symbol') body.symbol = parsed.symbol;
  else if (parsed.kind === 'erc20') Object.assign(body, { network: ALCHEMY_NETWORKS[parsed.chain].prices, address: parsed.contract });
  else Object.assign(body, { network: ALCHEMY_NETWORKS.SOLANA.prices, address: parsed.mint });

  const res = await fetchJson<AlchemyHistorical>(`${ALCHEMY_PRICES}/${apiKey}/tokens/historical`, {
    provider: 'alchemy-prices',
    revalidate: 0,
    method: 'POST',
    body,
    timeoutMs: 12_000,
  }).catch((error: ProviderError) => {
    // "not found" means the provider has no history for this asset:
    // that is an empty series, not a failure.
    if (error.status === 404 || /not found/i.test(error.message)) return { data: [] } as AlchemyHistorical;
    throw error;
  });

  return (res.data ?? [])
    .map((p) => ({ time: Math.floor(Date.parse(p.timestamp) / 1000), value: Number(p.value) }))
    .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value) && p.value > 0);
}

const cachedAlchemyWindow = unstable_cache(alchemyWindow, ['pricing:alchemy-window'], {
  // Closed windows never change; the open one refreshes daily.
  revalidate: 86_400,
});

const WINDOW_EPOCH = Date.UTC(2015, 0, 1);
const WINDOW_MS = 365 * DAY_MS;

/**
 * Daily closes for one asset over [fromMs, toMs], oldest first. Recent
 * symbol history comes from CoinGecko (same source as the rest of the
 * app); anything older, and all contract history, from Alchemy.
 */
export async function getDailyHistory(assetKey: string, fromMs: number, toMs = Date.now()): Promise<DailySeries> {
  const from = utcDay(fromMs);
  const to = utcDay(toMs);
  const points = new Map<number, number>();

  const cgHorizon = utcDay(Date.now()) - 364 * DAY_MS;
  let alchemyUntil = to;

  if (assetKey.startsWith('sym:') && to >= cgHorizon) {
    try {
      const days = Math.min(365, Math.ceil((Date.now() - Math.max(from, cgHorizon)) / DAY_MS) + 1);
      const series = await cg().getPriceSeries(assetKey.slice(4), days, true);
      for (const p of series) points.set(utcDay(p.time * 1000) / 1000, p.value);
      if (series.length > 0) alchemyUntil = cgHorizon - DAY_MS;
    } catch (error) {
      console.error(`[pricing] CoinGecko history for ${assetKey} unavailable: ${(error as Error).message}`);
    }
  }

  if (from <= alchemyUntil && alchemyKey()) {
    const firstWindow = WINDOW_EPOCH + Math.floor((from - WINDOW_EPOCH) / WINDOW_MS) * WINDOW_MS;
    for (let start = firstWindow; start <= alchemyUntil; start += WINDOW_MS) {
      try {
        for (const p of await cachedAlchemyWindow(assetKey, start)) {
          const t = utcDay(p.time * 1000) / 1000;
          if (!points.has(t)) points.set(t, p.value);
        }
      } catch (error) {
        console.error(`[pricing] Alchemy history for ${assetKey} unavailable: ${(error as Error).message}`);
        break;
      }
    }
  }

  return [...points.entries()]
    .filter(([t]) => t * 1000 >= from - DAY_MS && t * 1000 <= to + DAY_MS)
    .sort((a, b) => a[0] - b[0])
    .map(([time, value]) => ({ time, value }));
}

export async function getDailyHistories(
  assetKeys: readonly string[],
  fromMs: number,
  toMs = Date.now()
): Promise<Map<string, DailySeries>> {
  const out = new Map<string, DailySeries>();
  // Bounded concurrency keeps CoinGecko's per-minute limit in reach.
  const queue = [...new Set(assetKeys)];
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const key = queue.shift()!;
      out.set(key, await getDailyHistory(key, fromMs, toMs));
    }
  });
  await Promise.all(workers);
  return out;
}
