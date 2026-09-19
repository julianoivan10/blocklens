/**
 * Ticker → CoinGecko id.
 *
 * CoinGecko is addressed by id ("bitcoin"), while BlockLens routes and
 * the database are keyed by ticker ("BTC"). Tickers are not unique
 * across the ~18,000 listed assets, so a curated map pins the majors to
 * the asset a reader actually means — `BTC` must never resolve to a
 * wrapped derivative or a copycat listing.
 *
 * Anything not listed here falls back to CoinGecko's search endpoint,
 * which is why this map only needs to cover the assets where ambiguity
 * would be harmful.
 */
export const SYMBOL_TO_ID: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether',
  BNB: 'binancecoin',
  SOL: 'solana',
  XRP: 'ripple',
  USDC: 'usd-coin',
  ADA: 'cardano',
  AVAX: 'avalanche-2',
  DOGE: 'dogecoin',
  TRX: 'tron',
  DOT: 'polkadot',
  LINK: 'chainlink',
  MATIC: 'matic-network',
  POL: 'polygon-ecosystem-token',
  TON: 'the-open-network',
  SHIB: 'shiba-inu',
  LTC: 'litecoin',
  BCH: 'bitcoin-cash',
  UNI: 'uniswap',
  ATOM: 'cosmos',
  XLM: 'stellar',
  NEAR: 'near',
  APT: 'aptos',
  ARB: 'arbitrum',
  OP: 'optimism',
  FIL: 'filecoin',
  HBAR: 'hedera-hashgraph',
  ICP: 'internet-computer',
  SUI: 'sui',
  AAVE: 'aave',
  MKR: 'maker',
  INJ: 'injective-protocol',
  SEI: 'sei-network',
  TIA: 'celestia',
  RNDR: 'render-token',
  IMX: 'immutable-x',
  GRT: 'the-graph',
  ALGO: 'algorand',
  VET: 'vechain',
  ETC: 'ethereum-classic',
  XMR: 'monero',
  ZEC: 'zcash',
  CRV: 'curve-dao-token',
  LDO: 'lido-dao',
  SNX: 'havven',
  COMP: 'compound-governance-token',
  PEPE: 'pepe',
  WIF: 'dogwifcoin',
  BONK: 'bonk',
};

/** The assets the research index advertises full coverage for. */
export const FEATURED_SYMBOLS = ['BTC', 'ETH', 'SOL', 'ADA', 'AVAX', 'LINK'] as const;

export function knownId(symbol: string): string | undefined {
  return SYMBOL_TO_ID[symbol.toUpperCase()];
}

/**
 * Chain slug for DeFiLlama, where an asset is the gas token of a chain
 * that has a DeFi ecosystem worth reporting. Absent for assets that are
 * not a chain's native token.
 */
export const SYMBOL_TO_CHAIN: Record<string, string> = {
  ETH: 'Ethereum',
  SOL: 'Solana',
  AVAX: 'Avalanche',
  ADA: 'Cardano',
  BNB: 'BSC',
  MATIC: 'Polygon',
  POL: 'Polygon',
  ARB: 'Arbitrum',
  OP: 'OP Mainnet',
  NEAR: 'Near',
  APT: 'Aptos',
  SUI: 'Sui',
  TRX: 'Tron',
  TON: 'TON',
  ATOM: 'Cosmos',
  SEI: 'Sei',
  INJ: 'Injective',
  BTC: 'Bitcoin',
};

export function chainSlug(symbol: string): string | undefined {
  return SYMBOL_TO_CHAIN[symbol.toUpperCase()];
}
