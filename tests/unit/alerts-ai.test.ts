import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAlert, type AlertConfig, type AlertContext } from '@/lib/alerts/evaluate';
import { fact, groundStatements, InsightResponseSchema, type InsightResponse } from '@/lib/ai/insights';

const NOW = new Date('2026-09-22T12:00:00Z');

function alert(partial: Partial<AlertConfig>): AlertConfig {
  return {
    id: 'a1',
    type: 'PRICE_ABOVE',
    symbol: 'BTC',
    walletId: null,
    threshold: 100_000,
    cooldownMinutes: 60,
    lastState: false,
    lastTriggeredAt: null,
    lastSeenAt: null,
    ...partial,
  };
}

function ctx(partial: Partial<AlertContext> = {}): AlertContext {
  return {
    now: NOW,
    prices: new Map([['BTC', { price: 101_000, change24hPct: -6 }]]),
    allocationBySymbol: new Map([['BTC', 64]]),
    currentDrawdownPct: -12,
    newTransactions: [],
    ...partial,
  };
}

describe('alerts — firing rules', () => {
  it('fires on the transition into the condition', () => {
    const r = evaluateAlert(alert({}), ctx());
    assert.equal(r.events.length, 1);
    assert.equal(r.state, true);
    assert.match(r.events[0].title, /BTC above/);
  });

  it('does not fire again while the condition keeps holding', () => {
    const r = evaluateAlert(alert({ lastState: true }), ctx());
    assert.equal(r.events.length, 0);
    assert.equal(r.skipped, 'ALREADY_ACTIVE');
  });

  it('re-arms once the condition clears', () => {
    const r = evaluateAlert(alert({ lastState: true }), ctx({ prices: new Map([['BTC', { price: 90_000, change24hPct: 0 }]]) }));
    assert.equal(r.state, false);
    assert.equal(r.events.length, 0);
  });

  it('respects the cooldown, and stays un-armed so it can fire after', () => {
    const r = evaluateAlert(alert({ lastTriggeredAt: new Date(NOW.getTime() - 30 * 60_000) }), ctx());
    assert.equal(r.events.length, 0);
    assert.equal(r.skipped, 'COOLDOWN');
    assert.equal(r.state, false);
  });

  it('produces the same dedupe key for repeated evaluation in one window', () => {
    const a = evaluateAlert(alert({}), ctx());
    const b = evaluateAlert(alert({}), ctx({ now: new Date(NOW.getTime() + 60_000) }));
    assert.equal(a.events[0].dedupeKey, b.events[0].dedupeKey);
  });

  it('does not fire without data', () => {
    const r = evaluateAlert(alert({ symbol: 'NOPE' }), ctx());
    assert.equal(r.skipped, 'NO_DATA');
    assert.equal(r.events.length, 0);
  });

  it('handles percentage move, drawdown and allocation thresholds', () => {
    assert.equal(evaluateAlert(alert({ type: 'PERCENT_MOVE', threshold: 5 }), ctx()).events.length, 1);
    assert.equal(evaluateAlert(alert({ type: 'PERCENT_MOVE', threshold: 7 }), ctx()).events.length, 0);
    assert.equal(evaluateAlert(alert({ type: 'PORTFOLIO_DRAWDOWN', symbol: null, threshold: 10 }), ctx()).events.length, 1);
    assert.equal(evaluateAlert(alert({ type: 'ALLOCATION_ABOVE', threshold: 60 }), ctx()).events.length, 1);
  });

  it('does not fire for historical transactions on the first evaluation', () => {
    const tx = {
      id: 't1', walletId: 'w', timestamp: NOW, createdAt: NOW, symbol: 'ETH', amount: 10, usdValue: 30_000, type: 'TRANSFER_IN', walletLabel: 'Main',
    };
    const first = evaluateAlert(alert({ type: 'LARGE_TRANSACTION', threshold: 1000 }), ctx({ newTransactions: [tx] }));
    assert.equal(first.events.length, 0);
    assert.ok(first.lastSeenAt);
  });

  it('fires once per large transaction, keyed by transaction', () => {
    const seen = new Date(NOW.getTime() - 3_600_000);
    const txs = [
      { id: 't1', walletId: 'w', timestamp: NOW, createdAt: NOW, symbol: 'ETH', amount: 10, usdValue: 30_000, type: 'TRANSFER_IN', walletLabel: 'Main' },
      { id: 't2', walletId: 'w', timestamp: NOW, createdAt: NOW, symbol: 'ETH', amount: 0.1, usdValue: 300, type: 'TRANSFER_IN', walletLabel: 'Main' },
    ];
    const r = evaluateAlert(alert({ type: 'LARGE_TRANSACTION', threshold: 1000, lastSeenAt: seen }), ctx({ newTransactions: txs }));
    assert.equal(r.events.length, 1);
    assert.equal(r.events[0].dedupeKey, 'a1:tx:t1');
    const again = evaluateAlert(
      alert({ type: 'LARGE_TRANSACTION', threshold: 1000, lastSeenAt: r.lastSeenAt }),
      ctx({ newTransactions: txs })
    );
    assert.equal(again.events.length, 0, 'the high-water mark prevents a repeat');
  });
});

