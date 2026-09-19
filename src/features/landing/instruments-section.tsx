import { Container, Section, SectionMark } from '@/components/ui/section';
import { Sparkline } from '@/components/data/sparkline';
import { Delta } from '@/components/data/delta';
import { getPriceSeries, getTokenSnapshot } from '@/server/data/market';
import { getOnchainService } from '@/services/onchain';
import { formatCompactCount, formatCompactCurrency, formatPrice } from '@/lib/format';
import type { OnchainMetrics } from '@/types';

/**
 * Market and chain, in one composition.
 *
 * Deliberately unbalanced: the plot is enormous and bleeds past the right
 * gutter, while the network figures beneath it are small and dense. Scale
 * does the work of hierarchy that a row of equal cards cannot.
 *
 * Every figure here is a live provider read — the market series from
 * CoinGecko, the network readings from Alchemy and DeFiLlama. Rows whose
 * provider has nothing to say are dropped rather than filled in, so this
 * section shrinks under an outage instead of lying.
 */

/** Ethereum is the network shown: it has both chain and DeFi coverage. */
const NETWORK_SYMBOL = 'ETH';

function networkRows(metrics: OnchainMetrics | null) {
  if (!metrics) return [];

  const rows: Array<{ label: string; value: string; window: string; change?: number }> = [];

  if (metrics.tvl !== undefined) {
    rows.push({
      label: 'Value locked',
      value: formatCompactCurrency(metrics.tvl),
      window: 'DeFi, current',
    });
  }
  if (metrics.fees24h !== undefined) {
    rows.push({
      label: 'Fees paid',
      value: formatCompactCurrency(metrics.fees24h),
      window: '24h',
      change: metrics.feesChange24h,
    });
  }
  if (metrics.transactionsPerBlock !== undefined) {
    rows.push({
      label: 'Transactions',
      value: formatCompactCount(metrics.transactionsPerBlock),
      window: 'per block',
    });
  }
  if (metrics.blockTime !== undefined) {
    rows.push({ label: 'Block time', value: `${metrics.blockTime}s`, window: 'recent average' });
  }
  if (rows.length < 4 && metrics.gasPriceGwei !== undefined) {
    rows.push({ label: 'Gas price', value: `${metrics.gasPriceGwei} gwei`, window: 'current' });
  }

  return rows.slice(0, 4);
}

export async function InstrumentsSection() {
  const [btc, series, network] = await Promise.all([
    getTokenSnapshot('BTC').catch(() => null),
    getPriceSeries('BTC', 90).catch(() => []),
    getOnchainService()
      .getMetrics(NETWORK_SYMBOL)
      .catch(() => null),
  ]);

  const closes = series.map((p) => p.value);
  const hasPlot = closes.length > 2;
  const low = hasPlot ? Math.min(...closes) : 0;
  const high = hasPlot ? Math.max(...closes) : 0;
  const rows = networkRows(network);

  return (
    <Section id="intelligence" className="overflow-hidden">
      <Container>
        <SectionMark index="03" label="Market and chain" />

        <div className="mt-10 grid grid-cols-1 gap-x-16 gap-y-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <h2 className="t-editorial text-ink">
              Price is one series. The chain is another.
            </h2>
            <p className="t-body mt-5">
              BlockLens puts market structure next to network activity, so a rally with no
              users behind it looks different from one with users behind it.
            </p>

            {/* The reading, stated in figures rather than in a card. */}
            {btc ? (
              <dl className="mt-10 flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <dt className="t-micro">Bitcoin · last</dt>
                  <dd className="flex items-baseline gap-3">
                    <span className="t-figure-lg">{formatPrice(btc.currentPrice)}</span>
                    <Delta value={btc.priceChangePercentage24h} />
                  </dd>
                </div>

                {hasPlot && (
                  <div className="grid grid-cols-2 gap-6 border-t border-line-faint pt-5">
                    <div className="flex flex-col gap-1.5">
                      <dt className="t-micro">90d low</dt>
                      <dd className="t-figure text-ink-dim">{formatPrice(low)}</dd>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <dt className="t-micro">90d high</dt>
                      <dd className="t-figure text-ink-dim">{formatPrice(high)}</dd>
                    </div>
                  </div>
                )}
              </dl>
            ) : (
              <p className="t-micro-tight mt-10 text-ink-ghost">
                Market data temporarily unavailable.
              </p>
            )}
          </div>

          {/* The plot bleeds past the gutter — it is the loudest object in
              the section and is not boxed. */}
          <div className="lg:col-span-8 lg:-mr-12 xl:-mr-24">
            <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
              <span className="t-micro">BTC / USD · 90 days · daily close</span>
              <span className="t-micro-tight text-ink-ghost">CoinGecko</span>
            </div>

            {hasPlot ? (
              <div className="relative">
                <Sparkline
                  values={closes}
                  width={900}
                  height={300}
                  tone="signal"
                  endMarker
                  className="h-[clamp(11rem,26vw,19rem)] w-full"
                  label={`Bitcoin daily closing price over the last 90 days, from ${formatPrice(low)} to ${formatPrice(high)}`}
                />
                {/* A baseline rather than a full grid. */}
                <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px bg-line" />
              </div>
            ) : (
              <div className="flex h-[clamp(11rem,26vw,19rem)] items-center">
                <p className="text-[0.875rem] text-ink-faint">
                  Price history temporarily unavailable.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Network readings: small, dense, divided by rules. */}
        {rows.length > 0 ? (
          <>
            <dl className="mt-16 grid grid-cols-2 border-t border-line lg:grid-cols-4">
              {rows.map((m, i) => (
                <div
                  key={m.label}
                  className={[
                    'flex flex-col gap-2 border-line-faint py-6 lg:px-8 lg:first:pl-0',
                    i % 2 === 1 ? 'border-l pl-6' : 'pr-6',
                    i < 2 ? 'border-b lg:border-b-0' : '',
                    i > 0 ? 'lg:border-l' : 'lg:border-l-0',
                  ].join(' ')}
                >
                  <dt className="t-micro">{m.label}</dt>
                  <dd className="flex flex-col gap-1.5">
                    <span className="t-figure">{m.value}</span>
                    <span className="flex items-baseline gap-2">
                      {m.change !== undefined && <Delta value={m.change} size="sm" />}
                      <span className="t-micro-tight text-ink-ghost">{m.window}</span>
                    </span>
                  </dd>
                </div>
              ))}
            </dl>

            <p className="t-micro-tight mt-5 text-ink-ghost">
              {network?.chainLabel ?? 'Ethereum'} network
              {network?.sources?.length ? ` · ${network.sources.join(' and ')}` : ''}
            </p>
          </>
        ) : (
          <p className="t-micro-tight mt-16 border-t border-line pt-6 text-ink-ghost">
            Network readings temporarily unavailable.
          </p>
        )}
      </Container>
    </Section>
  );
}
