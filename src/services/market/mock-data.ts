import type { TokenOverview, MarketSummary, TrendingToken, MarketMover, PricePoint, SearchResult } from '@/types';

// Generate realistic OHLCV data for a given base price over N days
function generatePriceHistory(basePrice: number, days: number, volatility: number = 0.03): PricePoint[] {
  const data: PricePoint[] = [];
  let price = basePrice * (0.85 + Math.random() * 0.15);
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - days * 24 * 60 * 60;

  for (let i = 0; i < days; i++) {
    const time = startTime + i * 24 * 60 * 60;
    const change = (Math.random() - 0.48) * volatility * price;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5);
    const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);
    const volume = basePrice * (50000 + Math.random() * 200000);

    data.push({
      time,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Number(volume.toFixed(0)),
    });

    price = close;
  }

  return data;
}

export const MOCK_TOKENS: Record<string, TokenOverview> = {
  BTC: {
    id: 'bitcoin',
    symbol: 'BTC',
    name: 'Bitcoin',
    image: '/tokens/btc.svg',
    currentPrice: 67432.18,
    marketCap: 1324000000000,
    marketCapRank: 1,
    totalVolume: 28500000000,
    priceChange24h: 1245.32,
    priceChangePercentage24h: 1.88,
    priceChangePercentage7d: 4.52,
    priceChangePercentage30d: 12.34,
    circulatingSupply: 19640000,
    totalSupply: 21000000,
    maxSupply: 21000000,
    ath: 73750,
    athDate: '2024-03-14',
    atl: 67.81,
    atlDate: '2013-07-06',
    description: 'Bitcoin is the first and most well-known cryptocurrency, created in 2009 by an anonymous person or group using the pseudonym Satoshi Nakamoto. It operates on a decentralized peer-to-peer network using blockchain technology.',
    categories: ['Layer 1', 'Store of Value', 'Proof of Work'],
    links: {
      homepage: 'https://bitcoin.org',
      whitepaper: 'https://bitcoin.org/bitcoin.pdf',
      github: 'https://github.com/bitcoin/bitcoin',
      twitter: 'https://twitter.com/bitcoin',
      reddit: 'https://reddit.com/r/bitcoin',
    },
  },
  ETH: {
    id: 'ethereum',
    symbol: 'ETH',
    name: 'Ethereum',
    image: '/tokens/eth.svg',
    currentPrice: 3456.78,
    marketCap: 415000000000,
    marketCapRank: 2,
    totalVolume: 15200000000,
    priceChange24h: -45.23,
    priceChangePercentage24h: -1.29,
    priceChangePercentage7d: 2.15,
    priceChangePercentage30d: 8.67,
    circulatingSupply: 120150000,
    totalSupply: null,
    maxSupply: null,
    ath: 4878.26,
    athDate: '2021-11-10',
    atl: 0.432979,
    atlDate: '2015-10-20',
    description: 'Ethereum is a decentralized, open-source blockchain with smart contract functionality. Ether is the native cryptocurrency of the platform. It is the most actively used blockchain.',
    categories: ['Layer 1', 'Smart Contract Platform', 'DeFi'],
    links: {
      homepage: 'https://ethereum.org',
      github: 'https://github.com/ethereum',
      twitter: 'https://twitter.com/ethereum',
      reddit: 'https://reddit.com/r/ethereum',
    },
  },
  SOL: {
    id: 'solana',
    symbol: 'SOL',
    name: 'Solana',
    image: '/tokens/sol.svg',
    currentPrice: 178.45,
    marketCap: 82000000000,
    marketCapRank: 5,
    totalVolume: 3200000000,
    priceChange24h: 5.67,
    priceChangePercentage24h: 3.28,
    priceChangePercentage7d: 8.92,
    priceChangePercentage30d: 22.15,
    circulatingSupply: 459500000,
    totalSupply: 581000000,
    maxSupply: null,
    ath: 259.96,
    athDate: '2021-11-06',
    atl: 0.5,
    atlDate: '2020-05-11',
    description: 'Solana is a high-performance blockchain supporting builders around the world creating crypto apps. Known for its speed and low transaction costs.',
    categories: ['Layer 1', 'Smart Contract Platform', 'DeFi'],
    links: {
      homepage: 'https://solana.com',
      github: 'https://github.com/solana-labs',
      twitter: 'https://twitter.com/solana',
      discord: 'https://discord.gg/solana',
    },
  },
  ADA: {
    id: 'cardano',
    symbol: 'ADA',
    name: 'Cardano',
    image: '/tokens/ada.svg',
    currentPrice: 0.5823,
    marketCap: 20800000000,
    marketCapRank: 9,
    totalVolume: 420000000,
    priceChange24h: -0.0123,
    priceChangePercentage24h: -2.07,
    priceChangePercentage7d: -0.85,
    priceChangePercentage30d: 5.23,
    circulatingSupply: 35730000000,
    totalSupply: 45000000000,
    maxSupply: 45000000000,
    ath: 3.09,
    athDate: '2021-09-02',
    atl: 0.01925,
    atlDate: '2020-03-13',
    description: 'Cardano is a proof-of-stake blockchain platform founded on peer-reviewed research and developed through evidence-based methods.',
    categories: ['Layer 1', 'Smart Contract Platform', 'Proof of Stake'],
    links: {
      homepage: 'https://cardano.org',
      github: 'https://github.com/cardano-foundation',
      twitter: 'https://twitter.com/cardano',
    },
  },
  AVAX: {
    id: 'avalanche',
    symbol: 'AVAX',
    name: 'Avalanche',
    image: '/tokens/avax.svg',
    currentPrice: 38.92,
    marketCap: 15300000000,
    marketCapRank: 12,
    totalVolume: 580000000,
    priceChange24h: 0.78,
    priceChangePercentage24h: 2.04,
    priceChangePercentage7d: 5.67,
    priceChangePercentage30d: 15.89,
    circulatingSupply: 393200000,
    totalSupply: 720000000,
    maxSupply: 720000000,
    ath: 144.96,
    athDate: '2021-11-21',
    atl: 2.8,
    atlDate: '2020-12-31',
    description: 'Avalanche is a layer one blockchain that functions as a platform for decentralized applications and custom blockchain networks.',
    categories: ['Layer 1', 'Smart Contract Platform', 'DeFi'],
    links: { homepage: 'https://avax.network', github: 'https://github.com/ava-labs', twitter: 'https://twitter.com/avaborq' },
  },
  DOT: {
    id: 'polkadot',
    symbol: 'DOT',
    name: 'Polkadot',
    image: '/tokens/dot.svg',
    currentPrice: 7.45,
    marketCap: 10200000000,
    marketCapRank: 14,
    totalVolume: 320000000,
    priceChange24h: -0.12,
    priceChangePercentage24h: -1.59,
    priceChangePercentage7d: 1.23,
    priceChangePercentage30d: 3.45,
    circulatingSupply: 1370000000,
    totalSupply: null,
    maxSupply: null,
    ath: 55,
    athDate: '2021-11-04',
    atl: 2.7,
    atlDate: '2020-08-20',
    description: 'Polkadot is a multi-chain application environment where specialized blockchains communicate via a shared security model.',
    categories: ['Layer 0', 'Interoperability', 'Proof of Stake'],
    links: { homepage: 'https://polkadot.network', github: 'https://github.com/polkadot', twitter: 'https://twitter.com/Polkadot' },
  },
  LINK: {
    id: 'chainlink',
    symbol: 'LINK',
    name: 'Chainlink',
    image: '/tokens/link.svg',
    currentPrice: 18.34,
    marketCap: 10800000000,
    marketCapRank: 13,
    totalVolume: 620000000,
    priceChange24h: 0.45,
    priceChangePercentage24h: 2.51,
    priceChangePercentage7d: 6.78,
    priceChangePercentage30d: 18.23,
    circulatingSupply: 589000000,
    totalSupply: 1000000000,
    maxSupply: 1000000000,
    ath: 52.7,
    athDate: '2021-05-10',
    atl: 0.148183,
    atlDate: '2017-09-23',
    description: 'Chainlink is a decentralized oracle network providing tamper-proof data for complex smart contracts on any blockchain.',
    categories: ['Oracle', 'DeFi Infrastructure'],
    links: { homepage: 'https://chain.link', github: 'https://github.com/smartcontractkit', twitter: 'https://twitter.com/chainlink' },
  },
  UNI: {
    id: 'uniswap',
    symbol: 'UNI',
    name: 'Uniswap',
    image: '/tokens/uni.svg',
    currentPrice: 12.56,
    marketCap: 7500000000,
    marketCapRank: 18,
    totalVolume: 280000000,
    priceChange24h: 0.23,
    priceChangePercentage24h: 1.87,
    priceChangePercentage7d: 3.45,
    priceChangePercentage30d: 9.12,
    circulatingSupply: 598000000,
    totalSupply: 1000000000,
    maxSupply: 1000000000,
    ath: 44.97,
    athDate: '2021-05-03',
    atl: 1.03,
    atlDate: '2020-09-17',
    description: 'Uniswap is a leading decentralized exchange protocol on Ethereum enabling automated token trading.',
    categories: ['DEX', 'DeFi', 'Governance'],
    links: { homepage: 'https://uniswap.org', github: 'https://github.com/Uniswap', twitter: 'https://twitter.com/Uniswap' },
  },
  ATOM: {
    id: 'cosmos',
    symbol: 'ATOM',
    name: 'Cosmos',
    image: '/tokens/atom.svg',
    currentPrice: 9.87,
    marketCap: 3800000000,
    marketCapRank: 22,
    totalVolume: 180000000,
    priceChange24h: 0.15,
    priceChangePercentage24h: 1.54,
    priceChangePercentage7d: 2.89,
    priceChangePercentage30d: 7.34,
    circulatingSupply: 385000000,
    totalSupply: null,
    maxSupply: null,
    ath: 44.45,
    athDate: '2022-01-17',
    atl: 1.16,
    atlDate: '2020-03-13',
    description: 'Cosmos is an ecosystem of interoperable blockchains designed to create an Internet of Blockchains.',
    categories: ['Layer 0', 'Interoperability', 'Proof of Stake'],
    links: { homepage: 'https://cosmos.network', github: 'https://github.com/cosmos', twitter: 'https://twitter.com/cosmos' },
  },
};

