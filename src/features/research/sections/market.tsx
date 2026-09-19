import { Register, RegisterRow } from '@/components/data/register';
import { Delta } from '@/components/data/delta';
import { ResearchSection } from './research-section';
import { PriceChart } from '../price-chart';
import { formatDate, formatPrice, formatShare } from '@/lib/format';
import type { SimplePrice, TokenOverview } from '@/types';

export function MarketSection({
  token,
  series,
}: {
  token: TokenOverview;
  series: SimplePrice[];
}) {
  const fromAth = ((token.currentPrice - token.ath) / token.ath) * 100;
  const fromAtl = ((token.currentPrice - token.atl) / token.atl) * 100;

  return (
    <ResearchSection
      id="market"
      ordinal="01"
      label="Market"
      title="Price structure and range"
      intro="What the market has agreed on, and how widely that has moved."
      aside={<span className="t-micro-tight text-ink-ghost">CoinGecko</span>}
    >
      <PriceChart series={series} symbol={token.symbol} />

      <Register columns={2} className="mt-12">
        <RegisterRow
          label="24h change"
          value={<Delta value={token.priceChangePercentage24h} size="sm" glyph={false} />}
        />
        <RegisterRow
          label="7d change"
          value={<Delta value={token.priceChangePercentage7d ?? 0} size="sm" glyph={false} />}
        />
        <RegisterRow
          label="30d change"
          value={<Delta value={token.priceChangePercentage30d ?? 0} size="sm" glyph={false} />}
        />
        <RegisterRow label="All-time high" value={formatPrice(token.ath)} note={formatDate(token.athDate)} />
        <RegisterRow label="From all-time high" value={formatShare(fromAth)} />
        <RegisterRow label="All-time low" value={formatPrice(token.atl)} note={formatDate(token.atlDate)} />
        <RegisterRow label="From all-time low" value={`+${formatShare(fromAtl)}`} />
      </Register>
    </ResearchSection>
  );
}
