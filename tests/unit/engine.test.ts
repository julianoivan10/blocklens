import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPools, valuePortfolio } from '@/lib/portfolio/engine';
import { close, leg, prices } from './helpers';

const value = (legs: Parameters<typeof buildPools>[0], p: Record<string, number>) =>
  valuePortfolio(buildPools(legs), prices(p));

describe('cost basis — weighted average', () => {
  it('averages the cost of successive buys', () => {
    const { positions } = value(
      [leg('BUY', 'sym:ETH', 1, 1000, { day: 0 }), leg('BUY', 'sym:ETH', 1, 3000, { day: 1 })],
      { 'sym:ETH': 2500 }
    );
    const eth = positions[0];
    assert.equal(eth.quantity, 2);
    assert.equal(eth.averageCost, 2000);
    assert.equal(eth.investedCapital, 4000);
    assert.equal(eth.marketValue, 5000);
    assert.equal(eth.unrealizedPnl, 1000);
    assert.equal(eth.realizedPnl, 0);
    assert.equal(eth.totalPnl, 1000);
    assert.equal(eth.pnlPct, 25);
  });

  it('realizes PnL on a sale against average cost and keeps the average of what remains', () => {
    const { positions, totals } = value(
      [
        leg('BUY', 'sym:ETH', 1, 1000, { day: 0 }),
        leg('BUY', 'sym:ETH', 1, 3000, { day: 1 }),
        leg('SELL', 'sym:ETH', 0.5, 1500, { day: 2 }),
      ],
      { 'sym:ETH': 3000 }
    );
    const eth = positions[0];
    assert.equal(eth.quantity, 1.5);
    assert.equal(eth.averageCost, 2000, 'average cost is unchanged by a disposal');
    assert.equal(eth.investedCapital, 3000);
    assert.equal(eth.realizedPnl, 500, '1500 proceeds − 0.5 × 2000 cost');
    assert.equal(eth.unrealizedPnl, 1500, '1.5 × 3000 − 3000');
    assert.equal(totals.totalPnl, 2000);
    assert.equal(totals.pnlPct, 50, '2000 / 4000 gross invested');
  });

  it('keeps realized PnL on a fully closed position', () => {
    const { positions, totals } = value(
      [leg('BUY', 'sym:SOL', 10, 1000, { day: 0 }), leg('SELL', 'sym:SOL', 10, 800, { day: 1 })],
      { 'sym:SOL': 150 }
    );
    assert.equal(positions.length, 1);
    assert.equal(positions[0].quantity, 0);
    assert.equal(positions[0].realizedPnl, -200);
    assert.equal(positions[0].totalPnl, -200);
    assert.equal(totals.totalValue, 0);
    assert.equal(totals.positionsCount, 0);
  });
});

describe('transfers are not trades', () => {
  it('does not treat an external incoming transfer as a purchase', () => {
    const { positions, totals } = value([leg('TRANSFER_IN', 'sym:ETH', 2, 5000)], { 'sym:ETH': 3000 });
    const eth = positions[0];
    assert.equal(eth.quantity, 2);
    assert.equal(eth.knownQuantity, 0);
    assert.equal(eth.investedCapital, 0, 'no invented cost');
    assert.equal(eth.averageCost, null);
    assert.equal(eth.unrealizedPnl, 0, 'units without cost are excluded from unrealized PnL');
    assert.ok(eth.flags.includes('UNKNOWN_COST_BASIS'));
    assert.equal(totals.unknownCostValue, 6000);
    assert.equal(totals.pnlPct, null, 'no known cost → no percentage');
  });

  it('does not realize PnL on an external transfer out', () => {
    const { positions } = value(
      [leg('BUY', 'sym:ETH', 2, 2000, { day: 0 }), leg('TRANSFER_OUT', 'sym:ETH', 1, 3000, { day: 1 })],
      { 'sym:ETH': 3000 }
    );
    const eth = positions[0];
    assert.equal(eth.realizedPnl, 0);
    assert.equal(eth.quantity, 1);
    assert.equal(eth.investedCapital, 1000, 'cost leaves with the units');
    assert.equal(eth.averageCost, 1000);
  });

  it('ignores transfers between the user’s own wallets for cost basis', () => {
    const { positions } = value(
      [
        leg('BUY', 'sym:ETH', 1, 2000, { day: 0, chain: 'ETHEREUM' }),
        leg('TRANSFER_OUT', 'sym:ETH', 0.4, null, { day: 1, chain: 'ETHEREUM', isInternal: true }),
        leg('TRANSFER_IN', 'sym:ETH', 0.4, null, { day: 1, chain: 'BASE', isInternal: true }),
      ],
      { 'sym:ETH': 2000 }
    );
    const eth = positions[0];
    assert.equal(eth.quantity, 1);
    assert.equal(eth.knownQuantity, 1);
    assert.equal(eth.investedCapital, 2000);
    assert.equal(eth.realizedPnl, 0);
    assert.deepEqual(eth.flags, []);
    const byChain = Object.fromEntries(eth.chains.map((c) => [c.chain, c.quantity]));
    assert.ok(close(byChain.ETHEREUM, 0.6));
    assert.ok(close(byChain.BASE, 0.4));
  });
});

