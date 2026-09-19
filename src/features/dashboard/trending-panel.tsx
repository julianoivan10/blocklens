import { AssetList, AssetRow } from '@/components/data/asset-row';
import { Block, BlockHead, ErrorState } from '@/components/ui/block';
import { getTrendingResult } from '@/server/data/market';
import { isOk } from '@/services/result';

export async function TrendingPanel() {
  const result = await getTrendingResult();

  if (!isOk(result)) {
    return (
      <Block>
        <BlockHead label="Trending" />
        <ErrorState
          className="mt-6"
          title="Unavailable"
          description="Trending assets could not be loaded."
        />
      </Block>
    );
  }

  const trending = result.data;

  return (
    <Block>
      <BlockHead
        label="Trending"
        aside={<span className="t-micro-tight text-ink-ghost">By interest</span>}
      />

      {trending.length === 0 ? (
        <p className="t-micro-tight py-8 text-ink-ghost">Nothing trending right now</p>
      ) : (
        <AssetList className="-ml-4">
          {/* List position, not market-cap rank: the ordinal slot is two
              characters wide, and a rank in the hundreds both overflows it
              and reads as a position it is not. */}
          {trending.slice(0, 6).map((token, i) => (
            <AssetRow
              key={token.id}
              index={i + 1}
              symbol={token.symbol}
              name={token.name}
              change={token.priceChangePercentage24h}
            />
          ))}
        </AssetList>
      )}
    </Block>
  );
}