describe('AI insights — schema and grounding', () => {
  const facts = [
    fact('F1', 'Total value', '$12,345.67', [12345.67]),
    fact('F2', 'BTC allocation', '62.04%', [62.04]),
    fact('F3', 'Period', 'Last 90 days (2026-06-24 to 2026-09-22)'),
  ];
  const empty = (): InsightResponse => ({
    summary: [], performance: [], concentration: [], transactions: [], risk: [], notableChanges: [], attention: [],
  });

  it('keeps grounded statements, including rounded quotes of a fact', () => {
    const r = empty();
    r.summary.push({ text: 'The portfolio is valued at $12,345.67.', kind: 'FACT', evidence: ['F1'] });
    r.concentration.push({ text: 'BTC represents 62% of the portfolio.', kind: 'FACT', evidence: ['F2'] });
    r.concentration.push({ text: 'This suggests a concentrated position in one asset.', kind: 'INTERPRETATION', evidence: ['F2'] });
    const g = groundStatements(r, facts);
    assert.equal(g.rejected.length, 0, JSON.stringify(g.rejected));
    assert.equal(g.sections.concentration.length, 2);
  });

  it('drops invented numbers, unknown evidence, uncited facts and trading directives', () => {
    const r = empty();
    r.summary.push({ text: 'BTC represents 70% of the portfolio.', kind: 'FACT', evidence: ['F2'] });
    r.summary.push({ text: 'The portfolio holds a single asset.', kind: 'FACT', evidence: ['F9'] });
    r.summary.push({ text: 'The portfolio is large.', kind: 'FACT', evidence: [] });
    r.attention.push({ text: 'You should sell BTC now to reduce risk.', kind: 'INTERPRETATION', evidence: ['F2'] });
    r.attention.push({ text: 'BTC will rise over the coming weeks.', kind: 'INTERPRETATION', evidence: ['F2'] });
    const g = groundStatements(r, facts);
    assert.equal(g.rejected.length, 5);
    assert.deepEqual(
      g.rejected.map((x) => x.reason.split(':')[0].split(' ').slice(0, 2).join(' ')),
      ['number not', 'cites unknown', 'FACT without', 'trading directive', 'trading directive']
    );
  });

  it('allows dates that appear in a fact', () => {
    const r = empty();
    r.performance.push({ text: 'The period runs from 2026-06-24 to 2026-09-22.', kind: 'FACT', evidence: ['F3'] });
    assert.equal(groundStatements(r, facts).rejected.length, 0);
  });

  it('rejects a response that does not match the schema', () => {
    assert.equal(InsightResponseSchema.safeParse({ summary: 'text' }).success, false);
    assert.equal(
      InsightResponseSchema.safeParse({ ...empty(), summary: [{ text: 'A valid sentence.', kind: 'OPINION', evidence: [] }] }).success,
      false
    );
    assert.equal(InsightResponseSchema.safeParse(empty()).success, true);
  });
});

describe('AI insights — prompt hygiene', () => {
  it('reduces contract-supplied token names to a plain ticker', async () => {
    const { safeSymbol } = await import('@/lib/ai/insights');
    assert.equal(safeSymbol('$ ETH77Go.com - Visit to claim'), 'ETH77GocomVi');
    assert.ok(!safeSymbol('evil.site/claim').includes('.'), 'no domain survives');
    assert.equal(safeSymbol('USDC'), 'USDC');
    assert.equal(safeSymbol('💩'), 'UNNAMED');
  });

  it('allows numbers that appear in a fact label, such as its date', () => {
    const facts = [fact('F1', 'Recent transaction 2026-06-01', 'sell 0.1 BTC worth $7,359.87', [0.1, 7359.87])];
    const r = {
      summary: [{ text: 'On 2026-06-01, 0.1 BTC was sold for $7,359.87.', kind: 'FACT' as const, evidence: ['F1'] }],
      performance: [], concentration: [], transactions: [], risk: [], notableChanges: [], attention: [],
    };
    assert.equal(groundStatements(r, facts).rejected.length, 0);
  });
});
