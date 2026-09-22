/* eslint-disable @typescript-eslint/no-explicit-any -- the harness reads arbitrary JSON responses and asserts their shape at runtime. */
/**
 * End-to-end check against a running BlockLens server.
 *
 *   npm run build && npx next start -p 3100
 *   BASE_URL=http://localhost:3100 npm run test:e2e
 *
 * Drives the app over HTTP the way a browser does — cookies included —
 * using real providers (Alchemy, CoinGecko, Gemini, Resend's sandbox
 * recipient). It creates one throwaway account and deletes it at the end,
 * which removes everything that account created.
 *
 * Set E2E_WALLET / E2E_WALLET_CHAIN to import a different public wallet.
 */
import { config } from 'dotenv';
config({ path: '.env', quiet: true });

const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const WALLET = process.env.E2E_WALLET ?? '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const WALLET_CHAIN = process.env.E2E_WALLET_CHAIN ?? 'OPTIMISM';
const SKIP_AI = process.env.E2E_SKIP_AI === '1';

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
let failures = 0;
let passes = 0;

async function step(name: string, fn: () => Promise<string | void>) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    passes++;
    console.log(`  ${green('ok')}    ${name} ${`(${Date.now() - t0}ms)`}${detail ? `\n        ${detail}` : ''}`);
  } catch (error) {
    failures++;
    console.log(`  ${red('FAIL')}  ${name}\n        ${(error as Error).message}`);
  }
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

class Client {
  cookie = '';
  async req(path: string, init: RequestInit & { json?: unknown } = {}) {
    const res = await fetch(`${BASE}${path}`, {
      redirect: 'manual',
      ...init,
      headers: {
        ...(init.json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(init.headers ?? {}),
      },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) {
      const [pair] = c.split(';');
      if (pair.startsWith('blocklens-session=')) {
        this.cookie = /blocklens-session=(;|$)/.test(`${pair};`) || /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c) ? '' : pair;
      }
    }
    const text = await res.text();
    let body: any = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* html */
    }
    return { status: res.status, body, location: res.headers.get('location'), raw: res };
  }
}

