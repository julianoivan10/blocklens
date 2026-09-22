/**
 * Page-timing harness.
 *
 *   BASE_URL=http://localhost:3100 node --import tsx scripts/perf.mts seed
 *   BASE_URL=http://localhost:3100 node --import tsx scripts/perf.mts measure [label]
 *   BASE_URL=http://localhost:3100 node --import tsx scripts/perf.mts cleanup
 *
 * `seed` creates three throwaway accounts through the public API —
 * empty, small (manual entries) and large (two real public wallets on two
 * chains, manual entries, alerts, a watchlist) — and stores their session
 * cookies in PERF_STATE. `measure` times each page for each account:
 * time to first byte, time until the portfolio holdings have streamed in
 * ("content"), and time to the last byte. `cleanup` deletes the accounts, which cascades everything.
 */
import { config } from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
config({ path: '.env', quiet: true });

const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
// Holds session cookies, so it lives outside the repository.
const STATE = process.env.PERF_STATE ?? join(tmpdir(), 'blocklens-perf-state.json');
const PASSWORD = 'Perf-Password-2026!';

interface Account {
  label: string;
  email: string;
  cookie: string;
}

async function call(cookie: string, path: string, init: RequestInit & { json?: unknown } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    redirect: 'manual',
    ...init,
    headers: {
      ...(init.json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  const set = res.headers.getSetCookie?.().find((c) => c.startsWith('blocklens-session='));
  const body = await res.text();
  return { status: res.status, body, cookie: set ? set.split(';')[0] : cookie };
}

async function register(label: string): Promise<Account> {
  const email = `delivered+perf-${label}-${Date.now()}@resend.dev`;
  const r = await call('', '/api/auth/register', {
    method: 'POST',
    json: { name: `Perf ${label}`, email, password: PASSWORD, confirmPassword: PASSWORD },
  });
  if (r.status !== 201) throw new Error(`register ${label}: ${r.status} ${r.body}`);
  return { label, email, cookie: r.cookie };
}

async function seed() {
  const empty = await register('empty');
  const small = await register('small');
  const large = await register('large');

  for (const [symbol, quantity, priceUsd, date] of [
    ['BTC', 0.25, 62000, '2025-11-03'],
    ['ETH', 3, 2400, '2025-12-10'],
    ['SOL', 40, 140, '2026-02-14'],
  ] as const) {
    for (const acct of [small, large]) {
      const r = await call(acct.cookie, '/api/portfolio/transactions', { method: 'POST', json: { type: 'BUY', symbol, quantity, priceUsd, date } });
      if (r.status !== 201) throw new Error(`manual buy: ${r.body}`);
    }
  }

  const wallets = [
    { chain: 'OPTIMISM', address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', label: 'Main (OP)', slices: 2 },
    { chain: 'BASE', address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', label: 'Main (Base)', slices: 1 },
  ];
  for (const w of wallets) {
    const r = await call(large.cookie, '/api/portfolio/wallets', { method: 'POST', json: w });
    if (r.status !== 201) throw new Error(`wallet: ${r.body}`);
    const id = JSON.parse(r.body).data.id;
    for (let i = 0; i < w.slices; i++) {
      const s = await call(large.cookie, `/api/portfolio/wallets/${id}/sync`, { method: 'POST' });
      console.log(`sync ${w.label} slice ${i + 1}: ${s.status} ${s.body.slice(0, 120)}`);
    }
  }

  for (const [symbol, name] of [['BTC', 'Bitcoin'], ['ETH', 'Ethereum'], ['SOL', 'Solana'], ['LINK', 'Chainlink'], ['ARB', 'Arbitrum']]) {
    await call(large.cookie, '/api/watchlist', { method: 'POST', json: { symbol, name } });
  }
  for (const json of [
    { type: 'PRICE_ABOVE', symbol: 'BTC', threshold: 200000 },
    { type: 'PORTFOLIO_DRAWDOWN', threshold: 30 },
    { type: 'LARGE_TRANSACTION', threshold: 10000 },
  ]) {
    await call(large.cookie, '/api/alerts', { method: 'POST', json });
  }

  writeFileSync(STATE, JSON.stringify([empty, small, large], null, 2));
  console.log(`seeded → ${STATE}`);
}

const PAGES = ['/dashboard', '/portfolio', '/portfolio/wallets', '/portfolio/transactions', '/watchlist', '/alerts', '/api/portfolio/insights'];

async function time(cookie: string, path: string) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie }, redirect: 'manual' });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let first = 0;
  let useful = 0;
  let bytes = 0;
  let tail = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (!first) first = performance.now() - t0;
    if (done) break;
    bytes += value.length;
    // "Useful content": the portfolio's holdings (or its empty state) have streamed in.
    const text = tail + decoder.decode(value, { stream: true });
    if (!useful && /data-testid="total-value"|No holdings yet/.test(text)) useful = performance.now() - t0;
    tail = text.slice(-200);
  }
  const total = performance.now() - t0;
  return { status: res.status, ttfb: Math.round(first), useful: Math.round(useful || total), total: Math.round(total), kb: Math.round(bytes / 1024) };
}

async function measure(label: string) {
  const accounts: Account[] = JSON.parse(readFileSync(STATE, 'utf8'));
  const rows: string[] = [];
  for (const acct of accounts) {
    for (const path of PAGES) {
      const start = Date.now();
      const r = await time(acct.cookie, path);
      console.log(`[perf:mark] ${label} ${acct.label} ${path} start=${start} end=${Date.now()}`);
      rows.push(`${label.padEnd(6)} ${acct.label.padEnd(6)} ${path.padEnd(26)} ${String(r.status).padEnd(4)} ttfb=${String(r.ttfb).padStart(6)}ms content=${String(r.useful).padStart(6)}ms total=${String(r.total).padStart(6)}ms ${r.kb}KB`);
    }
  }
  console.log(`\n${rows.join('\n')}`);
}

async function cleanup() {
  if (!existsSync(STATE)) return;
  const accounts: Account[] = JSON.parse(readFileSync(STATE, 'utf8'));
  for (const acct of accounts) {
    const r = await call(acct.cookie, '/api/account', { method: 'DELETE', json: { confirmEmail: acct.email } });
    console.log(`cleanup ${acct.label}: ${r.status}`);
  }
}

const [mode, label = 'run'] = process.argv.slice(2);
if (mode === 'seed') await seed();
else if (mode === 'measure') await measure(label);
else if (mode === 'cleanup') await cleanup();
else console.log('usage: perf.mts seed | measure [label] | cleanup');
