import type {
  OnchainMetrics,
  RiskAssessment,
  SimplePrice,
  TokenOverview,
  TokenomicsData,
} from '@/types';

/**
 * The evidence a risk assessment is computed from.
 *
 * No provider in the stack sells a risk score, so BlockLens computes its
 * own from data it already holds. Passing that data in explicitly — rather
 * than letting the service fetch — keeps the scoring reproducible and
 * makes it obvious that every dimension traces back to a real figure.
 */
export interface RiskContext {
  token: TokenOverview;
  series: SimplePrice[];
  onchain: OnchainMetrics | null;
  tokenomics: TokenomicsData | null;
}

export interface RiskService {
  getAssessment(symbol: string, context: RiskContext): Promise<RiskAssessment>;
}
