import 'server-only';

import { after } from 'next/server';
import { Prisma } from '@prisma/client';
import { fetchJson, ProviderError } from '../http';
import { CoinGeckoMarketService, type MarketQuote } from '../market/coingecko';
import { providerKeys } from '../providers';
import { ALCHEMY_NETWORKS } from '../chains/networks';
import { prisma } from '@/server/db';
import { parseAssetKey } from '@/lib/portfolio/chains';
import { DAY_MS, utcDay } from '@/lib/portfolio/timeline';

/**
 * MarketDataProvider — the one door through which portfolio code gets a
 * price.
 *
 * Routing is by asset key:
 *   sym:<TICKER>               → CoinGecko (quotes, and ≤365 days of daily
 *                                closes); Alchemy Prices by symbol for
 *                                older history.
 *   erc20:<CHAIN>:<address>,
 *   spl:<mint>                 → Alchemy Prices by contract address.
 *
 * Caching lives in Postgres (market_quotes, price_daily, price_coverage):
 * public market data only, shared by all users, durable across deploys
 * and serverless instances.
 *
 *  Quotes  — fresh for QUOTE_TTL. Up to SWR_WINDOW (1h) old, the cached quote is
 *            served and refreshed after the response. Older or never-seen
 *            quotes are fetched inline. "No price" answers are cached for
 *            NO_PRICE_TTL so airdropped spam is not re-asked on every view.
 *  History — a closed day never changes, so a stored close is never fetched
 *            again. price_coverage records every range already asked for,
 *            including ranges where the provider had nothing.
 *
 * Rules that have not changed:
 *  - A missing price is absent from the result. Never zero, never guessed.
 *  - A quote older than STALE_AFTER_MS carries `stale: true`.
 *  - A provider failure costs only what that provider would have supplied;
 *    a previously cached quote is served (marked by its age) instead.
 */

export interface PriceQuote extends MarketQuote {
  stale: boolean;
}

export type DailySeries = Array<{ time: number; value: number }>;

export const STALE_AFTER_MS = 60 * 60 * 1000;
const QUOTE_TTL_MS = 60 * 1000;
/**
 * Contract-token quotes come from Alchemy Prices, whose free plan allows
 * 300 requests per hour for the whole app (measured: the provider says so
 * in its 429). Five minutes keeps a busy portfolio well inside that.
 */
const CONTRACT_QUOTE_TTL_MS = 5 * 60 * 1000;
// Beyond QUOTE_TTL a quote is served (with its as-of time on the page) and
// refreshed after the response; beyond this window it is refreshed inline.
const SWR_WINDOW_MS = 60 * 60 * 1000;
const NO_PRICE_TTL_MS = 24 * 60 * 60 * 1000;

const ALCHEMY_PRICES = 'https://api.g.alchemy.com/prices/v1';
const COINGECKO_HISTORY_DAYS = 365;

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
}

let coingecko: CoinGeckoMarketService | null = null;
function cg() {
  coingecko ??= new CoinGeckoMarketService(providerKeys.coingecko);
  return coingecko;
}

function alchemyKey(): string | null {
  return providerKeys.alchemy ?? null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Alchemy's Prices API rate-limits bursts. Measured: three concurrent
 * history requests drew HTTP 429 on most calls, and parallel quote batches
 * did the same (a rejected batch used to drop every price in it). So every
 * Prices request in this process goes through one queue: one at a time,
 * with a short gap between them. A 429 or transient 5xx is still retried
 * with backoff, through the same queue.
 */
const ALCHEMY_GAP_MS = 250;

/**
 * When Alchemy reports the hourly quota spent, further calls cannot succeed
 * until it resets; waiting on retries would only stall pages. The breaker
 * fails every Prices call immediately for a cool-down, and callers fall back
 * to stored data (or report the price as not yet available).
 */
const QUOTA_COOLDOWN_MS = 10 * 60 * 1000;
let alchemyBlockedUntil = 0;

export function alchemyPricesAvailable(): boolean {
  return Boolean(alchemyKey()) && Date.now() >= alchemyBlockedUntil;
}

let alchemyGate: Promise<unknown> = Promise.resolve();
let alchemyLast = 0;

function throughAlchemyQueue<T>(task: () => Promise<T>): Promise<T> {
  const run = alchemyGate.then(async () => {
    const wait = alchemyLast + ALCHEMY_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await task();
    } finally {
      alchemyLast = Date.now();
    }
  });
  alchemyGate = run.catch(() => undefined);
  return run;
}

