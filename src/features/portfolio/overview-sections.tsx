import Link from 'next/link';
import { Block, BlockHead } from '@/components/ui/block';
import { Badge } from '@/components/ui/badge';
import { ShareBars, SignedBars } from '@/components/data/bars';
import { formatDate, formatQuantity, formatUsd, formatPrice } from '@/lib/format';
import { CHAINS } from '@/lib/portfolio/chains';
import type { PortfolioOverview } from '@/server/portfolio/service';
import type { Position, PositionFlag } from '@/lib/portfolio/types';
import { cn } from '@/lib/utils';

const FLAG_TEXT: Record<PositionFlag, string> = {
  UNKNOWN_COST_BASIS: 'Some units have no known cost',
  INSUFFICIENT_HISTORY: 'More was disposed than the imported history holds',
  UNPRICED_DISPOSAL: 'A disposal has no price',
  NO_CURRENT_PRICE: 'No current price',
};

function chainLabel(c: string) {
  return c === 'OFF_CHAIN' ? 'Manual' : CHAINS[c as keyof typeof CHAINS].label;
}

function Signed({ value, className }: { value: number | null; className?: string }) {
  if (value === null) return <span className={cn('text-ink-ghost', className)}>—</span>;
  return (
    <span className={cn(value > 0 ? 'text-up' : value < 0 ? 'text-down' : 'text-ink-dim', className)}>
      {formatUsd(value, { signed: true })}
    </span>
  );
}

