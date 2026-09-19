// ============================================================
// Core application types
// ============================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================
// User types
// ============================================================

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: Date | null;
  createdAt: Date;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

// ============================================================
// Market types
// ============================================================

export interface TokenOverview {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  currentPrice: number;
  marketCap: number;
  marketCapRank: number;
  totalVolume: number;
  priceChange24h: number;
  priceChangePercentage24h: number;
  priceChangePercentage7d?: number;
  priceChangePercentage30d?: number;
  circulatingSupply: number;
  totalSupply: number | null;
  maxSupply: number | null;
  ath: number;
  athDate: string;
  atl: number;
  atlDate: string;
  description?: string;
  categories?: string[];
  links?: TokenLinks;
}

export interface TokenLinks {
  homepage?: string;
  whitepaper?: string;
  github?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  reddit?: string;
}

export interface PricePoint {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface SimplePrice {
  time: number;
  value: number;
}

export interface MarketSummary {
  totalMarketCap: number;
  totalVolume24h: number;
  btcDominance: number;
  ethDominance: number;
  marketCapChange24h: number;
  activeCryptocurrencies: number;
}

export interface TrendingToken {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  currentPrice: number;
  priceChangePercentage24h: number;
  marketCap: number;
  rank: number;
}

export interface MarketMover {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  currentPrice: number;
  priceChangePercentage24h: number;
}

export interface SearchResult {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  marketCapRank?: number;
}

// ============================================================
// On-chain types
// ============================================================

/**
 * On-chain readings.
 *
 * Every field is optional because no single provider supplies all of
 * them: Alchemy reports block-level facts over JSON-RPC, DeFiLlama
 * reports DeFi aggregates, and neither reports the other's. A field that
 * cannot be measured is omitted rather than estimated into existence.
 *
 * `derived` names the fields that were computed from a sample rather
 * than read directly, so the interface can label them honestly.
 */
export interface OnchainMetrics {
  /** Human-readable chain this reading belongs to. */
  chainLabel?: string;

  /* Chain infrastructure — Alchemy, measured */
  latestBlock?: number;
  blockTime?: number;
  transactionsPerBlock?: number;
  gasPriceGwei?: number;
  /* Chain infrastructure — extrapolated from a recent block sample */
  transactionCount24h?: number;

  /* DeFi aggregates — DeFiLlama */
  tvl?: number;
  tvlChange?: number;
  fees24h?: number;
  /** 24h change in fees, not in TVL — the two are not interchangeable. */
  feesChange24h?: number;
  revenue24h?: number;

  /* Reported by some providers only */
  activeAddresses24h?: number;
  activeAddressesChange?: number;
  transactionCountChange?: number;
  avgTransactionValue?: number;
  hashRate?: string;
  difficulty?: string;

  /** Keys in this object that are derived rather than measured. */
  derived?: string[];
  /** Providers that contributed, for provenance. */
  sources?: string[];
}

// ============================================================
// Tokenomics types
// ============================================================

export interface TokenomicsData {
  circulatingSupply: number;
  totalSupply: number | null;
  maxSupply: number | null;
  circulatingPercentage: number;
  /** Absent when no provider reports a breakdown. Never fabricated. */
  distribution?: SupplyDistribution[];
  vestingSchedule?: VestingEvent[];
}

export interface SupplyDistribution {
  label: string;
  percentage: number;
  amount: number;
}

export interface VestingEvent {
  date: string;
  amount: number;
  percentage: number;
  description: string;
  completed: boolean;
}

// ============================================================
// News types
// ============================================================

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  image?: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  relatedTokens?: string[];
}

// ============================================================
// Risk types
// ============================================================

export interface RiskAssessment {
  overallScore: number; // 0-100
  dimensions: RiskDimension[];
  lastUpdated: string;
  isDemo: boolean;
}

export interface RiskDimension {
  name: string;
  score: number; // 0-100, higher = less risk
  label: 'Low' | 'Medium' | 'High' | 'Critical';
  description: string;
}

// ============================================================
// AI Research types
// ============================================================

export interface AIResearchSummary {
  symbol: string;
  generatedAt: string;
  summary: string;
  keyObservations: string[];
  notableRisks: string[];
  importantDevelopments: string[];
  areasForFurtherResearch: string[];
  disclaimer: string;
  isDemo: boolean;
}

// ============================================================
// Watchlist types
// ============================================================

export interface WatchlistWithItems {
  id: string;
  name: string;
  items: WatchlistItemWithData[];
  createdAt: Date;
  updatedAt: Date;
}

export interface WatchlistItemWithData {
  id: string;
  symbol: string;
  name: string;
  addedAt: Date;
  currentPrice?: number;
  priceChangePercentage24h?: number;
  marketCap?: number;
}
