import { Delta } from '@/components/data/delta';
import { ErrorState } from '@/components/ui/block';
import { getMarketOverviewResult } from '@/server/data/market';
import { isOk } from '@/services/result';
import { formatCompactCurrency, formatShare } from '@/lib/format';

/**
 * The figure the workspace leads with.
 *
 * Total market capitalisation is set at hero scale with its change
 * beside it; everything else in the readout is small. That contrast is
 * the hierarchy — previously this was four identical KPI cards, which
 * told the reader nothing about what mattered most.
 *
 * When the provider is unreachable the block says so. It never falls
 * back to a remembered or sample figure — a stale market cap presented
 * as current is worse than no market cap.
 */
export async function MarketContext() {
  const result = await getMarketOverviewResult();

  if (!isOk(result)) {
    return (
      <section className="border-b border-line pb-10">
        <ErrorState
          title="Market data temporarily unavailable"
          description="The market data provider did not respond. Your watchlist and the rest of this page are unaffected."
        />
      </section>
    );
  }

  const market = result.data;

  const secondary = [
    { label: '24h volume', value: formatCompactCurrency(market.totalVolume24h) },
    { label: 'BTC dominance', value: formatShare(market.btcDominance) },
    { label: 'ETH dominance', value: formatShare(market.ethDominance) },
    { label: 'Assets tracked', value: market.activeCryptocurrencies.toLocaleString('en-US') },
  ];

  return (
    <section className="flex flex-col gap-8 border-b border-line pb-10 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
      <div className="flex flex-col gap-3">
        <h2 className="t-micro">Total market capitalisation</h2>
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
          <span className="t-figure-hero">{formatCompactCurrency(market.totalMarketCap)}</span>
          <Delta value={market.marketCapChange24h} size="lg" />
        </div>
        <span className="t-micro-tight text-ink-ghost">Across all tracked assets · 24h change</span>
      </div>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4 lg:gap-x-10">
        {secondary.map((item) => (
          <div key={item.label} className="flex flex-col gap-2">
            <dt className="t-micro">{item.label}</dt>
            <dd className="t-figure text-ink-dim">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
