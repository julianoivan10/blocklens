import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyTransaction, type RawTransaction } from '@/lib/portfolio/normalize';
import { looksLikeSecret, normalizeAddress } from '@/lib/portfolio/chains';

const W = '0x1111111111111111111111111111111111111111';
const OWN = '0x2222222222222222222222222222222222222222';
const STRANGER = '0x3333333333333333333333333333333333333333';
const ROUTER = '0x4444444444444444444444444444444444444444';
const own = new Set([W, OWN]);

const PRICES: Record<string, number> = { 'sym:ETH': 2000, 'erc20:ETHEREUM:0xusdc': 1 };
const priceAt = (key: string) => (PRICES[key] ? { price: PRICES[key], source: 'test' } : null);

function tx(movements: RawTransaction['movements'], extra: Partial<RawTransaction> = {}): RawTransaction {
  return {
    chain: 'ETHEREUM',
    hash: '0xabc',
    timestamp: Date.UTC(2026, 0, 1),
    wallet: W,
    failed: false,
    movements,
    fee: null,
    from: W,
    to: null,
    ...extra,
  };
}

const eth = (amount: number, counterparty: string, id = 'm1') => ({
  externalId: id,
  assetKey: 'sym:ETH',
  symbol: 'ETH',
  amount,
  counterparty,
});
const usdc = (amount: number, counterparty: string, id = 'm2') => ({
  externalId: id,
  assetKey: 'erc20:ETHEREUM:0xusdc',
  symbol: 'USDC',
  contract: '0xusdc',
  amount,
  counterparty,
});

describe('transaction classification', () => {
  it('classifies an incoming transfer from an untracked address as TRANSFER_IN and flags it', () => {
    const [l] = classifyTransaction(tx([eth(1, STRANGER)]), own, priceAt);
    assert.equal(l.type, 'TRANSFER_IN');
    assert.equal(l.isInternal, false);
    assert.equal(l.needsReview, true);
    assert.equal(l.usdValue, 2000);
    assert.notEqual(l.type, 'BUY', 'a receipt is never assumed to be a purchase');
  });

  it('marks transfers between tracked wallets as internal and does not flag them', () => {
    const [inLeg] = classifyTransaction(tx([eth(1, OWN)]), own, priceAt);
    assert.equal(inLeg.type, 'TRANSFER_IN');
    assert.equal(inLeg.isInternal, true);
    assert.equal(inLeg.needsReview, false);
    const [outLeg] = classifyTransaction(tx([eth(-1, OWN)]), own, priceAt);
    assert.equal(outLeg.type, 'TRANSFER_OUT');
    assert.equal(outLeg.isInternal, true);
  });

  it('classifies different assets in and out as a SWAP', () => {
    const legs = classifyTransaction(tx([eth(-1, ROUTER), usdc(1990, ROUTER)]), own, priceAt);
    assert.deepEqual(legs.map((l) => l.type), ['SWAP', 'SWAP']);
    assert.equal(legs.find((l) => l.direction === -1)!.usdValue, 2000);
    assert.equal(legs.find((l) => l.direction === 1)!.usdValue, 1990);
  });

  it('values an unpriced swap leg from the priced side, and says so', () => {
    const legs = classifyTransaction(
      tx([eth(-1, ROUTER), { externalId: 'm3', assetKey: 'erc20:ETHEREUM:0xnew', symbol: 'NEW', amount: 500, counterparty: ROUTER }]),
      own,
      priceAt
    );
    const got = legs.find((l) => l.symbol === 'NEW')!;
    assert.equal(got.usdValue, 2000);
    assert.equal(got.priceUsd, 4);
    assert.equal(got.priceSource, 'implied by swap counter-leg');
  });

  it('flags a swap where nothing can be priced rather than guessing', () => {
    const legs = classifyTransaction(
      tx([
        { externalId: 'a', assetKey: 'erc20:ETHEREUM:0xa', symbol: 'A', amount: -5, counterparty: ROUTER },
        { externalId: 'b', assetKey: 'erc20:ETHEREUM:0xb', symbol: 'B', amount: 7, counterparty: ROUTER },
      ]),
      own,
      priceAt
    );
    assert.ok(legs.every((l) => l.needsReview && l.usdValue === null));
  });

  it('flags same-asset in-and-out rather than inventing a purpose', () => {
    const legs = classifyTransaction(tx([eth(-1, ROUTER, 'a'), eth(0.2, ROUTER, 'b')]), own, priceAt);
    assert.deepEqual(legs.map((l) => l.type).sort(), ['TRANSFER_IN', 'TRANSFER_OUT']);
    assert.ok(legs.every((l) => l.needsReview));
  });

  it('adds a FEE leg in the gas asset when the wallet paid it', () => {
    const legs = classifyTransaction(tx([eth(-1, STRANGER)], { fee: 0.002 }), own, priceAt);
    const fee = legs.find((l) => l.type === 'FEE')!;
    assert.equal(fee.assetKey, 'sym:ETH');
    assert.equal(fee.amount, 0.002);
    assert.equal(fee.direction, -1);
    assert.equal(fee.usdValue, 4);
  });

  it('keeps only the fee of a failed transaction', () => {
    const legs = classifyTransaction(tx([eth(-1, STRANGER)], { fee: 0.001, failed: true }), own, priceAt);
    assert.equal(legs.length, 1);
    assert.equal(legs[0].type, 'FEE');
    assert.equal(legs[0].status, 'FAILED');
  });

  it('never infers BUY or SELL from chain data', () => {
    const all = [
      ...classifyTransaction(tx([eth(1, STRANGER)]), own, priceAt),
      ...classifyTransaction(tx([eth(-1, STRANGER)]), own, priceAt),
      ...classifyTransaction(tx([eth(-1, ROUTER), usdc(2000, ROUTER)]), own, priceAt),
    ];
    assert.ok(all.every((l) => l.type !== 'BUY' && l.type !== 'SELL'));
  });

  it('leaves an unpriced airdrop unflagged but unvalued', () => {
    const [l] = classifyTransaction(
      tx([{ externalId: 'x', assetKey: 'erc20:ETHEREUM:0xspam', symbol: 'SPAM', amount: 1e6, counterparty: STRANGER }]),
      own,
      priceAt
    );
    assert.equal(l.usdValue, null);
    assert.equal(l.needsReview, false);
  });
});

describe('address handling', () => {
  it('normalises EVM addresses and validates Solana ones', () => {
    assert.equal(normalizeAddress('BASE', `  ${W.toUpperCase().replace('0X', '0x')} `), W);
    assert.equal(normalizeAddress('ETHEREUM', '0x123'), null);
    assert.equal(
      normalizeAddress('SOLANA', 'vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg'),
      'vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg'
    );
    assert.equal(normalizeAddress('SOLANA', W), null);
  });

  it('recognises private keys and seed phrases so they are refused', () => {
    assert.ok(looksLikeSecret('0x' + 'ab'.repeat(32)));
    assert.ok(looksLikeSecret('ab'.repeat(32)));
    assert.ok(
      looksLikeSecret('abandon ability able about above absent absorb abstract absurd abuse access accident')
    );
    assert.ok(looksLikeSecret('[' + Array.from({ length: 64 }, (_, i) => i).join(',') + ']'));
    assert.ok(!looksLikeSecret(W));
    assert.ok(!looksLikeSecret('vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg'));
  });
});
