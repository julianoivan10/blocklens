'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AssetList, AssetRow } from '@/components/data/asset-row';
import { BlockHead } from '@/components/ui/block';
import type { MarketMover } from '@/types';

/**
 * Gainers and losers.
 *
 * A client component only because of the tab interaction — the data
 * arrives as props from the server, so nothing is fetched in the
 * browser and no provider code is bundled. This is the pattern used
 * across the workspace: server reads, client interaction.
 */
export function MoversPanel({
  gainers,
  losers,
}: {
  gainers: MarketMover[];
  losers: MarketMover[];
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <Tabs defaultValue="gainers">
        {/* The tab strip has to occupy exactly the height of a one-line
            text aside, or this column's head rule sits lower than the
            panels beside it. `py-0` collapses the trigger to its text
            box, and `-bottom-3` drops the active underline onto the
            head's own hairline — 12px below, the head's `pb-3`. */}
        <BlockHead
          label="Movers · 24h"
          aside={
            <TabsList className="gap-5 border-b-0">
              <TabsTrigger value="gainers" className="py-0 after:-bottom-3">
                Up
              </TabsTrigger>
              <TabsTrigger value="losers" className="py-0 after:-bottom-3">
                Down
              </TabsTrigger>
            </TabsList>
          }
        />

        {/* `mt-0` overrides the panel default so the first row starts on
            the same line as the neighbouring columns' first rows. */}
        <TabsContent value="gainers" className="mt-0">
          <MoverList items={gainers} emptyLabel="No gainers to report" />
        </TabsContent>
        <TabsContent value="losers" className="mt-0">
          <MoverList items={losers} emptyLabel="No losers to report" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MoverList({ items, emptyLabel }: { items: MarketMover[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <p className="t-micro-tight py-8 text-ink-ghost">{emptyLabel}</p>;
  }

  return (
    <AssetList className="-ml-4">
      {items.map((token, i) => (
        <AssetRow
          key={token.id}
          index={i + 1}
          symbol={token.symbol}
          name={token.name}
          price={token.currentPrice}
          change={token.priceChangePercentage24h}
        />
      ))}
    </AssetList>
  );
}
