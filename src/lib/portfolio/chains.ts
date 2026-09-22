/**
 * The chain registry.
 *
 * Everything chain-specific that the rest of the app needs — label,
 * address format, native asset, explorer — is declared here once. The
 * provider adapters add their own transport details (RPC slugs) in
 * `src/services/chains/*`; no component or engine branches on a chain id.
 *
 * Only chains that were verified to return full transfer history and
 * balances through the configured provider (Alchemy) are listed.
 */

export type ChainId = 'ETHEREUM' | 'BASE' | 'ARBITRUM' | 'OPTIMISM' | 'POLYGON' | 'SOLANA';

export type ChainFamily = 'evm' | 'solana';

export interface ChainInfo {
  id: ChainId;
  label: string;
  family: ChainFamily;
  /** Symbol of the gas asset. Its cost-basis pool is shared across chains. */
  nativeSymbol: string;
  nativeName: string;
  nativeDecimals: number;
  explorerTx: (hash: string) => string;
  explorerAddress: (address: string) => string;
}

export const CHAINS: Record<ChainId, ChainInfo> = {
  ETHEREUM: {
    id: 'ETHEREUM',
    label: 'Ethereum',
    family: 'evm',
    nativeSymbol: 'ETH',
    nativeName: 'Ether',
    nativeDecimals: 18,
    explorerTx: (h) => `https://etherscan.io/tx/${h}`,
    explorerAddress: (a) => `https://etherscan.io/address/${a}`,
  },
  BASE: {
    id: 'BASE',
    label: 'Base',
    family: 'evm',
    nativeSymbol: 'ETH',
    nativeName: 'Ether',
    nativeDecimals: 18,
    explorerTx: (h) => `https://basescan.org/tx/${h}`,
    explorerAddress: (a) => `https://basescan.org/address/${a}`,
  },
  ARBITRUM: {
    id: 'ARBITRUM',
    label: 'Arbitrum One',
    family: 'evm',
    nativeSymbol: 'ETH',
    nativeName: 'Ether',
    nativeDecimals: 18,
    explorerTx: (h) => `https://arbiscan.io/tx/${h}`,
    explorerAddress: (a) => `https://arbiscan.io/address/${a}`,
  },
  OPTIMISM: {
    id: 'OPTIMISM',
    label: 'OP Mainnet',
    family: 'evm',
    nativeSymbol: 'ETH',
    nativeName: 'Ether',
    nativeDecimals: 18,
    explorerTx: (h) => `https://optimistic.etherscan.io/tx/${h}`,
    explorerAddress: (a) => `https://optimistic.etherscan.io/address/${a}`,
  },
  POLYGON: {
    id: 'POLYGON',
    label: 'Polygon PoS',
    family: 'evm',
    nativeSymbol: 'POL',
    nativeName: 'Polygon Ecosystem Token',
    nativeDecimals: 18,
    explorerTx: (h) => `https://polygonscan.com/tx/${h}`,
    explorerAddress: (a) => `https://polygonscan.com/address/${a}`,
  },
  SOLANA: {
    id: 'SOLANA',
    label: 'Solana',
    family: 'solana',
    nativeSymbol: 'SOL',
    nativeName: 'Solana',
    nativeDecimals: 9,
    explorerTx: (h) => `https://solscan.io/tx/${h}`,
    explorerAddress: (a) => `https://solscan.io/account/${a}`,
  },
};

export const CHAIN_IDS = Object.keys(CHAINS) as ChainId[];

export function isChainId(value: unknown): value is ChainId {
  return typeof value === 'string' && value in CHAINS;
}

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/** Base58, 32–44 chars: the length range of an ed25519 public key. */
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Validates and canonicalises a public address. Returns null for
 * anything that is not a plain address — which includes, deliberately,
 * anything shaped like a private key or a seed phrase.
 */
export function normalizeAddress(chain: ChainId, raw: string): string | null {
  const value = raw.trim();
  if (CHAINS[chain].family === 'evm') {
    return EVM_ADDRESS.test(value) ? value.toLowerCase() : null;
  }
  return SOLANA_ADDRESS.test(value) ? value : null;
}

/**
 * Heuristic guard: rejects input that looks like secret material, so a
 * pasted private key or mnemonic is refused before it is stored or sent
 * anywhere. BlockLens never asks for either.
 */
export function looksLikeSecret(raw: string): boolean {
  const value = raw.trim();
  // 64-hex (EVM private key), with or without 0x.
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(value)) return true;
  // Base58 Solana secret keys are 87–88 characters.
  if (/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(value)) return true;
  // A JSON byte array (Solana CLI keypair file).
  if (/^\[\s*\d+(\s*,\s*\d+){31,}\s*\]$/.test(value)) return true;
  // 12/15/18/21/24 lower-case words: a BIP-39 mnemonic.
  const words = value.split(/\s+/);
  if ([12, 15, 18, 21, 24].includes(words.length) && words.every((w) => /^[a-z]{3,8}$/.test(w))) {
    return true;
  }
  return false;
}

/** The cost-basis pool key for a chain's gas asset. */
export function nativeAssetKey(chain: ChainId): string {
  return `sym:${CHAINS[chain].nativeSymbol}`;
}

export function tokenAssetKey(chain: ChainId, contract: string): string {
  return CHAINS[chain].family === 'solana'
    ? `spl:${contract}`
    : `erc20:${chain}:${contract.toLowerCase()}`;
}

/** Symbol-keyed pools are priced by symbol; contract pools by address. */
export function parseAssetKey(
  key: string
):
  | { kind: 'symbol'; symbol: string }
  | { kind: 'erc20'; chain: ChainId; contract: string }
  | { kind: 'spl'; mint: string }
  | null {
  if (key.startsWith('sym:')) return { kind: 'symbol', symbol: key.slice(4) };
  if (key.startsWith('erc20:')) {
    const [, chain, contract] = key.split(':');
    return isChainId(chain) && contract ? { kind: 'erc20', chain, contract } : null;
  }
  if (key.startsWith('spl:')) return { kind: 'spl', mint: key.slice(4) };
  return null;
}