describe('swaps and fees', () => {
  it('realizes PnL on the outgoing leg and books the incoming leg at the swap value', () => {
    const { positions } = value(
      [
        leg('BUY', 'sym:ETH', 1, 2000, { day: 0 }),
        leg('SWAP', 'sym:ETH', 1, 3000, { day: 1, groupId: 'g1', direction: -1 }),
        leg('SWAP', 'erc20:ETHEREUM:0xusdc', 3000, 3000, { day: 1, groupId: 'g1', direction: 1, symbol: 'USDC' }),
      ],
      { 'sym:ETH': 3000, 'erc20:ETHEREUM:0xusdc': 1 }
    );
    const eth = positions.find((p) => p.symbol === 'ETH')!;
    const usdc = positions.find((p) => p.symbol === 'USDC')!;
    assert.equal(eth.realizedPnl, 1000);
    assert.equal(eth.quantity, 0);
    assert.equal(usdc.averageCost, 1);
    assert.equal(usdc.investedCapital, 3000);
  });

  it('books a network fee as a disposal at zero proceeds', () => {
    const { positions, totals } = value(
      [leg('BUY', 'sym:ETH', 1, 2000, { day: 0 }), leg('FEE', 'sym:ETH', 0.01, 30, { day: 1 })],
      { 'sym:ETH': 2000 }
    );
    const eth = positions[0];
    assert.ok(close(eth.quantity, 0.99));
    assert.ok(close(eth.realizedPnl, -20), 'fee units cost 0.01 × 2000');
    assert.ok(close(eth.investedCapital, 1980));
    assert.ok(close(totals.feesCost, 20));
  });

  it('counts only the fee of a failed transaction', () => {
    const { positions } = value(
      [
        leg('BUY', 'sym:ETH', 1, 2000, { day: 0 }),
        leg('TRANSFER_OUT', 'sym:ETH', 0.5, null, { day: 1, status: 'FAILED' }),
        leg('FEE', 'sym:ETH', 0.01, null, { day: 1, status: 'FAILED' }),
      ],
      { 'sym:ETH': 2000 }
    );
    assert.ok(close(positions[0].quantity, 0.99));
  });

  it('flags a disposal of more than the ledger ever held', () => {
    const { positions } = value(
      [leg('BUY', 'sym:ETH', 1, 2000, { day: 0 }), leg('SELL', 'sym:ETH', 1.5, 4500, { day: 1 })],
      { 'sym:ETH': 3000 }
    );
    const eth = positions[0];
    assert.ok(eth.flags.includes('INSUFFICIENT_HISTORY'));
    assert.equal(eth.quantity, 0);
    assert.equal(eth.realizedPnl, 1000, 'only the known unit realizes: 3000 of proceeds − 2000');
  });

  it('flags an unpriced sale instead of inventing proceeds', () => {
    const { positions } = value(
      [leg('BUY', 'sym:ETH', 1, 2000, { day: 0 }), leg('SELL', 'sym:ETH', 0.5, null, { day: 1 })],
      { 'sym:ETH': 3000 }
    );
    assert.ok(positions[0].flags.includes('UNPRICED_DISPOSAL'));
    assert.equal(positions[0].realizedPnl, 0);
  });

  it('treats STAKE and UNSTAKE as custody moves, not disposals', () => {
    const { positions } = value(
      [
        leg('BUY', 'sym:ETH', 2, 4000, { day: 0 }),
        leg('STAKE', 'sym:ETH', 1, null, { day: 1 }),
        leg('UNSTAKE', 'sym:ETH', 1, null, { day: 2 }),
      ],
      { 'sym:ETH': 2000 }
    );
    assert.equal(positions[0].quantity, 2);
    assert.equal(positions[0].realizedPnl, 0);
  });
});

describe('allocation and pricing', () => {
  it('computes allocation over priced positions and never prices a missing quote', () => {
    const { positions, totals } = value(
      [
        leg('BUY', 'sym:BTC', 1, 50000),
        leg('BUY', 'sym:ETH', 10, 20000),
        leg('TRANSFER_IN', 'erc20:BASE:0xspam', 1_000_000, null, { symbol: 'SPAM' }),
      ],
      { 'sym:BTC': 60000, 'sym:ETH': 4000 }
    );
    const bySym = Object.fromEntries(positions.map((p) => [p.symbol, p]));
    assert.equal(bySym.BTC.allocationPct, 60);
    assert.equal(bySym.ETH.allocationPct, 40);
    assert.equal(bySym.SPAM.marketValue, null);
    assert.equal(bySym.SPAM.allocationPct, null);
    assert.ok(bySym.SPAM.flags.includes('NO_CURRENT_PRICE'));
    assert.equal(totals.totalValue, 100000);
    assert.equal(totals.unpricedPositions, 1);
    const sum = positions.reduce((s, p) => s + (p.allocationPct ?? 0), 0);
    assert.ok(close(sum, 100));
  });

  it('is deterministic regardless of input order', () => {
    const legs = [
      leg('BUY', 'sym:ETH', 1, 1000, { day: 0 }),
      leg('SELL', 'sym:ETH', 0.3, 900, { day: 2 }),
      leg('BUY', 'sym:ETH', 2, 5000, { day: 1 }),
    ];
    const a = value(legs, { 'sym:ETH': 2500 });
    const b = value([...legs].reverse(), { 'sym:ETH': 2500 });
    assert.deepEqual(a, b);
  });
});
