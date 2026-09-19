/**
 * Shared normalisation for both news providers.
 *
 * Slugs, topic mapping and ticker inference live here so an RSS article
 * and a GNews article that describe the same story come out identically
 * shaped — which is what makes deduplication and a single UI possible.
 */

/**
 * A short, stable, non-cryptographic hash (FNV-1a, base36).
 *
 * Used to suffix slugs. It only has to be deterministic and well spread,
 * not secure — so this avoids pulling in crypto for something that runs
 * on every article of every render.
 */
function shortHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 16777619, via shifts, kept in 32 bits.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, '0').slice(-7);
}

/**
 * A route segment for an article.
 *
 * Readable half from the headline, plus a hash of the canonical URL. The
 * hash is what guarantees uniqueness: two outlets running the same
 * headline, or one outlet reusing a headline, still get distinct slugs,
 * and the slug for a given article never changes between requests.
 *
 * The full URL is deliberately not used as the route — it would need
 * double-encoding and would leak a third-party address into our paths.
 */
export function articleSlug(title: string, url: string): string {
  const readable = title
    .normalize('NFKD')
    // Strip combining marks so accented headlines transliterate.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .filter(Boolean)
    // Cap length by whole words rather than mid-word.
    .reduce<string[]>((words, word) => {
      const candidate = [...words, word].join('-');
      return candidate.length <= 72 ? [...words, word] : words;
    }, [])
    .join('-');

  return `${readable || 'article'}-${shortHash(url)}`;
}

/**
 * Canonical subject areas.
 *
 * Sources file articles under their own taxonomies — CoinDesk uses
 * "Policy", Decrypt uses "Business", the Ethereum Foundation uses
 * "Research & Development". This maps the labels we actually see onto a
 * small shared set.
 *
 * Only known labels map. Anything unrecognised is dropped rather than
 * guessed at, and generic filing like "News" or "Latest News" carries no
 * information so it is discarded too. The result is that a topic filter
 * only ever reflects how a source really classified a piece.
 */
const TOPIC_MAP: Array<[test: RegExp, topic: string]> = [
  [/^(policy|regulation|regulatory|legislation|government|legal|clarity act|law)$/i, 'Regulation'],
  [/^(business|finance|financial|markets?|trading|economy|investing)$/i, 'Markets'],
  [/^(defi|decentrali[sz]ed finance|dex|lending|stablecoins?)$/i, 'DeFi'],
  [/^(research & development|research and development|research|technology|tech|protocol|engineering|development)$/i, 'Technology'],
  [/^(nft|nfts|gaming|culture|metaverse|art)$/i, 'Culture'],
  [/^(security|hacks?|exploits?|scams?)$/i, 'Security'],
  [/^(mining|miners)$/i, 'Mining'],
  [/^(people|opinion|interview|analysis)$/i, 'Analysis'],
];

/** Labels that are pure noise in every feed that emits them. */
const TOPIC_NOISE = /^(news|latest news|all|featured|home|crypto|cryptocurrency|blockchain|press release|sponsored)$/i;

export function normaliseTopics(rawCategories: string[]): {
  topics: string[];
  tags: string[];
} {
  const tags: string[] = [];
  const topics = new Set<string>();

  for (const raw of rawCategories) {
    const label = raw.trim();
    if (!label || TOPIC_NOISE.test(label)) continue;

    // Keep the source's own wording as provenance, capped so a feed
    // that emits twenty tags does not dominate the row.
    if (tags.length < 4 && !tags.some((t) => t.toLowerCase() === label.toLowerCase())) {
      tags.push(label);
    }

    const match = TOPIC_MAP.find(([test]) => test.test(label));
    if (match) topics.add(match[1]);
  }

  return { topics: [...topics], tags };
}

/**
 * Tickers named in an article.
 *
 * Word-boundary matched against both the long name and the ticker, so
 * "SOL" matches but "solution" does not. This is the signal the asset
 * filters and the per-asset research feed are built on.
 */
const TICKER_HINTS: Array<[RegExp, string]> = [
  [/\b(bitcoin|btc)\b/i, 'BTC'],
  [/\b(ethereum|ether|eth)\b/i, 'ETH'],
  [/\b(solana|sol)\b/i, 'SOL'],
  [/\b(cardano|ada)\b/i, 'ADA'],
  [/\b(avalanche|avax)\b/i, 'AVAX'],
  [/\b(chainlink|link)\b/i, 'LINK'],
  [/\b(ripple|xrp)\b/i, 'XRP'],
  [/\b(dogecoin|doge)\b/i, 'DOGE'],
  [/\b(polygon|matic)\b/i, 'MATIC'],
  [/\b(uniswap|uni)\b/i, 'UNI'],
  [/\b(arbitrum|arb)\b/i, 'ARB'],
  [/\b(optimism|op mainnet)\b/i, 'OP'],
  [/\b(polkadot|dot)\b/i, 'DOT'],
  [/\b(litecoin|ltc)\b/i, 'LTC'],
  [/\b(tether|usdt)\b/i, 'USDT'],
  [/\bbinance coin\b|\bbnb\b/i, 'BNB'],
];

export function inferTokens(text: string): string[] {
  return TICKER_HINTS.filter(([pattern]) => pattern.test(text)).map(([, ticker]) => ticker);
}

/** Collapses a headline to a comparison key for deduplication. */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * How much metadata an article carries.
 *
 * When the same story arrives from two feeds, the richer record wins —
 * so a version with an image and a real excerpt is preferred over a
 * bare headline.
 */
export function completeness(article: {
  imageUrl?: string;
  summary?: string;
  title?: string;
  topics?: string[];
  relatedTokens?: string[];
}): number {
  let score = 0;
  if (article.imageUrl) score += 3;
  // A summary that merely repeats the headline adds nothing.
  if (article.summary && article.summary !== article.title) {
    score += Math.min(3, Math.floor(article.summary.length / 80) + 1);
  }
  if (article.topics?.length) score += 2;
  if (article.relatedTokens?.length) score += 1;
  return score;
}