async function alchemyPost<T>(path: string, body: unknown): Promise<T> {
  const apiKey = alchemyKey();
  if (!apiKey) throw new ProviderError('alchemy-prices', 'no API key');
  for (let attempt = 0; ; attempt++) {
    if (Date.now() < alchemyBlockedUntil) {
      throw new ProviderError('alchemy-prices', 'hourly request quota exhausted; cooling down', 429);
    }
    try {
      return await throughAlchemyQueue(() =>
        fetchJson<T>(`${ALCHEMY_PRICES}/${apiKey}${path}`, {
          provider: 'alchemy-prices',
          revalidate: 0,
          method: 'POST',
          body,
          timeoutMs: 12_000,
        })
      );
    } catch (error) {
      if (error instanceof ProviderError && error.status === 429 && /exceeded its limit|per \d+ hours?|quota/i.test(error.message)) {
        alchemyBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
        console.error(`[pricing] Alchemy Prices quota exhausted; pausing calls for ${QUOTA_COOLDOWN_MS / 60_000} min`);
        throw error;
      }
      // A burst limit (429 without a quota message) or a transient 5xx.
      const transient = error instanceof ProviderError && (error.status === 429 || (error.status !== undefined && error.status >= 502 && error.status <= 504));
      if (transient && attempt < 2) {
        await sleep(600 * 2 ** attempt);
        continue;
      }
      throw error;
    }
  }
}

/* ───────────────────────── current quotes ───────────────────────── */

type Fetched = Map<string, MarketQuote | null>;

/** Fetches contract quotes batch by batch, handing each batch to `store` as it lands. */
async function fetchContractQuotes(keys: string[], store: (batch: Fetched) => Promise<void>): Promise<void> {
  const addresses = keys
    .map((key) => {
      const parsed = parseAssetKey(key);
      if (parsed?.kind === 'erc20') return { key, network: ALCHEMY_NETWORKS[parsed.chain].prices, address: parsed.contract };
      if (parsed?.kind === 'spl') return { key, network: ALCHEMY_NETWORKS.SOLANA.prices, address: parsed.mint };
      return null;
    })
    .filter((x): x is { key: string; network: string; address: string } => x !== null);

  // At most 25 addresses per request, one request at a time. A failed
  // batch leaves its keys unanswered (not "no price"), so they are retried
  // later rather than cached as missing.
  for (let i = 0; i < addresses.length; i += 25) {
    const batch = addresses.slice(i, i + 25);
    try {
      const res = await alchemyPost<AlchemyByAddress>('/tokens/by-address', {
        addresses: batch.map(({ network, address }) => ({ network, address })),
      });
      const out: Fetched = new Map(batch.map((b) => [b.key, null]));
      for (const row of res.data ?? []) {
        const usd = row.prices?.find((p) => p.currency === 'usd');
        const price = usd ? Number(usd.value) : NaN;
        const match = batch.find((b) => b.network === row.network && b.address.toLowerCase() === row.address.toLowerCase());
        if (!match || !usd || !Number.isFinite(price)) continue;
        out.set(match.key, {
          price,
          change24hPct: null,
          marketCap: null,
          volume24h: null,
          asOf: usd.lastUpdatedAt,
          source: 'Alchemy Prices',
        });
      }
      await store(out);
    } catch (error) {
      console.error(`[pricing] Alchemy quotes unavailable for ${batch.length} assets: ${(error as Error).message}`);
    }
  }
}

