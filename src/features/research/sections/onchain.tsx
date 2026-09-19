import { Register, RegisterRow } from '@/components/data/register';
import { EmptyState } from '@/components/ui/block';
import { ResearchSection } from './research-section';
import { formatCompactCount, formatCompactCurrency } from '@/lib/format';
import type { OnchainMetrics } from '@/types';

/**
 * On-chain readings.
 *
 * Every row is conditional, because no provider supplies all of them:
 * Alchemy reports block-level facts, DeFiLlama reports DeFi aggregates,
 * and an asset that is not a chain's gas token has neither. A field
 * nobody measured is simply absent rather than filled with an estimate.
 *
 * Values the provider derived rather than counted are labelled as such
 * in the row's own note.
 */
export function OnchainSection({
  symbol,
  metrics,
}: {
  symbol: string;
  metrics: OnchainMetrics | null;
}) {
  const isDerived = (key: string) => metrics?.derived?.includes(key);
  const rows: React.ReactNode[] = [];

  if (metrics) {
    if (metrics.tvl !== undefined) {
      rows.push(
        <RegisterRow
          key="tvl"
          label="Total value locked"
          note="DeFi protocols on this chain"
          value={formatCompactCurrency(metrics.tvl)}
        />
      );
    }
    if (metrics.fees24h !== undefined) {
      rows.push(
        <RegisterRow
          key="fees"
          label="Fees paid"
          note="24h, across the chain"
          value={formatCompactCurrency(metrics.fees24h)}
          change={metrics.feesChange24h}
        />
      );
    }
    if (metrics.revenue24h !== undefined) {
      rows.push(
        <RegisterRow
          key="revenue"
          label="Protocol revenue"
          note="24h"
          value={formatCompactCurrency(metrics.revenue24h)}
        />
      );
    }
    if (metrics.latestBlock !== undefined) {
      rows.push(
        <RegisterRow
          key="block"
          label="Chain height"
          note="Latest block seen"
          value={metrics.latestBlock.toLocaleString('en-US')}
        />
      );
    }
    if (metrics.blockTime !== undefined) {
      rows.push(
        <RegisterRow key="blocktime" label="Block time" note="Recent average" value={`${metrics.blockTime}s`} />
      );
    }
    if (metrics.transactionsPerBlock !== undefined) {
      rows.push(
        <RegisterRow
          key="tpb"
          label="Transactions per block"
          value={metrics.transactionsPerBlock.toLocaleString('en-US')}
        />
      );
    }
    if (metrics.transactionCount24h !== undefined) {
      rows.push(
        <RegisterRow
          key="tx24"
          label="Transactions"
          note={
            isDerived('transactionCount24h')
              ? 'Projected from recent blocks, not counted'
              : '24h'
          }
          value={formatCompactCount(metrics.transactionCount24h)}
          change={metrics.transactionCountChange}
        />
      );
    }
    if (metrics.gasPriceGwei !== undefined) {
      rows.push(
        <RegisterRow key="gas" label="Gas price" note="Current" value={`${metrics.gasPriceGwei} gwei`} />
      );
    }
    if (metrics.activeAddresses24h !== undefined) {
      rows.push(
        <RegisterRow
          key="addresses"
          label="Active addresses"
          note="24h"
          value={formatCompactCount(metrics.activeAddresses24h)}
          change={metrics.activeAddressesChange}
        />
      );
    }
    if (metrics.avgTransactionValue !== undefined) {
      rows.push(
        <RegisterRow
          key="avgvalue"
          label="Average transfer value"
          note="24h"
          value={formatCompactCurrency(metrics.avgTransactionValue)}
        />
      );
    }
    if (metrics.hashRate) {
      rows.push(<RegisterRow key="hash" label="Hash rate" note="Network security" value={metrics.hashRate} />);
    }
    if (metrics.difficulty) {
      rows.push(<RegisterRow key="difficulty" label="Difficulty" value={metrics.difficulty} />);
    }
  }

  return (
    <ResearchSection
      id="onchain"
      ordinal="02"
      label="On-chain"
      title="Is the network being used?"
      intro="Activity on the chain itself, independent of what the market is doing with the asset."
      aside={
        metrics?.sources?.length ? (
          <span className="t-micro-tight text-ink-ghost">{metrics.sources.join(' · ')}</span>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          title="No on-chain coverage"
          description={`${symbol} is not the gas token of a chain the configured providers report on, so there are no network metrics to show. Market, supply and risk readings above and below are unaffected.`}
        />
      ) : (
        <>
          <Register columns={2}>{rows}</Register>

          {metrics?.chainLabel && (
            <p className="t-micro-tight mt-6 border-t border-line-faint pt-4 text-ink-ghost">
              Readings for the {metrics.chainLabel} network.
              {metrics.derived?.length
                ? ' Figures marked as projected are extrapolated from a recent block sample rather than counted over the full period.'
                : ''}
            </p>
          )}
        </>
      )}
    </ResearchSection>
  );
}