export const MOCK_MARKET_SUMMARY: MarketSummary = {
  totalMarketCap: 2670000000000,
  totalVolume24h: 98500000000,
  btcDominance: 49.6,
  ethDominance: 15.5,
  marketCapChange24h: 1.24,
  activeCryptocurrencies: 13248,
};

export function getMockTrending(): TrendingToken[] {
  return ['SOL', 'LINK', 'AVAX', 'UNI', 'DOT'].map((symbol, index) => {
    const token = MOCK_TOKENS[symbol]!;
    return {
      id: token.id,
      symbol: token.symbol,
      name: token.name,
      image: token.image,
      currentPrice: token.currentPrice,
      priceChangePercentage24h: token.priceChangePercentage24h,
      marketCap: token.marketCap,
      rank: index + 1,
    };
  });
}

export function getMockGainers(): MarketMover[] {
  return Object.values(MOCK_TOKENS)
    .filter(t => t.priceChangePercentage24h > 0)
    .sort((a, b) => b.priceChangePercentage24h - a.priceChangePercentage24h)
    .slice(0, 5)
    .map(t => ({
      id: t.id, symbol: t.symbol, name: t.name, image: t.image,
      currentPrice: t.currentPrice, priceChangePercentage24h: t.priceChangePercentage24h,
    }));
}

export function getMockLosers(): MarketMover[] {
  return Object.values(MOCK_TOKENS)
    .filter(t => t.priceChangePercentage24h < 0)
    .sort((a, b) => a.priceChangePercentage24h - b.priceChangePercentage24h)
    .slice(0, 5)
    .map(t => ({
      id: t.id, symbol: t.symbol, name: t.name, image: t.image,
      currentPrice: t.currentPrice, priceChangePercentage24h: t.priceChangePercentage24h,
    }));
}

export function getMockPriceHistory(symbol: string, days: number): PricePoint[] {
  const token = MOCK_TOKENS[symbol.toUpperCase()];
  if (!token) return [];
  return generatePriceHistory(token.currentPrice, days);
}

export function searchMockTokens(query: string): SearchResult[] {
  const q = query.toLowerCase();
  return Object.values(MOCK_TOKENS)
    .filter(t => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
    .map(t => ({
      id: t.id, symbol: t.symbol, name: t.name, image: t.image, marketCapRank: t.marketCapRank,
    }));
}