async function main() {
  console.log(`\nBlockLens E2E against ${BASE}\n`);
  const stamp = Date.now();
  const email = `delivered+e2e${stamp}@resend.dev`;
  const password = 'E2e-Password-2026!';
  const a = new Client();

  console.log('Health');
  await step('GET /api/health reports database and auth configured', async () => {
    const r = await a.req('/api/health');
    assert(r.status === 200 && r.body.healthy, `status ${r.status} ${JSON.stringify(r.body)}`);
    return JSON.stringify(r.body.checks);
  });

  console.log('\nAuthentication');
  await step('unauthenticated /portfolio redirects to login', async () => {
    const r = await a.req('/portfolio');
    assert(r.status === 307 && r.location?.includes('/login'), `got ${r.status} → ${r.location}`);
  });

  await step('register (verification email via Resend sandbox recipient)', async () => {
    const r = await a.req('/api/auth/register', { method: 'POST', json: { name: 'E2E Tester', email, password, confirmPassword: password } });
    assert(r.status === 201, `status ${r.status} ${JSON.stringify(r.body)}`);
    assert(a.cookie, 'no session cookie set');
    return r.body.message;
  });

  await step('session persists across requests', async () => {
    const r = await a.req('/api/auth/session');
    assert(r.status === 200 && r.body.data.email === email, JSON.stringify(r.body));
  });

  await step('logout clears the session', async () => {
    await a.req('/api/auth/logout', { method: 'POST' });
    const r = await a.req('/api/auth/session');
    assert(r.status === 401, `status ${r.status}`);
  });

  await step('wrong password is rejected with a generic message', async () => {
    const r = await a.req('/api/auth/login', { method: 'POST', json: { email, password: 'wrong-password' } });
    assert(r.status === 401 && r.body.error === 'Invalid email or password', JSON.stringify(r.body));
  });

  await step('nonexistent account gets the same generic message', async () => {
    const r = await a.req('/api/auth/login', { method: 'POST', json: { email: `nobody${stamp}@example.com`, password } });
    assert(r.status === 401 && r.body.error === 'Invalid email or password', JSON.stringify(r.body));
  });

  await step('login succeeds with differently-cased email (normalised)', async () => {
    const r = await a.req('/api/auth/login', { method: 'POST', json: { email: `  ${email.toUpperCase()} `, password } });
    assert(r.status === 200 && a.cookie, JSON.stringify(r.body));
  });

  await step('protected pages render when signed in (refresh-safe)', async () => {
    for (const path of ['/dashboard', '/portfolio', '/portfolio/wallets', '/portfolio/transactions', '/alerts', '/watchlist', '/settings']) {
      const r = await a.req(path);
      assert(r.status === 200, `${path} → ${r.status} ${r.location ?? ''}`);
    }
  });

  await step('a tampered session cookie is treated as signed out', async () => {
    const t = new Client();
    t.cookie = `${a.cookie.slice(0, -4)}AAAA`;
    const r = await t.req('/api/auth/session');
    assert(r.status === 401, `status ${r.status}`);
  });

  await step('a revoked session does not loop: it clears the cookie and reaches /login', async () => {
    const b = new Client();
    await b.req('/api/auth/login', { method: 'POST', json: { email, password } });
    const stale = new Client();
    stale.cookie = b.cookie;
    // Sign out everywhere from `b`; `stale` keeps a validly signed JWT whose row is gone.
    await b.req('/api/account/sessions', { method: 'DELETE' });
    const r1 = await stale.req('/watchlist');
    assert(r1.status === 307 && r1.location?.includes('/api/auth/expired'), `watchlist → ${r1.status} ${r1.location}`);
    const r2 = await stale.req(new URL(r1.location!, BASE).pathname + new URL(r1.location!, BASE).search);
    assert(r2.status === 307 && r2.location?.includes('/login'), `expired → ${r2.status} ${r2.location}`);
    assert(!stale.cookie, 'stale cookie was not cleared');
    const r3 = await stale.req('/login');
    assert(r3.status === 200, `/login → ${r3.status} ${r3.location} (the old redirect loop)`);
    // `a` was revoked too; sign back in for the rest of the run.
    await a.req('/api/auth/login', { method: 'POST', json: { email, password } });
  });

  await step('resend verification reports the real delivery outcome', async () => {
    const r = await a.req('/api/auth/resend-verification', { method: 'POST' });
    // 429 is the per-minute limit right after registration — also a correct outcome.
    assert([200, 429].includes(r.status), `status ${r.status} ${JSON.stringify(r.body)}`);
    return `${r.status} ${r.body.message ?? r.body.error}`;
  });

  console.log('\nWallets');
  await step('a private key pasted as an address is refused', async () => {
    const r = await a.req('/api/portfolio/wallets', { method: 'POST', json: { chain: 'ETHEREUM', address: `0x${'ab'.repeat(32)}`, label: 'x' } });
    assert(r.status === 400 && /private key/.test(r.body.error), JSON.stringify(r.body));
  });

  await step('a seed phrase is refused', async () => {
    const phrase = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
    const r = await a.req('/api/portfolio/wallets', { method: 'POST', json: { chain: 'ETHEREUM', address: phrase, label: 'x' } });
    assert(r.status === 400 && /recovery phrase/.test(r.body.error), JSON.stringify(r.body));
  });

  await step('an invalid address is refused', async () => {
    const r = await a.req('/api/portfolio/wallets', { method: 'POST', json: { chain: 'BASE', address: '0x1234', label: 'x' } });
    assert(r.status === 400, JSON.stringify(r.body));
  });

  let walletId = '';
  await step(`add a real public wallet on ${WALLET_CHAIN}`, async () => {
    const r = await a.req('/api/portfolio/wallets', { method: 'POST', json: { chain: WALLET_CHAIN, address: WALLET, label: 'E2E wallet' } });
    assert(r.status === 201, JSON.stringify(r.body));
    walletId = r.body.data.id;
    const dup = await a.req('/api/portfolio/wallets', { method: 'POST', json: { chain: WALLET_CHAIN, address: WALLET.toUpperCase().replace('0X', '0x'), label: 'dup' } });
    assert(dup.status === 409, `duplicate → ${dup.status}`);
  });

  await step('sync imports real history (one bounded slice)', async () => {
    const r = await a.req(`/api/portfolio/wallets/${walletId}/sync`, { method: 'POST' });
    assert(r.status === 200, JSON.stringify(r.body));
    const tx = await a.req('/api/portfolio/transactions?take=200');
    assert(tx.body.data.items.length > 0, 'no transactions imported');
    const types = [...new Set(tx.body.data.items.map((t: any) => t.type))];
    assert(!types.includes('BUY') && !types.includes('SELL'), 'chain data was classified as BUY/SELL');
    return `imported ${r.body.data.imported} legs, complete=${r.body.data.complete}; types seen: ${types.join(', ')}`;
  });

  await step('another user cannot read or touch this wallet', async () => {
    const other = new Client();
    const e2 = `delivered+e2eother${stamp}@resend.dev`;
    await other.req('/api/auth/register', { method: 'POST', json: { name: 'Other', email: e2, password, confirmPassword: password } });
    const list = await other.req('/api/portfolio/wallets');
    assert(list.body.data.length === 0, 'saw another user’s wallet');
    const del = await other.req(`/api/portfolio/wallets/${walletId}`, { method: 'DELETE' });
    assert(del.status === 404, `delete → ${del.status}`);
    const sync = await other.req(`/api/portfolio/wallets/${walletId}/sync`, { method: 'POST' });
    assert(sync.status === 404, `sync → ${sync.status}`);
    await other.req('/api/account', { method: 'DELETE', json: { confirmEmail: e2 } });
  });

  console.log('\nManual transactions & portfolio');
  let buyId = '';
  await step('record a manual BUY with a price', async () => {
    const r = await a.req('/api/portfolio/transactions', {
      method: 'POST',
      json: { type: 'BUY', symbol: 'btc', quantity: 0.5, priceUsd: 40000, feeUsd: 10, date: '2026-01-15T12:00:00Z' },
    });
    assert(r.status === 201, JSON.stringify(r.body));
    buyId = r.body.data.id;
    assert(Number(r.body.data.usdValue) === 20010, `usdValue ${r.body.data.usdValue}`);
  });

  await step('record a manual SELL using the historical close', async () => {
    const r = await a.req('/api/portfolio/transactions', { method: 'POST', json: { type: 'SELL', symbol: 'BTC', quantity: 0.1, date: '2026-06-01T12:00:00Z' } });
    assert(r.status === 201, JSON.stringify(r.body));
    return `priced at $${Number(r.body.data.priceUsd).toFixed(2)} (${r.body.data.priceSource})`;
  });

  await step('an unknown ticker is refused rather than priced', async () => {
    const r = await a.req('/api/portfolio/transactions', { method: 'POST', json: { type: 'BUY', symbol: 'ZZZNOTREAL9', quantity: 1, priceUsd: 1, date: '2026-01-01' } });
    assert(r.status === 400, JSON.stringify(r.body));
  });

  await step('a future date is refused', async () => {
    const r = await a.req('/api/portfolio/transactions', { method: 'POST', json: { type: 'BUY', symbol: 'BTC', quantity: 1, priceUsd: 1, date: '2099-01-01' } });
    assert(r.status === 400, JSON.stringify(r.body));
  });

  await step('portfolio page shows computed figures and sections', async () => {
    const r = await a.req('/portfolio?period=365d');
    assert(r.status === 200, `status ${r.status}`);
    const html = String(r.body);
    for (const marker of ['data-testid="total-value"', 'data-testid="positions-table"', 'data-testid="benchmark-table"', 'data-testid="risk-metrics"', 'Total PnL', 'Allocation by chain']) {
      assert(html.includes(marker), `missing ${marker}`);
    }
    const total = html.match(/data-testid="total-value"[^>]*>([^<]+)</)?.[1];
    return `total value ${total}`;
  });

  await step('reclassify a flagged incoming transfer as a transfer from an own account', async () => {
    const list = await a.req('/api/portfolio/transactions?review=1&take=5');
    const leg = list.body.data.items.find((t: any) => t.type === 'TRANSFER_IN');
    if (!leg) return 'no flagged incoming transfer in the imported slice — skipped';
    const r = await a.req(`/api/portfolio/transactions/${leg.id}`, { method: 'PATCH', json: { type: 'TRANSFER_IN', isInternal: true } });
    assert(r.status === 200 && r.body.data.userOverride && !r.body.data.needsReview, JSON.stringify(r.body));
    const bad = await a.req(`/api/portfolio/transactions/${leg.id}`, { method: 'PATCH', json: { type: 'SELL' } });
    assert(bad.status === 400, 'an incoming leg was allowed to become a SELL');
  });

  await step('imported legs cannot be deleted; manual ones can', async () => {
    const list = await a.req('/api/portfolio/transactions?take=1');
    const imported = list.body.data.items.find((t: any) => t.source === 'WALLET');
    if (imported) {
      const r = await a.req(`/api/portfolio/transactions/${imported.id}`, { method: 'DELETE' });
      assert(r.status === 400, `imported delete → ${r.status}`);
    }
    const tmp = await a.req('/api/portfolio/transactions', { method: 'POST', json: { type: 'BUY', symbol: 'ETH', quantity: 1, priceUsd: 2000, date: '2026-02-01' } });
    const del = await a.req(`/api/portfolio/transactions/${tmp.body.data.id}`, { method: 'DELETE' });
    assert(del.status === 200, `manual delete → ${del.status}`);
    assert(buyId, 'buy id missing');
  });

  console.log('\nWatchlist & alerts');
  await step('watchlist add, note, remove', async () => {
    let r = await a.req('/api/watchlist', { method: 'POST', json: { symbol: 'ETH', name: 'Ethereum' } });
    assert(r.status === 200, JSON.stringify(r.body));
    r = await a.req('/api/watchlist', { method: 'PATCH', json: { symbol: 'ETH', notes: 'Watching the L2 fee data' } });
    assert(r.status === 200, JSON.stringify(r.body));
    const w = await a.req('/api/watchlist');
    const eth = w.body.data.items.find((i: any) => i.symbol === 'ETH');
    assert(eth?.notes === 'Watching the L2 fee data' && typeof eth.currentPrice === 'number', JSON.stringify(eth));
    r = await a.req('/api/watchlist?symbol=ETH', { method: 'DELETE' });
    assert(r.status === 200, 'remove failed');
  });

  await step('create alerts and evaluate: fires once, then stays quiet', async () => {
    let r = await a.req('/api/alerts', { method: 'POST', json: { type: 'PRICE_ABOVE', symbol: 'BTC', threshold: 1, cooldownMinutes: 60 } });
    assert(r.status === 201, JSON.stringify(r.body));
    r = await a.req('/api/alerts', { method: 'POST', json: { type: 'ALLOCATION_ABOVE', symbol: 'BTC', threshold: 1 } });
    assert(r.status === 201, JSON.stringify(r.body));
    r = await a.req('/api/alerts', { method: 'POST', json: { type: 'LARGE_TRANSACTION', threshold: 1 } });
    assert(r.status === 201, JSON.stringify(r.body));
    const bad = await a.req('/api/alerts', { method: 'POST', json: { type: 'PRICE_ABOVE', threshold: 1 } });
    assert(bad.status === 400, 'price alert without an asset was accepted');

    const first = await a.req('/api/alerts/evaluate', { method: 'POST' });
    assert(first.status === 200 && first.body.data.fired >= 2, JSON.stringify(first.body));
    await new Promise((res) => setTimeout(res, 31_000));
    const second = await a.req('/api/alerts/evaluate', { method: 'POST' });
    assert(second.status === 200 && second.body.data.fired === 0, `second run fired ${second.body.data?.fired}`);
    const list = await a.req('/api/alerts');
    return `first run fired ${first.body.data.fired}; second run fired 0; history has ${list.body.data.events.length} events`;
  });

  console.log('\nAI insights (Gemini)');
  if (SKIP_AI) {
    console.log('  skip  E2E_SKIP_AI=1');
  } else {
    await step('generate grounded insights', async () => {
      const r = await a.req('/api/portfolio/insights', { method: 'POST', json: { period: '365d' } });
      assert(r.status === 200, JSON.stringify(r.body));
      const s = r.body.data.sections;
      const all = Object.values(s).flat() as Array<{ kind: string; evidence: string[] }>;
      assert(all.length > 0, 'no statements survived grounding');
      assert(all.every((x) => ['FACT', 'INTERPRETATION'].includes(x.kind)), 'unlabelled statement');
      const again = await a.req('/api/portfolio/insights', { method: 'POST', json: { period: '365d' } });
      assert([200, 429].includes(again.status), `repeat → ${again.status}`);
      return `${all.length} statements (${all.filter((x) => x.kind === 'FACT').length} facts), ${r.body.data.rejectedCount} withheld, model ${r.body.data.model}; repeat → ${again.status} ${again.body.message ?? again.body.error}`;
    });
  }

  console.log('\nCron');
  await step('cron refuses a request without the secret', async () => {
    const r = await a.req('/api/cron/sync');
    assert(r.status === 401, `status ${r.status}`);
  });
  if (process.env.CRON_SECRET) {
    await step('cron runs with the secret', async () => {
      const r = await a.req('/api/cron/sync', { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
      assert(r.status === 200, JSON.stringify(r.body));
      return JSON.stringify(r.body.data);
    });
  }

  console.log('\nCleanup');
  await step('delete the test account (cascades wallets, transactions, alerts, insights)', async () => {
    const r = await a.req('/api/account', { method: 'DELETE', json: { confirmEmail: email } });
    assert(r.status === 200, JSON.stringify(r.body));
    const s = await a.req('/api/auth/session');
    assert(s.status === 401, 'session survived account deletion');
  });

  console.log(`\n${failures ? red(`${failures} failed`) : green('all passed')} · ${passes} passed\n`);
  process.exit(failures ? 1 : 0);
}

void main();
