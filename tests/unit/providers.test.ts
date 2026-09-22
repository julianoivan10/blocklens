import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { ResendEmailService } from '@/services/email/resend';
import { GeminiClient } from '@/services/ai/gemini';
import { AlchemyEvmProvider } from '@/services/chains/alchemy-evm';
import { AlchemySolanaProvider } from '@/services/chains/alchemy-solana';
import { classifyTransaction } from '@/lib/portfolio/normalize';

/**
 * Provider adapters against mocked HTTP. No network: each test installs
 * a fetch stub that answers the way the real provider does.
 */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

type Handler = (url: string, init: RequestInit) => unknown | Promise<unknown>;
function mockFetch(handler: Handler, calls: Array<{ url: string; body: unknown }> = []) {
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    const out = await handler(url, init);
    if (out instanceof Response) return out;
    return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return calls;
}

describe('Resend adapter', () => {
  const message = { to: 'a@b.test', subject: 's', html: '<p>h</p>', text: 't' };

  it('reports an API rejection as a failure — the SDK does not throw', async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({ statusCode: 403, name: 'validation_error', message: 'The blocklens.app domain is not verified.' }),
          { status: 403, headers: { 'content-type': 'application/json' } }
        )
    );
    const result = await new ResendEmailService('re_test', 'noreply@blocklens.app').send(message);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.systemic, true);
      assert.match(result.error, /not verified/);
    }
  });

  it('reports success with the message id', async () => {
    const calls = mockFetch(() => ({ id: 'email_123' }));
    const result = await new ResendEmailService('re_test', 'BlockLens <onboarding@resend.dev>').send(message);
    assert.deepEqual(result, { success: true, id: 'email_123' });
    const sent = calls[0].body as { from: string; text: string };
    assert.equal(sent.from, 'BlockLens <onboarding@resend.dev>');
    assert.equal(sent.text, 't', 'plain-text part is always sent');
  });

  it('treats a network failure as non-systemic', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const result = await new ResendEmailService('re_test', 'x@y.test').send(message);
    assert.equal(result.success, false);
  });
});

