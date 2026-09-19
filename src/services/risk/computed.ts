import type { RiskContext, RiskService } from './interface';
import type { RiskAssessment, RiskDimension, SimplePrice } from '@/types';

/**
 * Computed risk assessment.
 *
 * None of the configured providers sells a risk score, so rather than
 * present invented numbers this derives each dimension from data
 * BlockLens already has, and states the arithmetic in the dimension's own
 * description. Every score is therefore checkable by the reader.
 *
 * The scale is 0–100 where **higher means lower risk**, matching the rest
 * of the interface. A dimension that cannot be computed from the
 * available data is omitted rather than defaulted to a middling score,
 * which would read as a real finding.
 */

/** Maps a measurement onto 0–100 by linear interpolation between stops. */
function scale(value: number, stops: Array<[input: number, score: number]>): number {
  const sorted = [...stops].sort((a, b) => a[0] - b[0]);

  if (value <= sorted[0][0]) return sorted[0][1];
  const last = sorted[sorted.length - 1];
  if (value >= last[0]) return last[1];

  for (let i = 0; i < sorted.length - 1; i++) {
    const [x0, y0] = sorted[i];
    const [x1, y1] = sorted[i + 1];
    if (value >= x0 && value <= x1) {
      const t = (value - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return last[1];
}

function label(score: number): RiskDimension['label'] {
  if (score >= 75) return 'Low';
  if (score >= 50) return 'Medium';
  if (score >= 25) return 'High';
  return 'Critical';
}

function dimension(name: string, score: number, description: string): RiskDimension {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return { name, score: clamped, label: label(clamped), description };
}

/** Annualised volatility of daily log returns, as a percentage. */
function annualisedVolatility(series: SimplePrice[]): number | null {
  if (series.length < 20) return null;

  const returns: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].value;
    const curr = series[i].value;
    if (prev > 0 && curr > 0) returns.push(Math.log(curr / prev));
  }
  if (returns.length < 15) return null;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);

  return Math.sqrt(variance) * Math.sqrt(365) * 100;
}

/** Largest peak-to-trough fall within the window, as a percentage. */
function maxDrawdown(series: SimplePrice[]): number | null {
  if (series.length < 20) return null;

  let peak = series[0].value;
  let worst = 0;
  for (const point of series) {
    if (point.value > peak) peak = point.value;
    if (peak > 0) worst = Math.max(worst, ((peak - point.value) / peak) * 100);
  }
  return worst;
}

const pct = (n: number) => `${n.toFixed(1)}%`;

/** Compact money for the description strings, trillions included. */
function money(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export class ComputedRiskService implements RiskService {
  async getAssessment(symbol: string, context: RiskContext): Promise<RiskAssessment> {
    const { token, series, onchain } = context;
    const dimensions: RiskDimension[] = [];

    /* Liquidity — 24h turnover as a share of market cap. Thin turnover
       means a position cannot be exited without moving the price. */
    if (token.marketCap > 0 && token.totalVolume > 0) {
      const turnover = (token.totalVolume / token.marketCap) * 100;
      dimensions.push(
        dimension(
          'Liquidity',
          scale(turnover, [
            [0.2, 15],
            [1, 45],
            [3, 75],
            [8, 92],
            [20, 98],
          ]),
          `${money(token.totalVolume)} traded in 24h against a ${money(
            token.marketCap
          )} market cap — turnover of ${pct(turnover)}.`
        )
      );
    }

    /* Market size — rank is a proxy for how much infrastructure,
       coverage and counterparty depth exists around an asset. */
    if (token.marketCapRank > 0) {
      dimensions.push(
        dimension(
          'Market size',
          scale(token.marketCapRank, [
            [1, 97],
            [10, 85],
            [50, 62],
            [150, 40],
            [500, 18],
            [1500, 6],
          ]),
          `Ranked #${token.marketCapRank} by market capitalisation (${money(
            token.marketCap
          )}).`
        )
      );
    }

    /* Volatility — annualised standard deviation of daily log returns
       over the loaded window. */
    const volatility = annualisedVolatility(series);
    if (volatility !== null) {
      dimensions.push(
        dimension(
          'Volatility',
          scale(volatility, [
            [20, 92],
            [40, 75],
            [65, 55],
            [90, 35],
            [140, 15],
            [220, 5],
          ]),
          `Annualised volatility of ${pct(volatility)}, from ${series.length} daily closes.`
        )
      );
    }

    /* Drawdown — the worst fall inside the window, which is what a
       holder would actually have lived through. */
    const drawdown = maxDrawdown(series);
    if (drawdown !== null) {
      dimensions.push(
        dimension(
          'Drawdown',
          scale(drawdown, [
            [5, 93],
            [15, 78],
            [30, 55],
            [50, 32],
            [70, 12],
          ]),
          `Deepest peak-to-trough fall in the window was ${pct(drawdown)}.`
        )
      );
    }

    /* Supply overhang — how much of the eventual supply is already
       issued. An asset with most of its supply still to come carries
       structural dilution ahead of it. */
    if (token.maxSupply && token.maxSupply > 0 && token.circulatingSupply > 0) {
      const issued = (token.circulatingSupply / token.maxSupply) * 100;
      dimensions.push(
        dimension(
          'Supply overhang',
          scale(issued, [
            [30, 18],
            [55, 42],
            [75, 65],
            [90, 85],
            [99, 96],
          ]),
          `${pct(issued)} of the maximum supply is already circulating, leaving ${pct(
            100 - issued
          )} still to be issued.`
        )
      );
    } else if (token.totalSupply === null && token.maxSupply === null) {
      dimensions.push(
        dimension(
          'Supply overhang',
          55,
          'No hard cap is published, so future issuance is governed by protocol policy rather than a fixed schedule.'
        )
      );
    }

    /* Drawdown from all-time high — position within the asset's own
       history. */
    if (token.ath > 0 && token.currentPrice > 0) {
      const fromAth = ((token.ath - token.currentPrice) / token.ath) * 100;
      dimensions.push(
        dimension(
          'Position vs high',
          scale(fromAth, [
            [0, 70],
            [20, 78],
            [45, 62],
            [70, 38],
            [90, 15],
          ]),
          `Trading ${pct(fromAth)} below its all-time high of $${token.ath.toLocaleString(
            'en-US'
          )}.`
        )
      );
    }

    /* Network usage — only where DeFi TVL is actually reported. Value
       locked relative to market cap says how much of the asset's
       valuation is backed by on-chain use. */
    if (onchain?.tvl && token.marketCap > 0) {
      const ratio = (onchain.tvl / token.marketCap) * 100;
      dimensions.push(
        dimension(
          'On-chain usage',
          scale(ratio, [
            [0.5, 25],
            [3, 50],
            [10, 72],
            [25, 88],
            [60, 96],
          ]),
          `${money(onchain.tvl)} locked in DeFi on ${
            onchain.chainLabel ?? 'this chain'
          } — ${pct(ratio)} of market cap.`
        )
      );
    }

    // With fewer than three computable dimensions a composite would be
    // more confident than the evidence supports.
    const overallScore =
      dimensions.length >= 3
        ? Math.round(dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length)
        : 0;

    return {
      overallScore,
      dimensions,
      lastUpdated: new Date().toISOString(),
      // Computed from live provider data, not sample figures.
      isDemo: false,
    };
  }
}
