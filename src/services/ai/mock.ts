import type { AIResearchService, ResearchContext } from './interface';
import type { AIResearchSummary } from '@/types';
import { sleep } from '@/lib/utils';
import { AI_DISCLAIMER } from './disclaimer';

const MOCK_AI_SUMMARIES: Record<string, Omit<AIResearchSummary, 'disclaimer' | 'isDemo'>> = {
  BTC: {
    symbol: 'BTC',
    generatedAt: new Date().toISOString(),
    summary: 'Bitcoin continues to demonstrate strong institutional adoption momentum, driven primarily by spot ETF inflows and increasing corporate treasury allocation. Network fundamentals remain robust with hash rate near all-time highs, suggesting strong miner confidence. The upcoming halving cycle historically precedes significant price appreciation, though past performance does not guarantee future results.',
    keyObservations: [
      'Spot ETF cumulative inflows have exceeded $15 billion since launch',
      'Hash rate remains near all-time highs at 645 EH/s, indicating strong network security',
      'Long-term holder supply has reached 76% of circulating supply',
      'Exchange reserves continue to decline, suggesting accumulation behavior',
      'Correlation with traditional risk assets has increased in recent weeks',
    ],
    notableRisks: [
      'Regulatory uncertainty in major jurisdictions remains a headwind',
      'Concentration of mining hash rate in specific geographic regions',
      'Potential for ETF outflows during market corrections',
      'Macroeconomic conditions and interest rate policy could impact risk asset appetite',
      'Energy consumption narrative may face renewed scrutiny',
    ],
    importantDevelopments: [
      'Bitcoin ETF approval has opened access to traditional finance investors',
      'Lightning Network capacity and adoption continue to grow',
      'Ordinals and BRC-20 tokens have expanded Bitcoin\'s utility beyond payments',
      'Institutional custody solutions have matured significantly',
    ],
    areasForFurtherResearch: [
      'Impact of halving on miner economics and network security',
      'Layer 2 development ecosystem growth trajectory',
      'Cross-border payment adoption in emerging markets',
      'Long-term sustainability of fee revenue post-subsidy reduction',
    ],
  },
  ETH: {
    symbol: 'ETH',
    generatedAt: new Date().toISOString(),
    summary: 'Ethereum\'s ecosystem continues to evolve with the successful Dencun upgrade significantly reducing Layer 2 costs. DeFi TVL remains the highest of any chain, and the staking ratio provides network security while reducing circulating supply. The transition to a deflationary monetary policy via EIP-1559 burn mechanism has been notable during periods of high network activity.',
    keyObservations: [
      'Layer 2 transaction costs reduced by over 90% post-Dencun upgrade',
      'Total Value Locked across Ethereum DeFi exceeds $48 billion',
      'Approximately 27% of ETH supply is staked, providing network security',
      'Net ETH supply has decreased since the merge, making it deflationary',
      'Active developer count remains highest among all blockchain ecosystems',
    ],
    notableRisks: [
      'Competition from alternative Layer 1 blockchains for DeFi market share',
      'Centralization concerns around liquid staking derivatives',
      'Smart contract risks in complex DeFi protocols',
      'MEV extraction may impact user transaction costs',
      'Regulatory classification uncertainty (security vs commodity)',
    ],
    importantDevelopments: [
      'Dencun upgrade successfully reduced L2 data availability costs',
      'EigenLayer restaking protocol has attracted significant capital',
      'Account abstraction standards improving user experience',
      'RWA tokenization on Ethereum growing rapidly',
    ],
    areasForFurtherResearch: [
      'Pectra upgrade impact on validator operations',
      'Long-term L2 value accrual back to Ethereum mainnet',
      'Restaking protocol systemic risk assessment',
      'Impact of institutional staking on network decentralization',
    ],
  },
  SOL: {
    symbol: 'SOL',
    generatedAt: new Date().toISOString(),
    summary: 'Solana has established itself as a leading high-performance blockchain with significant DeFi and consumer application traction. Network reliability has improved substantially since the outages of 2022-2023. The ecosystem has seen strong growth in DEX volume, NFTs, and DePIN applications.',
    keyObservations: [
      'DEX trading volume frequently rivals or exceeds Ethereum mainnet',
      'Active addresses have grown significantly, driven by consumer applications',
      'Network uptime has improved substantially with recent validator client updates',
      'DeFi TVL has reached $7.8 billion, a new ecosystem high',
      'Token velocity and on-chain activity metrics show genuine usage growth',
    ],
    notableRisks: [
      'Token unlock schedule may create sell pressure in coming months',
      'Validator hardware requirements are relatively high, potentially limiting decentralization',
      'Heavy dependence on a single validator client implementation',
      'High transaction throughput includes significant MEV bot activity',
      'Historical network outages may concern institutional adopters',
    ],
    importantDevelopments: [
      'Firedancer validator client development progressing toward mainnet',
      'State compression enabling scalable DePIN and consumer applications',
      'Mobile-first strategy with Saga phone and dApp Store',
      'Growing institutional interest following ETF filing discussions',
    ],
    areasForFurtherResearch: [
      'Firedancer client impact on network reliability and performance',
      'Real economic activity vs speculative volume analysis',
      'Comparison of validator economics with competing L1s',
      'DePIN protocol sustainability and token model analysis',
    ],
  },
};

const DEFAULT_SUMMARY: Omit<AIResearchSummary, 'disclaimer' | 'isDemo'> = {
  symbol: '',
  generatedAt: new Date().toISOString(),
  summary: 'Detailed AI analysis for this token is not yet available. This feature will provide comprehensive research summaries powered by AI analysis of market data, on-chain metrics, and project fundamentals.',
  keyObservations: ['AI analysis data not yet available for this token'],
  notableRisks: ['Insufficient data for risk assessment'],
  importantDevelopments: ['No recent developments tracked'],
  areasForFurtherResearch: ['Comprehensive token analysis pending data integration'],
};

export class MockAIResearchService implements AIResearchService {
  /**
   * The context is accepted to satisfy the interface but deliberately
   * unused: sample summaries are fixed text, and quietly mixing live
   * figures into them would blur the line between sample and real.
   */
  async generateSummary(
    symbol: string,
    _context?: ResearchContext
  ): Promise<AIResearchSummary> {
    void _context;
    await sleep(800); // Simulate AI generation time
    const upper = symbol.toUpperCase();
    const base = MOCK_AI_SUMMARIES[upper] || { ...DEFAULT_SUMMARY, symbol: upper };
    return {
      ...base,
      disclaimer: AI_DISCLAIMER,
      isDemo: true,
    };
  }
}