async function fetchSymbolQuotes(keys: string[]): Promise<Fetched> {
  const out: Fetched = new Map();
  if (!keys.length) return out;
  try {
    const quotes = await cg().getQuotes(keys.map((k) => k.slice(4)));
    for (const key of keys) out.set(key, quotes.get(key.slice(4)) ?? null);
  } catch (error) {
    console.error(`[pricing] CoinGecko quotes unavailable: ${(error as Error).message}`);
  }
  return out;
}

async function storeQuotes(fetched: Fetched): Promise<void> {
  if (!fetched.size) return;
  const now = new Date();
  const rows = [...fetched.entries()].map(([assetKey, q]) =>
    Prisma.sql`(${assetKey}, ${q ? String(q.price) : null}::numeric, ${q?.change24hPct ?? null}::float8, ${q?.marketCap ?? null}::float8, ${q?.volume24h ?? null}::float8, ${q?.name ?? null}, ${q?.source ?? 'none'}, ${q ? new Date(q.asOf) : now}::timestamp, ${now}::timestamp)`
  );
  // One statement per 500 rows: a per-row upsert would cost a round trip each.
  for (let i = 0; i < rows.length; i += 500) {
    await prisma.$executeRaw`
      INSERT INTO market_quotes ("assetKey", price, "change24hPct", "marketCap", "volume24h", name, source, "asOf", "fetchedAt")
      VALUES ${Prisma.join(rows.slice(i, i + 500))}
      ON CONFLICT ("assetKey") DO UPDATE SET
        price = EXCLUDED.price, "change24hPct" = EXCLUDED."change24hPct", "marketCap" = EXCLUDED."marketCap",
        "volume24h" = EXCLUDED."volume24h", name = COALESCE(EXCLUDED.name, market_quotes.name),
        source = EXCLUDED.source, "asOf" = EXCLUDED."asOf", "fetchedAt" = EXCLUDED."fetchedAt"`;
  }
}

/** In-flight provider fetches, so concurrent requests for a key share one call. */
const inflight = new Map<string, Promise<void>>();

async function refreshQuotes(keys: string[]): Promise<void> {
  const waiting = keys.filter((k) => inflight.has(k)).map((k) => inflight.get(k)!);
  const todo = keys.filter((k) => !inflight.has(k));
  if (todo.length) {
    const job = (async () => {
      // Each provider answer is stored as soon as it lands, so a caller
      // waiting on a time budget sees partial progress.
      await Promise.all([
        fetchSymbolQuotes(todo.filter((k) => k.startsWith('sym:'))).then(storeQuotes),
        fetchContractQuotes(todo.filter((k) => !k.startsWith('sym:')), storeQuotes),
      ]);
    })().finally(() => todo.forEach((k) => inflight.delete(k)));
    todo.forEach((k) => inflight.set(k, job));
    waiting.push(job);
  }
  await Promise.all(waiting);
}

/** Runs after the response is sent; falls back to fire-and-forget outside a request. */
function inBackground(task: () => Promise<void>) {
  const run = () => task().catch((error) => console.error(`[pricing] background refresh failed: ${(error as Error).message}`));
  try {
    after(run);
  } catch {
    void run();
  }
}

type QuoteRow = Awaited<ReturnType<typeof prisma.marketQuote.findMany>>[number];

function toQuote(row: QuoteRow): PriceQuote | null {
  if (row.price === null) return null;
  const age = Date.now() - row.asOf.getTime();
  return {
    price: row.price.toNumber(),
    change24hPct: row.change24hPct,
    marketCap: row.marketCap,
    volume24h: row.volume24h,
    asOf: row.asOf.toISOString(),
    source: row.source,
    name: row.name ?? undefined,
    stale: age > STALE_AFTER_MS,
  };
}

/**
 * Current quotes for a set of asset keys. Symbol pools carry market cap,
 * volume and 24h change; contract pools carry price only.
 */
export async function getCurrentPrices(assetKeys: readonly string[]): Promise<Map<string, PriceQuote>> {
  return (await readQuotes(assetKeys, Infinity)).quotes;
}

