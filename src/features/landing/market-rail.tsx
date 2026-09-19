import Link from 'next/link';
import { Delta } from '@/components/data/delta';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES } from '@/lib/constants';
import { formatCompactCurrency, formatPrice, formatShare } from '@/lib/format';
import { getAssetRailResult, getMarketOverviewResult } from '@/server/data/market';
import { isOk } from '@/services/result';

/** Two assets, not a leaderboard. The rail is a reading, not a table. */
const RAIL_ASSETS = ['BTC', 'ETH'] as const;

/**
 * Live market intelligence, embedded in the narrative.
 *
 * Restraint is the point: four readings on one rule, typographic
 * hierarchy, no cards, no logos, no sparkline grid. It should read as a
 * figure line in a research publication rather than as a price ticker —
 * the landing page is a product story, not a markets dashboard.
 *
 * The two providers are read independently, so the asset prices and the
 * market aggregates fail separately. Whatever is unavailable says so; a
 * number is never invented to fill the space.
 */
export async function MarketRail() {
  const [assets, overview] = await Promise.all([
    getAssetRailResult(RAIL_ASSETS),
    getMarketOverviewResult(),
  ]);

  const assetRows = isOk(assets) ? assets.data : [];
  const everythingDown = !isOk(assets) && !isOk(overview);

  return (
    <div className="relative border-y border-line bg-ground/60 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-[84rem]">
        <div className="flex flex-col divide-y divide-line-faint lg:flex-row lg:divide-x lg:divide-y-0">
          {/* Label column: says what this is, once. */}
          <div className="flex items-center gap-3 px-5 py-4 sm:px-8 lg:w-56 lg:shrink-0 lg:flex-col lg:items-start lg:justify-center lg:gap-2">
            <span className="t-micro">Live market</span>
            <span className="t-micro-tight text-ink-ghost">
              {everythingDown ? 'Feed interrupted' : 'Updated continuously'}
            </span>
          </div>

          {everythingDown ? (
            <div className="flex flex-1 items-center px-5 py-5 sm:px-8">
              <p className="text-[0.875rem] text-ink-faint">
                Market data temporarily unavailable.
              </p>
            </div>
          ) : (
            <div className="grid flex-1 grid-cols-2 lg:grid-cols-4">
              {assetRows.map((asset, i) => (
                <Link
                  key={asset.id}
                  href={`${ROUTES.research}/${asset.symbol}`}
                  className={[
                    'group flex flex-col gap-2 border-line-faint px-5 py-5 transition-colors hover:bg-panel/50 sm:px-8',
                    i === 1 ? 'border-l' : '',
                    'lg:border-l-0',
                    i > 0 ? 'lg:border-l' : '',
                  ].join(' ')}
                >
                  <span className="t-micro transition-colors group-hover:text-ink-dim">
                    {asset.symbol}
                  </span>
                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="t-figure">{formatPrice(asset.currentPrice)}</span>
                    <Delta value={asset.priceChangePercentage24h} size="sm" />
                  </span>
                </Link>
              ))}

              {!isOk(assets) && (
                <div className="col-span-2 flex items-center px-5 py-5 sm:px-8">
                  <p className="text-[0.8125rem] text-ink-faint">Asset prices unavailable.</p>
                </div>
              )}

              {isOk(overview) ? (
                <>
                  <div className="flex flex-col gap-2 border-t border-line-faint px-5 py-5 sm:px-8 lg:border-l lg:border-t-0">
                    <span className="t-micro">Total market cap</span>
                    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="t-figure">
                        {formatCompactCurrency(overview.data.totalMarketCap)}
                      </span>
                      <Delta value={overview.data.marketCapChange24h} size="sm" />
                    </span>
                  </div>

                  <div className="flex flex-col gap-2 border-l border-t border-line-faint px-5 py-5 sm:px-8 lg:border-t-0">
                    <span className="t-micro">24h volume</span>
                    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="t-figure">
                        {formatCompactCurrency(overview.data.totalVolume24h)}
                      </span>
                      <span className="t-micro-tight text-ink-ghost">
                        BTC {formatShare(overview.data.btcDominance, 0)}
                      </span>
                    </span>
                  </div>
                </>
              ) : (
                <div className="col-span-2 flex items-center border-t border-line-faint px-5 py-5 sm:px-8 lg:border-l lg:border-t-0">
                  <p className="text-[0.8125rem] text-ink-faint">
                    Market aggregates unavailable.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Matches the rail's height so the hero does not shift as it resolves. */
export function MarketRailSkeleton() {
  return (
    <div className="relative border-y border-line bg-ground/60">
      <div className="mx-auto w-full max-w-[84rem]">
        <div className="flex flex-col divide-y divide-line-faint lg:flex-row lg:divide-x lg:divide-y-0">
          <div className="flex flex-col justify-center gap-2 px-5 py-4 sm:px-8 lg:w-56 lg:shrink-0">
            <span className="t-micro">Live market</span>
            <Skeleton className="h-2 w-28" />
          </div>
          <div className="grid flex-1 grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className={[
                  'flex flex-col gap-3 border-line-faint px-5 py-5 sm:px-8',
                  i % 2 === 1 ? 'border-l' : '',
                  i > 1 ? 'border-t lg:border-t-0' : '',
                  i > 0 ? 'lg:border-l' : '',
                ].join(' ')}
              >
                <Skeleton className="h-2 w-16" />
                <Skeleton className="h-3.5 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
