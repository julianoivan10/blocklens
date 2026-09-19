import 'server-only';

import { fetchText, settleAll } from '../http';
import type { NewsArticle } from '@/types';

/**
 * RSS news adapter.
 *
 * Feeds are parsed with targeted regular expressions rather than a DOM
 * parser: the shapes consumed here are a fixed, known set, and this
 * avoids shipping an XML dependency into the server bundle for six
 * feeds. Anything unparseable is dropped rather than guessed at.
 *
 * Both RSS 2.0 (`<item>`) and Atom (`<entry>`) are handled, since crypto
 * project blogs commonly publish Atom.
 */

interface Feed {
  source: string;
  url: string;
  /** Tickers this feed is inherently about, if any. */
  tokens?: string[];
}

const FEEDS: Feed[] = [
  { source: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { source: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { source: 'Decrypt', url: 'https://decrypt.co/feed' },
  { source: 'The Defiant', url: 'https://thedefiant.io/api/feed' },
  { source: 'Ethereum Foundation', url: 'https://blog.ethereum.org/en/feed.xml', tokens: ['ETH'] },
];

const REVALIDATE = 900;

function decode(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;|&rsquo;/g, '’')
    .replace(/&#8216;|&lsquo;/g, '‘')
    .replace(/&#8220;|&ldquo;/g, '“')
    .replace(/&#8221;|&rdquo;/g, '”')
    .replace(/&#8212;|&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block: string, name: string): string | undefined {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? decode(match[1]) : undefined;
}

/** Atom puts the URL in an attribute rather than in the element body. */
function atomLink(block: string): string | undefined {
  const alternate = block.match(
    /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i
  );
  if (alternate) return alternate[1];
  const plain = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  return plain?.[1];
}

function truncate(text: string, max = 260): string {
  if (text.length <= max) return text;
  const clipped = text.slice(0, max);
  const stop = clipped.lastIndexOf('. ');
  return stop > max * 0.5 ? clipped.slice(0, stop + 1) : `${clipped.trim()}…`;
}

/** Tickers mentioned in the headline, used to attach articles to assets. */
const TICKER_HINTS: Array<[RegExp, string]> = [
  [/\bbitcoin\b|\bbtc\b/i, 'BTC'],
  [/\bethereum\b|\beth\b|\bether\b/i, 'ETH'],
  [/\bsolana\b|\bsol\b/i, 'SOL'],
  [/\bcardano\b|\bada\b/i, 'ADA'],
  [/\bavalanche\b|\bavax\b/i, 'AVAX'],
  [/\bchainlink\b|\blink\b/i, 'LINK'],
  [/\bripple\b|\bxrp\b/i, 'XRP'],
  [/\bdogecoin\b|\bdoge\b/i, 'DOGE'],
  [/\bpolygon\b|\bmatic\b/i, 'MATIC'],
  [/\buniswap\b|\buni\b/i, 'UNI'],
  [/\barbitrum\b|\barb\b/i, 'ARB'],
];

export function inferTokens(text: string): string[] {
  return TICKER_HINTS.filter(([pattern]) => pattern.test(text)).map(([, ticker]) => ticker);
}

function parseFeed(xml: string, feed: Feed): NewsArticle[] {
  const blocks = [
    ...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi),
  ].map((m) => m[0]);

  const articles: NewsArticle[] = [];

  for (const block of blocks) {
    const title = tag(block, 'title');
    if (!title) continue;

    const link = tag(block, 'link') || atomLink(block);
    if (!link || !/^https?:\/\//.test(link)) continue;

    const published =
      tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || tag(block, 'dc:date');
    const timestamp = published ? Date.parse(published) : NaN;
    // An article without a usable date cannot be ordered, so it is
    // dropped rather than given "now".
    if (Number.isNaN(timestamp)) continue;

    const body =
      tag(block, 'description') || tag(block, 'summary') || tag(block, 'content') || '';

    articles.push({
      id: `rss:${link}`,
      title,
      summary: truncate(body) || title,
      source: feed.source,
      url: link,
      publishedAt: new Date(timestamp).toISOString(),
      relatedTokens: [...new Set([...(feed.tokens ?? []), ...inferTokens(`${title} ${body}`)])],
    });
  }

  return articles;
}

export class RssNewsProvider {
  /** All configured feeds, merged, de-duplicated and newest first. */
  async fetchAll(limit = 20): Promise<NewsArticle[]> {
    const { values } = await settleAll<NewsArticle[]>(
      FEEDS.map((feed) => ({
        label: `rss:${feed.source}`,
        promise: fetchText(feed.url, {
          provider: `rss:${feed.source}`,
          revalidate: REVALIDATE,
          tags: ['news', 'rss'],
          timeoutMs: 7_000,
        }).then((xml) => parseFeed(xml, feed)),
      }))
    );

    const seen = new Set<string>();
    return values
      .flat()
      .filter((article) => {
        // Syndicated stories appear in several feeds; key on the
        // normalised headline so the reader sees each story once.
        const key = article.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .slice(0, limit);
  }
}