/**
 * As `getCurrentPrices`, but waits at most `budgetMs` for quotes that have
 * never been fetched. Whatever has not arrived by then keeps loading after
 * the response, and is returned in `pending` so the caller can say so —
 * those assets are absent from `quotes`, never priced at a guess.
 *
 * Only a first view of assets nobody has priced before (in practice a
 * first deploy, or a wallet full of fresh airdrops) ever reaches the
 * budget: wallet sync prices every asset it imports.
 */
export async function getCurrentPricesWithin(
  assetKeys: readonly string[],
  budgetMs: number
): Promise<{ quotes: Map<string, PriceQuote>; pending: string[] }> {
  return readQuotes(assetKeys, budgetMs);
}

async function readQuotes(
  assetKeys: readonly string[],
  budgetMs: number
): Promise<{ quotes: Map<string, PriceQuote>; pending: string[] }> {
  const keys = [...new Set(assetKeys)];
  if (!keys.length) return { quotes: new Map(), pending: [] };

  const read = () => prisma.marketQuote.findMany({ where: { assetKey: { in: keys } } });
  let rows = await read();
  const now = Date.now();
  const byKey = new Map(rows.map((r) => [r.assetKey, r]));

  const inline: string[] = [];
  const background: string[] = [];
  for (const key of keys) {
    const row = byKey.get(key);
    if (!row) {
      inline.push(key);
      continue;
    }
    const age = now - row.fetchedAt.getTime();
    const ttl = row.price === null ? NO_PRICE_TTL_MS : key.startsWith('sym:') ? QUOTE_TTL_MS : CONTRACT_QUOTE_TTL_MS;
    if (age <= ttl) continue;
    // "No price" answers are never worth blocking a page for.
    if (row.price === null || age <= ttl + SWR_WINDOW_MS) background.push(key);
    else inline.push(key);
  }

  let pending: string[] = [];
  if (inline.length) {
    const refresh = refreshQuotes(inline);
    if (Number.isFinite(budgetMs)) {
      const done = await Promise.race([refresh.then(() => true), sleep(budgetMs).then(() => false)]);
      // Keep the unfinished fetch alive past the response.
      if (!done) inBackground(() => refresh);
    } else {
      await refresh;
    }
    rows = await read();
    const answered = new Set(rows.map((r) => r.assetKey));
    pending = inline.filter((k) => !answered.has(k));
  }
  if (background.length) inBackground(() => refreshQuotes(background));

  const quotes = new Map<string, PriceQuote>();
  for (const row of rows) {
    const quote = toQuote(row);
    if (quote) quotes.set(row.assetKey, quote);
  }
  return { quotes, pending };
}

/* ───────────────────────── daily history ───────────────────────── */

const WINDOW_DAYS = 365;

async function alchemyHistory(assetKey: string, fromDay: number, toDay: number): Promise<DailySeries> {
  const parsed = parseAssetKey(assetKey);
  if (!parsed || !alchemyKey()) return [];
  const out: DailySeries = [];
  for (let start = fromDay; start <= toDay; start += WINDOW_DAYS * DAY_MS) {
    const end = Math.min(start + (WINDOW_DAYS - 1) * DAY_MS, toDay);
    const body: Record<string, unknown> = {
      startTime: new Date(start).toISOString(),
      endTime: new Date(end).toISOString(),
      interval: '1d',
    };
    if (parsed.kind === 'symbol') body.symbol = parsed.symbol;
    else if (parsed.kind === 'erc20') Object.assign(body, { network: ALCHEMY_NETWORKS[parsed.chain].prices, address: parsed.contract });
    else Object.assign(body, { network: ALCHEMY_NETWORKS.SOLANA.prices, address: parsed.mint });

    const res = await alchemyPost<AlchemyHistorical>('/tokens/historical', body).catch((error: ProviderError) => {
      // "Not found" means the provider has no history: an empty series.
      if (error.status === 404 || /not found/i.test(error.message)) return { data: [] } as AlchemyHistorical;
      throw error;
    });
    for (const p of res.data ?? []) {
      const time = Math.floor(Date.parse(p.timestamp) / 1000);
      const value = Number(p.value);
      if (Number.isFinite(time) && Number.isFinite(value) && value > 0) out.push({ time, value });
    }
  }
  return out;
}

