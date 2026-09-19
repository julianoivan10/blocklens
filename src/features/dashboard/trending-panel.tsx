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
          {trending.slice(0, 6).map((token) => (
            <AssetRow
              key={token.id}
              index={token.rank}
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
