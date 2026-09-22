import type { LedgerLeg, TxType } from '@/lib/portfolio/types';
import type { ChainId } from '@/lib/portfolio/chains';

let seq = 0;

export const DAY = 86_400_000;
export const T0 = Date.UTC(2026, 0, 1);

/** Terse ledger-leg factory for engine tests. */
export function leg(
  type: TxType,
  assetKey: string,
  amount: number,
  usdValue: number | null,
  opts: Partial<LedgerLeg> & { day?: number } = {}
): LedgerLeg {
  const inbound: TxType[] = ['BUY', 'TRANSFER_IN', 'UNSTAKE'];
  const direction = opts.direction ?? (inbound.includes(type) ? 1 : -1);
  const id = opts.id ?? `leg-${++seq}`;
  return {
    id,
    groupId: opts.groupId ?? id,
    timestamp: opts.timestamp ?? T0 + (opts.day ?? 0) * DAY,
    assetKey,
    symbol: opts.symbol ?? assetKey.replace(/^sym:/, '').split(':').pop()!,
    name: opts.name ?? null,
    chain: (opts.chain ?? null) as ChainId | null,
    walletId: opts.walletId ?? null,
    amount,
    direction,
    type,
    usdValue,
    isInternal: opts.isInternal ?? false,
    status: opts.status ?? 'CONFIRMED',
  };
}

export function prices(entries: Record<string, number>) {
  return new Map(
    Object.entries(entries).map(([k, price]) => [k, { price, asOf: '2026-01-01T00:00:00Z', source: 'test' }])
  );
}

export const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;
