import type {
  AIResearchSummary,
  NewsArticle,
  OnchainMetrics,
  RiskAssessment,
  TokenOverview,
  TokenomicsData,
} from '@/types';

/**
 * The normalised evidence a synthesis is allowed to reason over.
 *
 * The AI provider never fetches anything itself — it is handed already
 * normalised BlockLens types. That keeps one provider boundary instead of
 * two, makes the synthesis reproducible from a known input, and means the
 * model cannot introduce a figure that no provider reported.
 */
export interface ResearchContext {
  token: TokenOverview;
  onchain: OnchainMetrics | null;
  tokenomics?: TokenomicsData | null;
  risk?: RiskAssessment | null;
  news: NewsArticle[];
}

export interface AIResearchService {
  generateSummary(symbol: string, context: ResearchContext): Promise<AIResearchSummary>;
}
