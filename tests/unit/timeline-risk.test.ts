import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, periodReturn } from '@/lib/portfolio/timeline';
import {
  annualisedVolatility,
  concentrationMetrics,
  correlation,
  herfindahl,
  maxDrawdown,
  sharpeRatio,
  sortinoRatio,
  MIN_RETURN_OBSERVATIONS,
} from '@/lib/portfolio/risk';
import { BENCHMARKS, compareToBenchmark } from '@/lib/portfolio/benchmark';
import { buildPools, valuePortfolio } from '@/lib/portfolio/engine';
import { DAY, T0, close, leg, prices } from './helpers';

/** Daily closes at 00:00 UTC, in seconds, as the providers return them. */
function series(values: number[], startMs = T0) {
  return values.map((value, i) => ({ time: (startMs + (i + 1) * DAY) / 1000, value }));
}

describe('timeline and time-weighted return', () => {
  it('values holdings daily and excludes deposits from the return', () => {
    const history = new Map([['sym:ETH', series([100, 110, 110, 121])]]);
    const legs = [
      leg('BUY', 'sym:ETH', 1, 100, { day: 0 }),
      // A deposit that doubles the position must not register as a 100% gain.
      leg('BUY', 'sym:ETH', 1, 110, { day: 1 }),
    ];
    const pts = buildTimeline(legs, history, { endMs: T0 + 3 * DAY });
    assert.deepEqual(pts.map((p) => p.value), [100, 220, 220, 242]);
    assert.equal(pts[0].dailyReturn, null);
    assert.ok(close(pts[1].dailyReturn!, 0.1), 'price moved 100 → 110; the deposit is removed');
    assert.ok(close(pts[2].dailyReturn!, 0));
    assert.ok(close(pts[3].dailyReturn!, 0.1));
    assert.ok(close(periodReturn(pts)!, 0.21));
  });

  it('excludes an unpriced asset rather than valuing it at zero, and reports coverage', () => {
    const history = new Map([['sym:ETH', series([100, 100])]]);
    const legs = [leg('BUY', 'sym:ETH', 1, 100, { day: 0 }), leg('TRANSFER_IN', 'erc20:BASE:0xx', 5, null, { day: 0 })];
    const pts = buildTimeline(legs, history, { endMs: T0 + DAY });
    assert.equal(pts[0].value, 100);
    assert.equal(pts[0].coverage, 0.5);
  });

  it('treats a withdrawal as a flow, not a loss', () => {
    const history = new Map([['sym:ETH', series([100, 100, 100])]]);
    const legs = [leg('BUY', 'sym:ETH', 2, 200, { day: 0 }), leg('TRANSFER_OUT', 'sym:ETH', 1, null, { day: 1 })];
    const pts = buildTimeline(legs, history, { endMs: T0 + 2 * DAY });
    assert.ok(close(pts[1].dailyReturn!, 0));
    assert.equal(pts[1].value, 100);
  });
});

describe('risk metrics', () => {
  const few = Array.from({ length: MIN_RETURN_OBSERVATIONS - 1 }, () => 0.01);

  it('says "Insufficient data" instead of computing from too little history', () => {
    for (const m of [annualisedVolatility(few), sharpeRatio(few), sortinoRatio(few), correlation(few, few)]) {
      assert.equal(m.status, 'insufficient');
      if (m.status === 'insufficient') assert.match(m.reason, /^Insufficient data/);
    }
  });

  it('annualises volatility with √365 over sample standard deviation', () => {
    const returns = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 0.02 : -0.02));
    const v = annualisedVolatility(returns);
    assert.equal(v.status, 'ok');
    const sd = Math.sqrt((40 * 0.02 ** 2) / 39);
    if (v.status === 'ok') assert.ok(close(v.value, sd * Math.sqrt(365) * 100, 1e-9));
  });

  it('measures maximum drawdown on the time-weighted index', () => {
    const vals = [100, 120, 90, 95, 130, ...Array.from({ length: 30 }, () => 130)];
    const history = new Map([['sym:BTC', series(vals)]]);
    const pts = buildTimeline([leg('BUY', 'sym:BTC', 1, 100, { day: 0 })], history, {
      endMs: T0 + (vals.length - 1) * DAY,
    });
    const dd = maxDrawdown(pts);
    assert.equal(dd.status, 'ok');
    if (dd.status === 'ok') assert.ok(close(dd.value, -25, 1e-9), '120 → 90');
  });

  it('computes Sharpe and Sortino, and refuses Sortino without down days', () => {
    const mixed = Array.from({ length: 60 }, (_, i) => (i % 3 === 0 ? -0.01 : 0.02));
    assert.equal(sharpeRatio(mixed).status, 'ok');
    assert.equal(sortinoRatio(mixed).status, 'ok');
    const allUp = Array.from({ length: 60 }, (_, i) => 0.01 + i * 1e-4);
    assert.equal(sortinoRatio(allUp).status, 'insufficient');
  });

  it('computes correlation of aligned series', () => {
    const a = Array.from({ length: 40 }, (_, i) => Math.sin(i));
    const r = correlation(a, a.map((x) => 2 * x + 1));
    assert.equal(r.status, 'ok');
    if (r.status === 'ok') assert.ok(close(r.value, 1, 1e-12));
  });

  it('computes concentration and stablecoin share from current allocation', () => {
    const { positions, allocationByChain } = valuePortfolio(
      buildPools([
        leg('BUY', 'sym:BTC', 1, 1, { chain: 'ETHEREUM' }),
        leg('BUY', 'erc20:BASE:0xusdc', 1, 1, { chain: 'BASE', symbol: 'USDC' }),
      ]),
      prices({ 'sym:BTC': 75, 'erc20:BASE:0xusdc': 25 })
    );
    const m = Object.fromEntries(concentrationMetrics({ positions, allocationByChain }).map((x) => [x.key, x.result]));
    assert.deepEqual(m.top_asset, { status: 'ok', value: 75, unit: 'pct' });
    assert.deepEqual(m.asset_hhi, { status: 'ok', value: herfindahl([75, 25]), unit: 'index' });
    assert.deepEqual(m.stablecoin_share, { status: 'ok', value: 25, unit: 'pct' });
  });
});

describe('benchmark', () => {
  it('compares portfolio TWR with benchmark price return over the same window', () => {
    const eth = series([100, 110, 121]);
    const btc = series([1000, 1000, 1100]);
    const history = new Map([['sym:ETH', eth]]);
    const pts = buildTimeline([leg('BUY', 'sym:ETH', 1, 100, { day: 0 })], history, { endMs: T0 + 2 * DAY });
    const cmp = compareToBenchmark(pts, BENCHMARKS[0], btc, { days: 30, label: 'Last 30 days' }, T0 + 2 * DAY);
    assert.ok(close(cmp.portfolioReturnPct!, 21));
    assert.ok(close(cmp.benchmarkReturnPct!, 10));
    assert.ok(close(cmp.relativePct!, 11));
    assert.match(cmp.note ?? '', /shorter window/);
  });

  it('declares the total-market benchmark unavailable rather than approximating it', () => {
    const total = BENCHMARKS.find((b) => b.id === 'TOTAL')!;
    const cmp = compareToBenchmark([], total, undefined, { days: 30, label: 'x' });
    assert.equal(cmp.portfolioReturnPct, null);
    assert.match(cmp.note ?? '', /paid CoinGecko plan/);
  });
});