/**
 * Provider closes for [fromDay, toDay] (UTC midnights, inclusive). Symbol
 * assets use CoinGecko inside its 365-day window — the same source as the
 * rest of the app — and Alchemy before it.
 */
async function providerHistory(assetKey: string, fromDay: number, toDay: number): Promise<{ series: DailySeries; source: string }> {
  const today = utcDay(Date.now());
  const cgHorizon = today - (COINGECKO_HISTORY_DAYS - 1) * DAY_MS;
  const series: DailySeries = [];
  let source = 'Alchemy Prices';

  let alchemyTo = toDay;
  if (assetKey.startsWith('sym:') && toDay >= cgHorizon) {
    try {
      const days = Math.min(COINGECKO_HISTORY_DAYS, Math.round((Date.now() - Math.max(fromDay, cgHorizon)) / DAY_MS) + 1);
      const points = await cg().getPriceSeries(assetKey.slice(4), days, true);
      if (points.length) {
        series.push(...points);
        source = 'CoinGecko';
        alchemyTo = cgHorizon - DAY_MS;
      }
    } catch (error) {
      console.error(`[pricing] CoinGecko history for ${assetKey} unavailable: ${(error as Error).message}`);
    }
  }
  if (fromDay <= alchemyTo) series.push(...(await alchemyHistory(assetKey, fromDay, alchemyTo)));
  return { series, source };
}

/** How often the not-yet-published recent edge (usually today) is re-asked. */
const RECENT_EDGE_RECHECK_MS = 60 * 60 * 1000;

/** Days not yet covered for one asset: before the stored range and after it. */
function gaps(
  coverage: { fromDay: Date; toDay: Date; checkedAt: Date } | undefined,
  from: number,
  to: number
): Array<[number, number]> {
  if (!coverage) return [[from, to]];
  const cFrom = coverage.fromDay.getTime();
  const cTo = coverage.toDay.getTime();
  const out: Array<[number, number]> = [];
  if (from < cFrom) out.push([from, Math.min(to, cFrom - DAY_MS)]);
  // A close that was not yet published when last asked is not re-asked on
  // every request — the live quote covers today in the meantime.
  const recentlyAsked = Date.now() - coverage.checkedAt.getTime() < RECENT_EDGE_RECHECK_MS;
  if (to > cTo && !(recentlyAsked && to - cTo <= DAY_MS)) out.push([Math.max(from, cTo + DAY_MS), to]);
  return out;
}

const historyInflight = new Map<string, Promise<void>>();

async function fillHistory(assetKey: string, ranges: Array<[number, number]>, coverage?: { fromDay: Date; toDay: Date }) {
  let lo = coverage?.fromDay.getTime() ?? Infinity;
  let hi = coverage?.toDay.getTime() ?? -Infinity;
  const today = utcDay(Date.now());

  for (const [from, to] of ranges) {
    const { series, source } = await providerHistory(assetKey, from, to);
    // Only true UTC-midnight points, up to today's midnight: those never
    // change. The provider's "now" point is live data and is not stored.
    const closes = series.filter((p) => p.time * 1000 === utcDay(p.time * 1000) && p.time * 1000 <= today && p.time * 1000 >= from && p.time * 1000 <= to);
    if (closes.length) {
      await prisma.priceDaily.createMany({
        data: closes.map((p) => ({ assetKey, day: new Date(p.time * 1000), close: new Prisma.Decimal(p.value.toPrecision(15)), source })),
        skipDuplicates: true,
      });
    }
    lo = Math.min(lo, from);
    // Coverage of the recent edge extends only as far as a close was
    // actually published, so today's close is asked for again later.
    const lastClose = closes.length ? Math.max(...closes.map((p) => p.time * 1000)) : null;
    hi = Math.max(hi, to < today ? to : (lastClose ?? to - DAY_MS));
  }

  if (Number.isFinite(lo) && Number.isFinite(hi) && hi >= lo) {
    await prisma.priceCoverage.upsert({
      where: { assetKey },
      create: { assetKey, fromDay: new Date(lo), toDay: new Date(hi), checkedAt: new Date() },
      update: { fromDay: new Date(lo), toDay: new Date(hi), checkedAt: new Date() },
    });
  }
}

