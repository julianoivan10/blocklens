import type { NewsService } from './interface';
import type { NewsArticle } from '@/types';
import { sleep } from '@/lib/utils';
import { articleSlug } from './normalise';

/* Slugs are added below rather than written out by hand, so they are
   derived by the same function the live providers use. */
const MOCK_NEWS: Omit<NewsArticle, 'slug'>[] = [
  {
    id: 'n1',
    title: 'Bitcoin ETF inflows reach record high as institutional adoption accelerates',
    summary: 'Spot Bitcoin ETFs saw over $1.2 billion in net inflows this week, marking the highest weekly total since launch. BlackRock\'s IBIT led the charge with $540 million in single-day inflows.',
    source: 'CoinDesk',
    url: '#',
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    sentiment: 'positive',
    relatedTokens: ['BTC'],
  },
  {
    id: 'n2',
    title: 'Ethereum Dencun upgrade shows promising results for Layer 2 scalability',
    summary: 'Transaction costs on major Ethereum L2 networks have dropped by over 90% following the Dencun upgrade, with Base and Arbitrum reporting significant increases in daily active users.',
    source: 'The Block',
    url: '#',
    publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    sentiment: 'positive',
    relatedTokens: ['ETH'],
  },
  {
    id: 'n3',
    title: 'Solana DeFi TVL surpasses $8 billion milestone',
    summary: 'Solana\'s decentralized finance ecosystem has reached a new all-time high in total value locked, driven by growth in liquid staking and decentralized exchange volumes.',
    source: 'DeFi Llama',
    url: '#',
    publishedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    sentiment: 'positive',
    relatedTokens: ['SOL'],
  },
  {
    id: 'n4',
    title: 'SEC delays decision on multiple altcoin ETF applications',
    summary: 'The U.S. Securities and Exchange Commission has pushed back its decision timeline on several cryptocurrency ETF applications including Solana and XRP spot ETFs.',
    source: 'Bloomberg',
    url: '#',
    publishedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    sentiment: 'neutral',
    relatedTokens: ['SOL'],
  },
  {
    id: 'n5',
    title: 'Chainlink CCIP integration expands to 15 new blockchains',
    summary: 'Chainlink\'s Cross-Chain Interoperability Protocol (CCIP) has expanded its reach to support 15 additional blockchain networks, strengthening its position as the leading cross-chain infrastructure provider.',
    source: 'CryptoSlate',
    url: '#',
    publishedAt: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
    sentiment: 'positive',
    relatedTokens: ['LINK'],
  },
  {
    id: 'n6',
    title: 'Global crypto market cap reaches $2.7 trillion amid broad rally',
    summary: 'The total cryptocurrency market capitalization has climbed to $2.7 trillion as both Bitcoin and major altcoins post gains. Trading volumes have increased 45% over the past week.',
    source: 'Reuters',
    url: '#',
    publishedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    sentiment: 'positive',
    relatedTokens: ['BTC', 'ETH'],
  },
  {
    id: 'n7',
    title: 'Uniswap v4 launch brings hooks and custom pool logic to DeFi',
    summary: 'Uniswap Labs has announced the launch of Uniswap v4, featuring a new "hooks" framework that allows developers to customize pool behavior, potentially enabling new DeFi primitives.',
    source: 'The Defiant',
    url: '#',
    publishedAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
    sentiment: 'positive',
    relatedTokens: ['UNI', 'ETH'],
  },
  {
    id: 'n8',
    title: 'Analysis: Rising correlation between crypto and traditional markets',
    summary: 'Recent data suggests increasing correlation between cryptocurrency markets and traditional equity indices, raising questions about crypto\'s role as a portfolio diversifier.',
    source: 'Financial Times',
    url: '#',
    publishedAt: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
    sentiment: 'neutral',
    relatedTokens: ['BTC', 'ETH'],
  },
];

/**
 * Sample articles carry slugs derived exactly as live ones are, so the
 * article route behaves identically in sample mode.
 */
const WITH_SLUGS: NewsArticle[] = MOCK_NEWS.map((article) => ({
  ...article,
  slug: articleSlug(article.title, article.url),
}));

export class MockNewsService implements NewsService {
  async getLatest(limit = 10): Promise<NewsArticle[]> {
    await sleep(250);
    return WITH_SLUGS.slice(0, limit);
  }

  async getByToken(symbol: string, limit = 5): Promise<NewsArticle[]> {
    await sleep(250);
    return WITH_SLUGS.filter((n) => n.relatedTokens?.includes(symbol.toUpperCase())).slice(0, limit);
  }
}
