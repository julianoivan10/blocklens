/**
 * Market-data cache against the real database, with provider HTTP mocked
 * so every provider call can be counted.
 *
 *   npm run test:integration   (loads .env via --env-file)
 *
 * Only the public market-cache tables are touched, under asset keys that
 * cannot collide with real ones, and they are removed afterwards.
 */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@/server/db';
import * as pricing from '@/services/pricing';

const PREFIX = 'erc20:BASE:0xfeedface';
const key = (n: number) => `${PREFIX}${String(n).padStart(32, '0')}`;
const DAY = 86_400_000;

const realFetch = globalThis.fetch;
let calls: string[] = [];
type Reply = (url: string, body: any) => unknown; // eslint-disable-line @typescript-eslint/no-explicit-any
let reply: Reply = () => ({});

function install() {
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (!url.includes('alchemy.com') && !url.includes('coingecko.com')) return realFetch(input, init);
    calls.push(url.replace(/\/v1\/[^/]+\//, '/v1/[key]/'));
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const out = await reply(url, body);
    if (out instanceof Response) return out;
    return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

async function purge() {
  await prisma.marketQuote.deleteMany({ where: { assetKey: { startsWith: PREFIX } } });
  await prisma.priceDaily.deleteMany({ where: { assetKey: { startsWith: PREFIX } } });
  await prisma.priceCoverage.deleteMany({ where: { assetKey: { startsWith: PREFIX } } });
}

/** Alchemy by-address reply: a price for the listed keys, none for the rest. */
function priced(prices: Record<string, number>): Reply {
  return (url, body) => {
    if (!url.includes('/tokens/by-address')) return { data: [] };
    return {
      data: body.addresses.map((a: { network: string; address: string }) => {
        const k = `erc20:BASE:${a.address}`;
        return prices[k] !== undefined
          ? { ...a, prices: [{ currency: 'usd', value: String(prices[k]), lastUpdatedAt: new Date().toISOString() }] }
          : { ...a, prices: [], error: { message: 'Price not found' } };
      }),
    };
  };
}

before(async () => {
  await purge();
  install();
});
afterEach(() => {
  calls = [];
});
after(async () => {
  globalThis.fetch = realFetch;
  await purge();
  await prisma.$disconnect();
});

describe('current quotes', () => {
  it('fetches a never-seen quote once, then serves it from the cache', async () => {
    reply = priced({ [key(1)]: 1.25 });
    const first = await pricing.getCurrentPrices([key(1)]);
    assert.equal(first.get(key(1))?.price, 1.25);
    assert.equal(calls.length, 1);

    calls = [];
    const second = await pricing.getCurrentPrices([key(1)]);
    assert.equal(second.get(key(1))?.price, 1.25);
    assert.equal(calls.length, 0, 'a fresh quote must not reach the provider');
  });

  it('caches "no price" answers instead of asking again, and never invents a price', async () => {
    reply = priced({});
    const first = await pricing.getCurrentPrices([key(2)]);
    assert.equal(first.has(key(2)), false);
    assert.equal(calls.length, 1);

    calls = [];
    const second = await pricing.getCurrentPrices([key(2)]);
    assert.equal(second.has(key(2)), false);
    assert.equal(calls.length, 0);
  });

  it('shares one provider call between concurrent requests for the same asset', async () => {
    reply = async (url, body) => {
      await new Promise((r) => setTimeout(r, 150));
      return priced({ [key(3)]: 7 })(url, body);
    };
    const [a, b] = await Promise.all([pricing.getCurrentPrices([key(3)]), pricing.getCurrentPrices([key(3)])]);
    assert.equal(a.get(key(3))?.price, 7);
    assert.equal(b.get(key(3))?.price, 7);
    assert.equal(calls.length, 1);
  });

  it('batches many assets into requests of 25', async () => {
    reply = priced({});
    const keys = Array.from({ length: 60 }, (_, i) => key(100 + i));
    await pricing.getCurrentPrices(keys);
    assert.equal(calls.length, 3);
  });

  it('reports unanswered first quotes as pending when the time budget runs out', async () => {
    reply = async (url, body) => {
      await new Promise((r) => setTimeout(r, 1_500));
      return priced({ [key(4)]: 3 })(url, body);
    };
    const { quotes, pending } = await pricing.getCurrentPricesWithin([key(4)], 200);
    assert.equal(quotes.has(key(4)), false, 'no guessed price while pending');
    assert.deepEqual(pending, [key(4)]);
    await new Promise((r) => setTimeout(r, 2_000));
    calls = [];
    const later = await pricing.getCurrentPrices([key(4)]);
    assert.equal(later.get(key(4))?.price, 3, 'the background fetch completed and was stored');
    assert.equal(calls.length, 0);
  });
});

describe('daily history', () => {
  it('stores closes and never refetches a covered range', async () => {
    const today = Math.floor(Date.now() / DAY) * DAY;
    const from = today - 10 * DAY;
    const to = today - 2 * DAY;
    reply = (url) => {
      if (!url.includes('/tokens/historical')) return { data: [] };
      return {
        data: Array.from({ length: 9 }, (_, i) => ({ timestamp: new Date(from + i * DAY).toISOString(), value: String(100 + i) })),
      };
    };
    const first = await pricing.getDailyHistory(key(5), from, to);
    assert.equal(first.length, 9);
    assert.equal(first[0].value, 100);
    assert.equal(calls.length, 1);

    calls = [];
    const second = await pricing.getDailyHistory(key(5), from, to);
    assert.deepEqual(second, first, 'stored closes are returned unchanged');
    assert.equal(calls.length, 0, 'a covered range must not reach the provider');

    calls = [];
    await pricing.getDailyHistory(key(5), from + 2 * DAY, to - DAY);
    assert.equal(calls.length, 0, 'a sub-range of a covered range must not reach the provider');
  });
});

describe('provider quota', () => {
  it('stops calling Alchemy once it reports the hourly quota spent, and prices nothing by guess', async () => {
    reply = () =>
      new Response(JSON.stringify({ error: { message: 'Your free app has exceeded its limit of 300 token_price requests per 1 hours.' } }), {
        status: 429,
      });
    const first = await pricing.getCurrentPrices([key(6)]);
    assert.equal(first.has(key(6)), false);
    assert.equal(calls.length, 1, 'a quota 429 is not retried');
    assert.equal(pricing.alchemyPricesAvailable(), false);

    calls = [];
    const second = await pricing.getCurrentPrices([key(7)]);
    assert.equal(second.has(key(7)), false);
    assert.equal(calls.length, 0, 'the breaker fails fast without a network call');
  });
});