/**
 * Daily closes for many assets over [fromMs, toMs], oldest first, plus the
 * current quote as a final live point when the range reaches today.
 * One database read for coverage, provider calls only for uncovered
 * days, one database read for the closes.
 */
export async function getDailyHistories(
  assetKeys: readonly string[],
  fromMs: number,
  toMs = Date.now()
): Promise<Map<string, DailySeries>> {
  const keys = [...new Set(assetKeys)];
  const out = new Map<string, DailySeries>(keys.map((k) => [k, []]));
  if (!keys.length) return out;

  const today = utcDay(Date.now());
  const from = utcDay(fromMs);
  const to = Math.min(utcDay(toMs), today);

  const coverage = new Map(
    (await prisma.priceCoverage.findMany({ where: { assetKey: { in: keys } } })).map((c) => [c.assetKey, c])
  );

  // Uncovered ranges, fetched with bounded concurrency so CoinGecko's
  // per-minute limit stays in reach. Concurrent callers share a fetch.
  const queue = keys
    .map((k) => ({ key: k, ranges: gaps(coverage.get(k), from, to) }))
    .filter((j) => j.ranges.length);
  const workers = Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const job = queue.shift()!;
      let pending = historyInflight.get(job.key);
      if (!pending) {
        pending = fillHistory(job.key, job.ranges, coverage.get(job.key))
          .catch((error) => console.error(`[pricing] history for ${job.key} unavailable: ${(error as Error).message}`))
          .finally(() => historyInflight.delete(job.key));
        historyInflight.set(job.key, pending);
      }
      await pending;
    }
  });
  await Promise.all(workers);

  const rows = await prisma.priceDaily.findMany({
    where: { assetKey: { in: keys }, day: { gte: new Date(from - DAY_MS), lte: new Date(to + DAY_MS) } },
    select: { assetKey: true, day: true, close: true },
    orderBy: [{ assetKey: 'asc' }, { day: 'asc' }],
  });
  for (const r of rows) out.get(r.assetKey)!.push({ time: r.day.getTime() / 1000, value: r.close.toNumber() });

  // The live point: when the range includes today, the current quote is
  // the latest price, exactly as the provider's own series ends with it.
  if (utcDay(toMs) >= today) {
    const quotes = await getCurrentPrices(keys);
    for (const [key, q] of quotes) {
      const series = out.get(key)!;
      const t = Math.floor(Date.parse(q.asOf) / 1000);
      if (series.length && t > series[series.length - 1].time) series.push({ time: t, value: q.price });
    }
  }
  return out;
}

/**
 * Background upkeep (daily cron): extends every stored history to today,
 * oldest-checked first, until `deadline`. Each asset costs one small call
 * for the days since it was last extended, so the day's first portfolio
 * view finds its history already current.
 */
export async function extendStoredHistories(deadline: number): Promise<{ extended: number; remaining: number }> {
  const today = utcDay(Date.now());
  const behind = await prisma.priceCoverage.findMany({
    where: { toDay: { lt: new Date(today) } },
    orderBy: { checkedAt: 'asc' },
  });
  let extended = 0;
  for (const c of behind) {
    if (Date.now() > deadline) break;
    await fillHistory(c.assetKey, [[c.toDay.getTime() + DAY_MS, today]], c).catch((error) =>
      console.error(`[pricing] extending ${c.assetKey} failed: ${(error as Error).message}`)
    );
    extended++;
  }
  return { extended, remaining: behind.length - extended };
}

export async function getDailyHistory(assetKey: string, fromMs: number, toMs = Date.now()): Promise<DailySeries> {
  return (await getDailyHistories([assetKey], fromMs, toMs)).get(assetKey) ?? [];
}