describe('Gemini client', () => {
  const validator = z.object({ summary: z.string().min(3) });
  const req = {
    system: 'sys',
    prompt: 'p',
    jsonSchema: { type: 'object' },
    validator,
    config: { temperature: 0.2, maxOutputTokens: 100, timeoutMs: 5_000, retries: 2 },
  };
  const reply = (text: string) => ({
    candidates: [{ content: { parts: [{ text }], role: 'model' }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3 },
  });

  it('returns validated structured output and sends the configured model', async () => {
    const calls = mockFetch(() => reply('{"summary":"All good"}'));
    const out = await new GeminiClient('k', 'gemini-test-model').generateStructured(req);
    assert.deepEqual(out.data, { summary: 'All good' });
    assert.match(calls[0].url, /gemini-test-model:generateContent/);
    const body = calls[0].body as { generationConfig: { responseMimeType: string } };
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
  });

  it('rejects output that fails the schema, without retrying', async () => {
    const calls = mockFetch(() => reply('{"summary":1}'));
    await assert.rejects(new GeminiClient('k', 'm').generateStructured(req), /schema validation/);
    assert.equal(calls.length, 1);
  });

  it('retries a 503 and then succeeds', async () => {
    let n = 0;
    const calls = mockFetch(() =>
      n++ === 0
        ? new Response(JSON.stringify({ error: { code: 503, message: 'high demand', status: 'UNAVAILABLE' } }), { status: 503 })
        : reply('{"summary":"Recovered"}')
    );
    const out = await new GeminiClient('k', 'm').generateStructured(req);
    assert.equal(out.data.summary, 'Recovered');
    assert.equal(calls.length, 2);
  });
});

describe('EVM chain provider', () => {
  const W = '0x1111111111111111111111111111111111111111';
  const ROUTER = '0x9999999999999999999999999999999999999999';
  const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

  it('turns transfers and receipts into whole transactions with fees', async () => {
    mockFetch((_url, init) => {
      const body = JSON.parse(String(init.body));
      if (Array.isArray(body)) {
        // Receipt batch
        return body.map((c: { id: number }) => ({
          id: c.id,
          result: { transactionHash: '0xswap', from: W, to: ROUTER, status: '0x1', gasUsed: '0x5208', effectiveGasPrice: '0x3b9aca00', l1Fee: '0x0' },
        }));
      }
      const [params] = body.params;
      if (body.method === 'alchemy_getAssetTransfers') {
        const ts = { blockTimestamp: '2026-01-02T00:00:00.000Z' };
        if (params.fromAddress) {
          return { result: { transfers: [{ blockNum: '0x10', uniqueId: '0xswap:external', hash: '0xswap', from: W, to: ROUTER, value: 1, asset: 'ETH', category: 'external', rawContract: { value: '0xde0b6b3a7640000', address: null, decimal: '0x12' }, metadata: ts }] } };
        }
        return { result: { transfers: [{ blockNum: '0x10', uniqueId: '0xswap:log:3', hash: '0xswap', from: ROUTER, to: W, value: 2500, asset: 'USDC', category: 'erc20', rawContract: { value: '0x9502f900', address: USDC, decimal: '0x6' }, metadata: ts }] } };
      }
      if (body.method === 'alchemy_getTokenMetadata') return { result: { decimals: 6, name: 'USD Coin', symbol: 'USDC' } };
      throw new Error(`unexpected ${body.method}`);
    });

    const provider = new AlchemyEvmProvider('BASE', 'key');
    const page = await provider.getHistory(W, null, 2);
    assert.equal(page.complete, true);
    assert.equal(page.transactions.length, 1);
    const tx = page.transactions[0];
    assert.equal(tx.movements.length, 2);
    assert.ok(Math.abs((tx.fee ?? 0) - 21000 * 1e-9) < 1e-15, 'fee = gasUsed × effectiveGasPrice');

    const legs = classifyTransaction(tx, new Set([W]), (k) => (k === 'sym:ETH' ? { price: 2500, source: 't' } : { price: 1, source: 't' }));
    assert.deepEqual(legs.map((l) => l.type).sort(), ['FEE', 'SWAP', 'SWAP']);
    assert.equal(legs.find((l) => l.symbol === 'USDC')!.amount, 2500);
    assert.deepEqual(page.cursor, { fromBlock: '0x10' });
  });
});

describe('Solana chain provider', () => {
  const W = 'vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg';
  const OTHER = 'So1ana1111111111111111111111111111111111111';
  const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  it('derives movements from pre/post balances and attributes the fee', () => {
    const provider = new AlchemySolanaProvider('key');
    const raw = provider.toRaw(W, 'sig1', {
      blockTime: 1_780_000_000,
      meta: {
        err: null,
        fee: 5000,
        preBalances: [2_000_005_000, 0],
        postBalances: [1_000_000_000, 1_000_000_000],
        preTokenBalances: [
          { accountIndex: 2, mint: USDC, owner: OTHER, uiTokenAmount: { amount: '150000000', decimals: 6 } },
        ],
        postTokenBalances: [
          { accountIndex: 2, mint: USDC, owner: OTHER, uiTokenAmount: { amount: '0', decimals: 6 } },
          { accountIndex: 3, mint: USDC, owner: W, uiTokenAmount: { amount: '150000000', decimals: 6 } },
        ],
      },
      transaction: {
        signatures: ['sig1'],
        message: {
          accountKeys: [
            { pubkey: W, signer: true, writable: true },
            { pubkey: OTHER, signer: false, writable: true },
          ],
          instructions: [{ programId: '11111111111111111111111111111111', program: 'system', parsed: { type: 'transfer', info: { source: W, destination: OTHER, lamports: 1e9 } } }],
        },
      },
    });

    assert.ok(raw);
    assert.equal(raw!.fee, 0.000005);
    const sol = raw!.movements.find((m) => m.symbol === 'SOL')!;
    assert.equal(sol.amount, -1, 'fee is separated from the transfer amount');
    assert.equal(sol.counterparty, OTHER);
    const usdc = raw!.movements.find((m) => m.symbol === 'USDC')!;
    assert.equal(usdc.amount, 150);
    assert.equal(usdc.counterparty, OTHER);
  });
});
