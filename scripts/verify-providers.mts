/**
 * Live provider smoke test.
 *
 * Exercises each adapter against its real API and prints what came back,
 * so "it compiles" is never mistaken for "it works". Domains whose key is
 * absent are reported as skipped, never as passing.
 *
 *   npm run verify:providers
 */
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const amber = (s: string) => `\x1b[33m${s}\x1b[0m`;

let failures = 0;
let skipped = 0;

async function check(label: string, fn: () => Promise<string>) {
  try {
    const detail = await fn();
    console.log(`  ${green('ok')}    ${label}`);
    console.log(`        ${detail}`);
  } catch (error) {
    failures++;
    console.log(`  ${red('FAIL')}  ${label}`);
    console.log(`        ${(error as Error).message}`);
  }
}

function skip(label: string, why: string) {
  skipped++;
  console.log(`  ${amber('skip')}  ${label}`);
  console.log(`        ${why}`);
}

const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const bn = (n: number) => `$${(n / 1e9).toFixed(2)}B`;
const tn = (n: number) => `$${(n / 1e12).toFixed(2)}T`;

async function main() {
  const { CoinGeckoMarketService } = await import('../src/services/market/coingecko.js');
  const { DefiLlamaService } = await import('../src/services/onchain/defillama.js');
  const { AlchemyChainService } = await import('../src/services/onchain/alchemy.js');
  const { RssNewsProvider } = await import('../src/services/news/rss.js');
  const { GNewsProvider } = await import('../src/services/news/gnews.js');
  const { GeminiResearchService } = await import('../src/services/ai/research.js');
  const { GeminiClient } = await import('../src/services/ai/gemini.js');
  const { DEFAULT_GEMINI_MODEL } = await import('../src/services/ai/config.js');

  const cg = new CoinGeckoMarketService(process.env.MARKET_DATA_API_KEY);

  console.log(`\n${'CoinGecko — market data'}`);
  console.log(`  key: ${process.env.MARKET_DATA_API_KEY ? 'configured' : 'none (public tier)'}`);

  await check('getTokenOverview("BTC")', async () => {
    const t = await cg.getTokenOverview('BTC');
    if (!t) throw new Error('returned null');

    const required = ['currentPrice', 'marketCap', 'totalVolume', 'circulatingSupply', 'ath', 'atl'] as const;
    const empty = required.filter((k) => typeof t[k] !== 'number' || t[k] === 0);
    if (empty.length) throw new Error(`fields empty: ${empty.join(', ')}`);
    if (!t.athDate || !t.atlDate) throw new Error('ATH/ATL dates missing');

    return [
      `${t.name} (${t.symbol}) rank ${t.marketCapRank}`,
      `price ${usd(t.currentPrice)} · 24h ${t.priceChangePercentage24h.toFixed(2)}% · 7d ${t.priceChangePercentage7d?.toFixed(2) ?? 'n/a'}%`,
      `cap ${tn(t.marketCap)} · vol ${bn(t.totalVolume)}`,
      `supply ${(t.circulatingSupply / 1e6).toFixed(2)}M circ / ${t.maxSupply ? `${(t.maxSupply / 1e6).toFixed(0)}M max` : 'uncapped'}`,
      `ATH ${usd(t.ath)} (${t.athDate.slice(0, 10)}) · ATL ${usd(t.atl)} (${t.atlDate.slice(0, 10)})`,
      `categories: ${t.categories?.join(', ') || 'none'} · description: ${t.description ? `${t.description.length} chars` : 'none'}`,
      `links: ${Object.entries(t.links ?? {}).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'}`,
    ].join('\n        ');
  });

  await check('getMarketSummary()', async () => {
    const s = await cg.getMarketSummary();
    if (!s.totalMarketCap) throw new Error('no total market cap');
    return `cap ${tn(s.totalMarketCap)} (${s.marketCapChange24h.toFixed(2)}% 24h) · vol ${bn(s.totalVolume24h)} · BTC ${s.btcDominance.toFixed(1)}% · ETH ${s.ethDominance.toFixed(1)}% · ${s.activeCryptocurrencies.toLocaleString('en-US')} assets`;
  });

  await check('getOverviewBatch(["BTC","ETH","SOL"])', async () => {
    const rows = await cg.getOverviewBatch(['BTC', 'ETH', 'SOL']);
    if (rows.length !== 3) throw new Error(`expected 3 rows, got ${rows.length}`);
    if (rows[0].symbol !== 'BTC') throw new Error('caller order not preserved');
    return rows.map((r) => `${r.symbol} ${usd(r.currentPrice)} ${r.priceChangePercentage24h.toFixed(2)}%`).join(' · ');
  });

  await check('getPriceSeries("BTC", 90)', async () => {
    const pts = await cg.getPriceSeries('BTC', 90);
    if (pts.length < 60) throw new Error(`only ${pts.length} daily points — expected ~90`);
    const malformed = pts.filter((p) => !Number.isFinite(p.value) || p.time > 2e10 || p.time < 1e9);
    if (malformed.length) throw new Error(`${malformed.length} malformed points`);
    const stepDays = (pts[1].time - pts[0].time) / 86_400;
    if (stepDays < 0.9 || stepDays > 1.1) throw new Error(`step is ${stepDays.toFixed(2)}d, expected daily`);
    const first = new Date(pts[0].time * 1000).toISOString().slice(0, 10);
    const last = new Date(pts[pts.length - 1].time * 1000).toISOString().slice(0, 10);
    return `${pts.length} daily closes ${first} → ${last} · last ${usd(pts[pts.length - 1].value)}`;
  });

  await check('getTrending()', async () => {
    const rows = await cg.getTrending();
    if (!rows.length) throw new Error('empty');
    return `${rows.length}: ${rows.slice(0, 5).map((r) => r.symbol).join(', ')}`;
  });

  await check('getTopGainers() / getTopLosers()', async () => {
    const [up, down] = await Promise.all([cg.getTopGainers(), cg.getTopLosers()]);
    if (!up.length || !down.length) throw new Error('empty mover list');
    if (up[0].priceChangePercentage24h < down[0].priceChangePercentage24h) {
      throw new Error('gainers/losers sorted the wrong way round');
    }
    return `up: ${up.map((r) => `${r.symbol} ${r.priceChangePercentage24h.toFixed(1)}%`).join(', ')}\n        down: ${down.map((r) => `${r.symbol} ${r.priceChangePercentage24h.toFixed(1)}%`).join(', ')}`;
  });

  await check('searchTokens("ether")', async () => {
    const rows = await cg.searchTokens('ether');
    if (!rows.length) throw new Error('empty');
    return `${rows.length} hits · top: ${rows.slice(0, 4).map((r) => r.symbol).join(', ')}`;
  });

  console.log('\nDeFiLlama — DeFi metrics (no key required)');
  const llama = new DefiLlamaService();
  for (const symbol of ['ETH', 'SOL']) {
    await check(`getChainMetrics("${symbol}")`, async () => {
      const m = await llama.getChainMetrics(symbol);
      if (!m) throw new Error('returned null');
      if (!m.tvl) throw new Error('no TVL');
      return `${m.chainLabel} TVL ${bn(m.tvl)}${m.fees24h ? ` · fees 24h ${usd(m.fees24h)}` : ''}${m.feesChange24h !== undefined ? ` (${m.feesChange24h.toFixed(1)}%)` : ''}${m.revenue24h ? ` · revenue 24h ${usd(m.revenue24h)}` : ''}`;
    });
  }

  console.log('\nRSS — crypto press and project blogs (no key required)');
  await check('RssNewsProvider.fetchAll(12)', async () => {
    const articles = await new RssNewsProvider().fetchAll(12);
    if (articles.length < 3) throw new Error(`only ${articles.length} articles`);
    const badDates = articles.filter((a) => Number.isNaN(Date.parse(a.publishedAt)));
    if (badDates.length) throw new Error(`${badDates.length} unparseable dates`);
    const sources = [...new Set(articles.map((a) => a.source))];
    const tagged = articles.filter((a) => a.relatedTokens?.length).length;
    return `${articles.length} articles from ${sources.length} sources (${sources.join(', ')})\n        ${tagged} tagged with a ticker · newest: "${articles[0].title.slice(0, 64)}…"`;
  });

  console.log('\nNews — normalisation, slugs and deduplication');
  {
    const { CompositeNewsService } = await import('../src/services/news/composite.js');
    const { articleSlug } = await import('../src/services/news/normalise.js');

    const news = new CompositeNewsService(process.env.NEWS_API_KEY);

    await check('CompositeNewsService.getLatest(40)', async () => {
      const articles = await news.getLatest(40);
      if (articles.length < 10) throw new Error(`only ${articles.length} articles`);

      // Shape: every article must carry the fields the UI relies on.
      const missing = articles.filter((a) => !a.slug || !a.title || !a.url || !a.source);
      if (missing.length) throw new Error(`${missing.length} articles missing core fields`);

      // Slugs must be unique and URL-safe.
      const slugs = articles.map((a) => a.slug);
      const unique = new Set(slugs);
      if (unique.size !== slugs.length) {
        throw new Error(`${slugs.length - unique.size} duplicate slug(s)`);
      }
      const unsafe = slugs.filter((s) => !/^[a-z0-9-]+$/.test(s));
      if (unsafe.length) throw new Error(`unsafe slug: ${unsafe[0]}`);

      // Slugs must be stable: same inputs, same slug.
      const first = articles[0];
      if (articleSlug(first.title, first.url) !== first.slug) {
        throw new Error('slug is not reproducible from title + url');
      }

      // No two articles should share a normalised headline.
      const keys = new Set(articles.map((a) => a.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()));
      if (keys.size !== articles.length) {
        throw new Error(`${articles.length - keys.size} duplicate headline(s) survived dedup`);
      }

      const withImage = articles.filter((a) => a.imageUrl).length;
      const withTopics = articles.filter((a) => a.topics?.length).length;
      const withTokens = articles.filter((a) => a.relatedTokens?.length).length;
      const withExcerpt = articles.filter((a) => a.summary && a.summary !== a.title).length;
      const sources = [...new Set(articles.map((a) => a.source))];
      const insecure = articles.filter((a) => a.imageUrl && !a.imageUrl.startsWith('https://'));
      if (insecure.length) throw new Error(`${insecure.length} non-https image(s)`);

      const topics = [...new Set(articles.flatMap((a) => a.topics ?? []))];

      return [
        `${articles.length} articles · ${sources.length} sources (${sources.slice(0, 6).join(', ')})`,
        `images ${withImage}/${articles.length} · excerpts ${withExcerpt}/${articles.length} · topics ${withTopics}/${articles.length} · tickers ${withTokens}/${articles.length}`,
        `topics seen: ${topics.join(', ') || 'none'}`,
        `slug sample: ${first.slug}`,
      ].join('\n        ');
    });

    await check('getByToken("BTC") stays asset-scoped', async () => {
      const articles = await news.getByToken('BTC', 6);
      if (articles.length === 0) throw new Error('no BTC articles');
      const offTopic = articles.filter(
        (a) => !/bitcoin|btc/i.test(`${a.title} ${a.summary}`)
      );
      return `${articles.length} articles, ${articles.length - offTopic.length} explicitly naming Bitcoin · newest "${articles[0].title.slice(0, 54)}…"`;
    });

    await check('RSS-only path still serves when GNews is absent', async () => {
      // Constructed without a key: the composite must fall back to RSS
      // alone rather than failing.
      const rssOnly = new CompositeNewsService(undefined);
      const articles = await rssOnly.getLatest(12);
      if (articles.length < 5) throw new Error(`only ${articles.length} articles without GNews`);
      return `${articles.length} articles from RSS alone`;
    });

    await check('a failing GNews does not take the feed down', async () => {
      // A deliberately invalid key makes GNews reject. RSS must carry the
      // feed regardless, and the reader must not be told which provider
      // broke.
      const broken = new CompositeNewsService('invalid-key-for-failure-test');
      const articles = await broken.getLatest(12);
      if (articles.length < 5) {
        throw new Error(`GNews failure degraded the feed to ${articles.length} articles`);
      }
      const sources = [...new Set(articles.map((a) => a.source))];
      return `${articles.length} articles still served from ${sources.length} RSS sources while GNews errored`;
    });
  }

  console.log('\nBlockLens — computed risk and derived supply (no provider sells these)');
  {
    const { ComputedRiskService } = await import('../src/services/risk/computed.js');
    const { DerivedTokenomicsService } = await import('../src/services/tokenomics/derived.js');

    await check('ComputedRiskService.getAssessment("BTC")', async () => {
      const token = await cg.getTokenOverview('BTC');
      if (!token) throw new Error('no token');
      const series = await cg.getPriceSeries('BTC', 90);
      const onchain = await llama.getChainMetrics('BTC').catch(() => null);
      const tokenomics = await new DerivedTokenomicsService().getTokenomics('BTC', token);

      const risk = await new ComputedRiskService().getAssessment('BTC', {
        token,
        series,
        onchain,
        tokenomics,
      });

      if (risk.dimensions.length < 3) {
        throw new Error(`only ${risk.dimensions.length} dimensions computed`);
      }
      if (risk.isDemo) throw new Error('computed assessment flagged as demo');
      if (risk.dimensions.some((d) => d.score < 0 || d.score > 100)) {
        throw new Error('scores out of range');
      }
      const undescribed = risk.dimensions.filter((d) => (d.description ?? '').length < 20);
      if (undescribed.length) {
        throw new Error(`${undescribed.length} dimension(s) do not state their method`);
      }

      return [
        `composite ${risk.overallScore}/100 from ${risk.dimensions.length} dimensions`,
        risk.dimensions.map((d) => `${d.name} ${d.score} (${d.label})`).join(' · '),
        `method shown, e.g. — ${risk.dimensions[0].description}`,
      ].join('\n        ');
    });

    await check('DerivedTokenomicsService.getTokenomics("BTC")', async () => {
      const token = await cg.getTokenOverview('BTC');
      if (!token) throw new Error('no token');

      const t = await new DerivedTokenomicsService().getTokenomics('BTC', token);
      if (!t) throw new Error('returned null');
      if (!t.circulatingSupply) throw new Error('no circulating supply');

      const sum = t.distribution?.reduce((acc, d) => acc + d.percentage, 0) ?? 0;
      if (t.distribution && Math.abs(sum - 100) > 0.5) {
        throw new Error(`distribution sums to ${sum}, not 100`);
      }

      return `${(t.circulatingSupply / 1e6).toFixed(2)}M circulating · ${t.circulatingPercentage}% of cap · ${
        t.distribution
          ? `${t.distribution.length} measured slices summing to ${sum.toFixed(1)}%`
          : 'no breakdown (correctly omitted)'
      } · vesting ${t.vestingSchedule ? 'present' : 'omitted, no provider'}`;
    });
  }

  console.log('\nAlchemy — chain infrastructure');
  if (!process.env.ALCHEMY_API_KEY) {
    skip('AlchemyChainService', 'ALCHEMY_API_KEY not set — adapter not exercised');
  } else {
    const alchemy = new AlchemyChainService(process.env.ALCHEMY_API_KEY);
    for (const symbol of ['ETH', 'SOL']) {
      await check(`getChainStats("${symbol}")`, async () => {
        const s = await alchemy.getChainStats(symbol);
        if (!s) throw new Error('returned null');
        if (!s.latestBlock) throw new Error('no head block');
        return `${s.chainLabel} block ${s.latestBlock.toLocaleString('en-US')} · ${s.blockTime ?? '?'}s blocks · ${s.transactionsPerBlock ?? '?'} tx/block${s.gasPriceGwei ? ` · gas ${s.gasPriceGwei} gwei` : ''}${s.transactionCount24h ? ` · ~${s.transactionCount24h.toLocaleString('en-US')} tx/24h (derived: ${s.derived?.join(',')})` : ''}`;
      });
    }
  }

  console.log('\nGNews — news API');
  if (!process.env.NEWS_API_KEY) {
    skip('GNewsProvider', 'NEWS_API_KEY not set — adapter not exercised');
  } else {
    await check('search("Bitcoin")', async () => {
      const articles = await new GNewsProvider(process.env.NEWS_API_KEY!).search('Bitcoin', 5);
      if (!articles.length) throw new Error('empty');
      return `${articles.length} articles · newest: "${articles[0].title.slice(0, 60)}…" (${articles[0].source})`;
    });
  }

  console.log('\nGemini — research synthesis');
  if (!process.env.GEMINI_API_KEY) {
    skip('GeminiResearchService', 'GEMINI_API_KEY not set — adapter not exercised');
  } else {
    const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
    await check(`generateSummary("BTC") via ${model}`, async () => {
      const token = await cg.getTokenOverview('BTC');
      if (!token) throw new Error('no token to summarise');
      const onchain = await llama.getChainMetrics('BTC').catch(() => null);
      const news = await new RssNewsProvider().fetchAll(6).catch(() => []);

      const svc = new GeminiResearchService(new GeminiClient(process.env.GEMINI_API_KEY!, model));
      const s = await svc.generateSummary('BTC', { token, onchain, news });

      if (s.summary.length < 80) throw new Error(`summary suspiciously short (${s.summary.length} chars)`);
      if (s.keyObservations.length < 3) throw new Error('too few observations');
      if (s.isDemo) throw new Error('live summary flagged as demo');
      return `${s.summary.length} chars · ${s.keyObservations.length} observations · ${s.notableRisks.length} risks · ${s.importantDevelopments.length} developments\n        "${s.summary.slice(0, 120)}…"`;
    });
  }

  console.log('');
  if (failures > 0) {
    console.log(red(`${failures} provider check(s) failed.`) + (skipped ? ` ${skipped} skipped.` : ''));
    process.exit(1);
  }
  console.log(green('All exercised providers returned usable data.') + (skipped ? ` ${amber(`${skipped} skipped (no key).`)}` : ''));
}

void main();
