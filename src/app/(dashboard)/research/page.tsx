import Link from 'next/link';
import { Container } from '@/components/ui/section';
import { Block, BlockHead } from '@/components/ui/block';
import { AssetMark } from '@/components/data/asset-mark';
import { Delta } from '@/components/data/delta';
import { ROUTES } from '@/lib/constants';
import { formatCompactCurrency, formatPrice } from '@/lib/format';
import { getTokenSnapshot } from '@/server/data/market';
import { SearchTrigger } from '@/features/search/search-trigger';

export const metadata = { title: 'Research' };

/** Coverage rows carry live prices; refresh them on a short cycle. */
export const revalidate = 120;

/** The assets the mock providers carry full dossiers for. */
const COVERED = ['BTC', 'ETH', 'SOL', 'ADA', 'AVAX', 'LINK'] as const;

/**
 * The research entry point.
 *
 * Opens with the search affordance, because searching is how research
 * actually starts — then lists covered assets as readable rows with a
 * live reading, rather than as a grid of identical tiles.
 */
export default async function ResearchIndexPage() {
  const snapshots = await Promise.all(COVERED.map((symbol) => getTokenSnapshot(symbol)));
  const assets = snapshots.filter((s): s is NonNullable<typeof s> => s !== null);

  return (
    <Container className="py-8 sm:py-10">
      <header className="mb-12 max-w-[38rem]">
        <h1 className="font-display text-[1.75rem] leading-none text-ink">Research</h1>
        <p className="t-body mt-4">
          Open an asset to read its dossier — market structure, on-chain activity, supply,
          project, events, risk, and a labelled interpretation.
        </p>
        <SearchTrigger className="mt-8" />
      </header>

      <Block>
        <BlockHead
          label="Full coverage"
          aside={
            <span className="t-micro-tight text-ink-ghost">{assets.length} assets</span>
          }
        />

        <ul className="flex flex-col">
          {assets.map((asset, i) => (
            <li key={asset.id} className="border-b border-line-faint last:border-b-0">
              <Link
                href={`${ROUTES.research}/${asset.symbol}`}
                className="group relative flex flex-wrap items-center gap-x-6 gap-y-3 py-5 pl-6 pr-2 transition-colors hover:bg-panel/50"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-px origin-top scale-y-0 bg-signal transition-transform duration-300 ease-out-quint group-hover:scale-y-100"
                />

                <span className="t-micro-tight w-5 shrink-0 text-ink-ghost">
                  {String(i + 1).padStart(2, '0')}
                </span>

                <AssetMark symbol={asset.symbol} size="md" />

                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[0.9375rem] font-medium text-ink">{asset.name}</span>
                  <span className="t-micro-tight">
                    {asset.symbol} · rank {asset.marketCapRank}
                  </span>
                </span>

                <span className="hidden min-w-0 flex-1 md:block">
                  <span className="line-clamp-1 text-[0.8125rem] text-ink-faint">
                    {asset.categories?.join(' · ')}
                  </span>
                </span>

                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="t-figure text-[0.875rem]">{formatPrice(asset.currentPrice)}</span>
                  <span className="flex items-baseline gap-3">
                    <Delta value={asset.priceChangePercentage24h} size="sm" />
                    <span className="t-micro-tight text-ink-ghost">
                      {formatCompactCurrency(asset.marketCap)}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Block>
    </Container>
  );
}
