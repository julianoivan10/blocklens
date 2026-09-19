import { AssetMark } from '@/components/data/asset-mark';
import { Delta } from '@/components/data/delta';
import { Container } from '@/components/ui/section';
import { WatchlistToggle } from './watchlist-toggle';
import { formatCompactCurrency, formatPrice, formatShare } from '@/lib/format';
import type { TokenOverview } from '@/types';

/**
 * The dossier masthead.
 *
 * Identity on the left in the display serif, the reading on the right
 * at figure scale, and four supporting figures on a rule beneath —
 * typography and alignment carrying the hierarchy instead of four
 * bordered metric tiles.
 */
export function ResearchHeader({
  token,
  isWatched,
}: {
  token: TokenOverview;
  isWatched: boolean;
}) {
  const supplyShare =
    token.maxSupply && token.maxSupply > 0
      ? formatShare((token.circulatingSupply / token.maxSupply) * 100)
      : '—';

  const figures = [
    { label: 'Market cap', value: formatCompactCurrency(token.marketCap) },
    { label: '24h volume', value: formatCompactCurrency(token.totalVolume) },
    { label: 'Circulating', value: supplyShare },
    {
      label: 'From all-time high',
      value: formatShare(((token.currentPrice - token.ath) / token.ath) * 100),
    },
  ];

  return (
    <header className="border-b border-line">
      <Container className="pb-8 pt-8 sm:pt-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
          <div className="flex items-start gap-5">
            <AssetMark symbol={token.symbol} size="lg" />

            <div className="flex min-w-0 flex-col gap-3">
              <h1 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] leading-none tracking-[-0.02em] text-ink">
                {token.name}
              </h1>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="t-micro-tight text-ink-dim">{token.symbol}</span>
                <span aria-hidden="true" className="h-2.5 w-px bg-line-strong" />
                <span className="t-micro-tight">Rank {token.marketCapRank}</span>
                {token.categories?.length ? (
                  <>
                    <span aria-hidden="true" className="h-2.5 w-px bg-line-strong" />
                    <span className="t-micro-tight text-ink-ghost">
                      {token.categories.join(' · ')}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:items-end">
            <div className="flex flex-wrap items-baseline gap-4">
              <span className="t-figure-lg">{formatPrice(token.currentPrice)}</span>
              <Delta value={token.priceChangePercentage24h} size="lg" />
            </div>

            <div className="flex items-center gap-3">
              <span className="t-micro-tight text-ink-ghost">24h</span>
              <WatchlistToggle
                symbol={token.symbol}
                name={token.name}
                initiallyWatched={isWatched}
              />
            </div>
          </div>
        </div>

        <dl className="mt-10 grid grid-cols-2 border-t border-line-faint pt-6 sm:grid-cols-4">
          {figures.map((f, i) => (
            <div
              key={f.label}
              className={[
                'flex flex-col gap-2 border-line-faint',
                i % 2 === 1 ? 'border-l pl-6' : 'pr-6',
                i < 2 ? 'pb-5 sm:pb-0' : 'pt-5 sm:pt-0',
                i > 0 ? 'sm:border-l sm:pl-6' : 'sm:border-l-0',
              ].join(' ')}
            >
              <dt className="t-micro">{f.label}</dt>
              <dd className="t-figure">{f.value}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </header>
  );
}