export function Kpis({ overview }: { overview: PortfolioOverview }) {
  const t = overview.totals;
  const items: Array<{ label: string; value: React.ReactNode; note: string }> = [
    { label: 'Invested capital', value: formatUsd(t.investedCapital), note: 'Cost basis of current holdings' },
    { label: 'Realized PnL', value: <Signed value={t.realizedPnl} />, note: 'Booked on sales, swaps and fees' },
    { label: 'Unrealized PnL', value: <Signed value={t.unrealizedPnl} />, note: 'Known-cost units at current price' },
    { label: 'Total PnL', value: <Signed value={t.totalPnl} />, note: 'Realized + unrealized' },
    {
      label: 'PnL %',
      value:
        t.pnlPct === null ? (
          <span className="text-ink-ghost">—</span>
        ) : (
          <span className={t.pnlPct >= 0 ? 'text-up' : 'text-down'}>{`${t.pnlPct > 0 ? '+' : ''}${t.pnlPct.toFixed(2)}%`}</span>
        ),
      note: 'Total PnL ÷ all known acquisition cost',
    },
  ];

  return (
    <section className="flex flex-col gap-8 border-b border-line pb-10 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
      <div className="flex flex-col gap-3">
        <h2 className="t-micro">Total portfolio value</h2>
        <span className="t-figure-hero" data-testid="total-value">{formatUsd(t.totalValue)}</span>
        <span className="t-micro-tight text-ink-ghost">
          {t.positionsCount} open {t.positionsCount === 1 ? 'position' : 'positions'} · priced holdings only
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 xl:grid-cols-5 lg:gap-x-10">
        {items.map((i) => (
          <div key={i.label} className="flex flex-col gap-1.5">
            <dt className="t-micro">{i.label}</dt>
            <dd className="t-figure">{i.value}</dd>
            <span className="text-[0.6875rem] leading-snug text-ink-ghost">{i.note}</span>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function DataNotices({ overview }: { overview: PortfolioOverview }) {
  const t = overview.totals;
  const notes: React.ReactNode[] = [];
  if (overview.reviewCount) {
    notes.push(
      <>
        {overview.reviewCount} {overview.reviewCount === 1 ? 'transaction needs' : 'transactions need'} review.{' '}
        <Link href="/portfolio/transactions?review=1" className="text-signal underline-offset-4 hover:underline">
          Review now
        </Link>
      </>
    );
  }
  if (t.unknownCostValue > 0) {
    notes.push(
      `${formatUsd(t.unknownCostValue)} of holdings came in by transfer with no known cost. They count toward value but are excluded from PnL until classified.`
    );
  }
  if (t.unpricedPositions) {
    notes.push(`${t.unpricedPositions} ${t.unpricedPositions === 1 ? 'position has' : 'positions have'} no current market price and ${t.unpricedPositions === 1 ? 'is' : 'are'} excluded from the total.`);
  }
  if (overview.pendingQuotes) {
    notes.push(
      `Prices for ${overview.pendingQuotes} ${overview.pendingQuotes === 1 ? 'asset' : 'assets'} could not be fetched yet, so the total above excludes them for now. They are retried automatically.`
    );
  }
  if (overview.staleQuotes) {
    notes.push(`${overview.staleQuotes} ${overview.staleQuotes === 1 ? 'price is' : 'prices are'} more than an hour old.`);
  }
  for (const r of overview.reconciliation.slice(0, 4)) {
    notes.push(
      `${r.symbol} in ${r.walletLabel} (${CHAINS[r.chain].label}): imported history implies ${formatQuantity(r.ledgerQuantity)}, the chain reports ${formatQuantity(r.chainQuantity)}. History may be incomplete or include movements the provider does not report.`
    );
  }
  if (!notes.length) return null;

  return (
    <aside className="mt-8 flex flex-col gap-2 border-l-2 border-caution/60 pl-5" aria-label="Data quality">
      <span className="t-micro text-caution">Data quality</span>
      <ul className="flex flex-col gap-1.5">
        {notes.map((n, i) => (
          <li key={i} className="text-[0.8125rem] leading-relaxed text-ink-dim">
            {n}
          </li>
        ))}
      </ul>
    </aside>
  );
}

/**
 * A position with nothing to show beyond its quantity: no current price,
 * no known cost, nothing realized. In practice these are airdropped
 * tokens, and a wallet can hold hundreds.
 */
function isQuantityOnly(p: Position): boolean {
  return p.currentPrice === null && p.investedCapital === 0 && p.realizedPnl === 0;
}

export function PositionsTable({ positions }: { positions: Position[] }) {
  // Quantity-only holdings are listed compactly below the table rather
  // than as full rows of dashes — the same data, a fraction of the markup
  // (they were ~90% of the page for a spam-heavy wallet).
  const full = positions.filter((p) => !isQuantityOnly(p));
  const quantityOnly = positions.filter(isQuantityOnly);
  return (
    <>
      <PositionsGrid positions={full} />
      {quantityOnly.length > 0 && (
        <details className="mt-4 text-[0.8125rem]" data-testid="unpriced-holdings">
          <summary className="t-micro-tight cursor-pointer select-none text-ink-faint hover:text-ink">
            {quantityOnly.length} {quantityOnly.length === 1 ? 'holding' : 'holdings'} without a market price or known cost
          </summary>
          <p className="mt-2 max-w-[44rem] text-[0.75rem] text-ink-ghost">
            No provider prices these tokens, so they are excluded from value, allocation and PnL. Unsolicited airdrops are
            common among them.
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1 font-mono text-[0.75rem] text-ink-faint sm:grid-cols-2 lg:grid-cols-3">
            {quantityOnly.map((p) => (
              <li key={p.assetKey} className="flex justify-between gap-3 border-b border-line-faint py-1" title={p.name ?? p.symbol}>
                <span className="truncate">
                  {p.symbol} <span className="text-ink-ghost">{p.chains.map((c) => chainLabel(c.chain)).join(' · ')}</span>
                </span>
                <span className="tabular-nums">{formatQuantity(p.quantity)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function PositionsGrid({ positions }: { positions: Position[] }) {
  return (
    <Block>
      <BlockHead label="Positions" aside={<span className="t-micro-tight text-ink-ghost">Weighted-average cost</span>} />
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[56rem] text-left text-[0.8125rem]" data-testid="positions-table">
          <thead>
            <tr className="border-b border-line">
              {['Asset', 'Quantity', 'Avg cost', 'Price', 'Value', 'Invested', 'Unrealized', 'Realized', 'PnL %', 'Alloc.'].map((h, i) => (
                <th key={h} className={cn('t-micro-tight py-3 pr-4 font-normal', i > 0 && 'text-right')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.assetKey} className={cn('border-b border-line-faint align-top', p.quantity === 0 && 'text-ink-ghost')}>
                <td className="py-3 pr-4">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-ink">{p.symbol}</span>
                    <span className="text-[0.6875rem] text-ink-ghost">
                      {p.quantity === 0 ? 'Closed' : p.chains.map((c) => chainLabel(c.chain)).join(' · ')}
                    </span>
                    {p.flags.length > 0 && (
                      <span className="flex flex-wrap gap-1">
                        {p.flags.map((f) => (
                          <Badge key={f} tone="caution" title={FLAG_TEXT[f]}>
                            {FLAG_TEXT[f]}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 pr-4 text-right font-mono tabular-nums">
                  {formatQuantity(p.quantity)}
                  {p.unknownCostQuantity > 0 && p.quantity > 0 && (
                    <div className="text-[0.6875rem] text-ink-ghost">{formatQuantity(p.unknownCostQuantity)} no cost</div>
                  )}
                </td>
                <td className="py-3 pr-4 text-right font-mono tabular-nums">{p.averageCost !== null ? formatPrice(p.averageCost) : '—'}</td>
                <td className="py-3 pr-4 text-right font-mono tabular-nums">
                  {p.currentPrice !== null ? formatPrice(p.currentPrice) : '—'}
                </td>
                <td className="py-3 pr-4 text-right font-mono tabular-nums text-ink">{p.marketValue !== null ? formatUsd(p.marketValue) : '—'}</td>
                <td className="py-3 pr-4 text-right font-mono tabular-nums">{formatUsd(p.investedCapital)}</td>
                <td className="py-3 pr-4 text-right font-mono tabular-nums"><Signed value={p.unrealizedPnl} /></td>
                <td className="py-3 pr-4 text-right font-mono tabular-nums"><Signed value={p.realizedPnl} /></td>
                <td className="py-3 pr-4 text-right font-mono tabular-nums">
                  {p.pnlPct === null ? '—' : <span className={p.pnlPct >= 0 ? 'text-up' : 'text-down'}>{`${p.pnlPct > 0 ? '+' : ''}${p.pnlPct.toFixed(2)}%`}</span>}
                </td>
                <td className="py-3 text-right font-mono tabular-nums">{p.allocationPct !== null ? `${p.allocationPct.toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Block>
  );
}

export function AllocationBlocks({ overview }: { overview: PortfolioOverview }) {
  const byAsset = overview.positions
    .filter((p) => p.allocationPct !== null && p.allocationPct > 0)
    .map((p) => ({ key: p.assetKey, label: p.symbol, pct: p.allocationPct as number, mv: p.marketValue ?? 0 }));

  // Beyond eight rows the tail folds into "Other" rather than a longer list.
  const head = byAsset.slice(0, 8);
  const tail = byAsset.slice(8);
  if (tail.length) {
    head.push({
      key: 'other',
      label: `Other (${tail.length})`,
      pct: tail.reduce((s, r) => s + r.pct, 0),
      mv: tail.reduce((s, r) => s + r.mv, 0),
    });
  }
  const assetRows = head.map(({ mv, ...r }) => ({ ...r, value: formatUsd(mv) }));

  const pnl = overview.positions
    .filter((p) => p.totalPnl !== null && Math.abs(p.totalPnl) >= 0.01)
    .sort((a, b) => (b.totalPnl as number) - (a.totalPnl as number))
    .slice(0, 10)
    .map((p) => ({ key: p.assetKey, label: p.symbol, value: p.totalPnl as number }));

  return (
    <div className="grid grid-cols-1 gap-x-12 gap-y-12 lg:grid-cols-3">
      <Block>
        <BlockHead label="Allocation by asset" />
        <ShareBars className="mt-5" rows={assetRows} emptyText="No priced holdings." />
      </Block>
      <Block>
        <BlockHead label="Allocation by chain" />
        <ShareBars
          className="mt-5"
          rows={overview.allocationByChain.map((c) => ({
            key: c.chain,
            label: chainLabel(c.chain),
            pct: c.pct,
            value: formatUsd(c.marketValue),
          }))}
          emptyText="No priced holdings."
        />
      </Block>
      <Block>
        <BlockHead label="Total PnL by position" />
        <SignedBars className="mt-5" rows={pnl} format={(n) => formatUsd(n, { signed: true })} />
      </Block>
    </div>
  );
}

export function SinceLine({ overview }: { overview: PortfolioOverview }) {
  const quoteTimes = Object.values(overview.prices).map((q) => Date.parse(q.asOf)).filter(Number.isFinite);
  const newest = quoteTimes.length ? new Date(Math.max(...quoteTimes)) : null;
  return (
    <p className="t-micro-tight text-ink-ghost">
      {overview.since ? `History since ${formatDate(overview.since)}` : 'No history yet'} · {overview.wallets}{' '}
      {overview.wallets === 1 ? 'wallet' : 'wallets'}
      {newest ? ` · prices as of ${newest.toISOString().slice(11, 16)} UTC (CoinGecko, Alchemy)` : ''}
    </p>
  );
}
