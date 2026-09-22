# BlockLens

A crypto research platform. Every asset opens as one continuous dossier —
market structure, on-chain activity, tokenomics, project, events, risk, and a
clearly labelled AI interpretation.

BlockLens is a research product, not an exchange, a trading terminal or a price
tracker.

---

## Running it

```bash
npm install
cp .env.example .env      # then fill in DATABASE_URL and AUTH_SECRET
npx prisma db push        # creates/updates the schema
npm run dev
```

`AUTH_SECRET` must be at least 32 characters — generate one with
`openssl rand -base64 32`. In production the app refuses to sign sessions
without it rather than falling back to a default key.

Only `DATABASE_URL`, `DIRECT_URL` and `AUTH_SECRET` are required. On Vercel, `DATABASE_URL`
must be the Supabase **pooler** (IPv4) — see `.env.example`. Market data, DeFi metrics and
news are live without any provider key at all; see **Providers** below for what
each key adds and what happens without it.

---

## Providers

| Domain | Provider | Key required | Behaviour without a key |
|---|---|---|---|
| Market data | CoinGecko | no | Live on the public tier; a key only raises the rate limit |
| DeFi metrics | DeFiLlama | **none exists** | Always live — the API needs no authentication |
| Chain data & wallet import | Alchemy | yes | Wallet import is off; block-level readings omitted |
| Token prices by contract | Alchemy Prices | yes (same key) | Tokens stay unpriced — never estimated |
| News | RSS + GNews | RSS no, GNews yes | RSS alone; GNews widens coverage |
| AI interpretation & insights | Google Gemini (`GEMINI_MODEL`) | yes | Both report themselves unavailable |
| Email | Resend | yes | Dev: written to the console. Production: reported as failed |
| Risk scoring | *computed here* | — | Derived from live market and chain data |
| Supply facts | *derived here* | — | Derived from the market snapshot |

Two rules govern this table:

**Live-first.** Anything that can be live is live. Sample data still exists for
offline work, but it is opt-in via `BLOCKLENS_SAMPLE_DATA=true` and is never a
silent substitute for a failed call.

**Never invent a number.** A failed provider produces an explicit "temporarily
unavailable" state, not a remembered or fabricated figure. This is enforced by
the `DataResult` envelope in `src/services/result.ts`, and it is why the
Interpretation section goes blank rather than showing canned analysis when
Gemini is unreachable.

Where no provider sells the thing at all — risk scores, supply breakdowns —
BlockLens either computes it from data it already holds and **states the
arithmetic in the interface**, or omits it. `ComputedRiskService` scores
liquidity, market size, volatility, drawdown, supply overhang, position versus
high and on-chain usage, and each dimension prints the calculation it came from.
Vesting schedules and holder distributions are simply absent, because nothing in
this stack reports them.

Run `npm run verify:providers` to exercise every adapter against its real API and
print what came back. Domains without a key are reported as skipped, never as
passing.

---

## Portfolio

Transactions are the source of truth; everything else is derived by the
deterministic engine in `src/lib/portfolio/`. Gemini never computes a figure.

**Wallet import** is read-only: a public address, a chain and a label. Input
that looks like a private key or recovery phrase is refused and never stored.
Supported chains — Ethereum, Base, Arbitrum One, OP Mainnet, Polygon PoS and
Solana — are the ones verified to return full history through Alchemy. Each
sync imports a bounded slice and resumes where it stopped.

**Classification.** A transaction is reduced to signed asset movements, then:
different assets in and out → `SWAP`; only in → `TRANSFER_IN`; only out →
`TRANSFER_OUT`; the gas the wallet paid → `FEE`; Solana Stake-program
movements → `STAKE`/`UNSTAKE`. `BUY` and `SELL` are never inferred from chain
data — they come from manual entries or from the user reclassifying a leg.
Transfers between tracked wallets are marked internal. Receipts from untracked
addresses keep an **unknown** cost basis and are flagged for review.

**Cost basis: weighted-average cost**, one pool per asset (native gas assets
pooled across chains, tokens per contract). A disposal removes a proportional
slice of cost, so the average of what remains is unchanged. Realized PnL is
booked on sales, the outgoing side of swaps, and fees (a disposal at zero
proceeds). Transfers realize nothing. Units with unknown cost count toward
value but are excluded from PnL. PnL % = total PnL ÷ all known acquisition
cost. The full rules are at the top of `engine.ts`.

**Performance** is time-weighted (deposits and withdrawals are not returns),
on daily closes, over the last 30/90/180/365 days, compared with BTC and ETH
over the same dates. A total-market benchmark needs a paid CoinGecko plan and
is shown as unavailable rather than approximated.

**Risk metrics** — volatility, max drawdown, Sharpe, Sortino, correlation
with BTC, asset/chain concentration (HHI), stablecoin share — each state their
period, method, required data and limitations, and say "Insufficient data"
below 30 daily returns. There is no composite risk score.

**Alerts** (price above/below, 24h move, drawdown, allocation, large
transaction, wallet activity) fire on entering a condition, respect a
cooldown, and are deduplicated by a unique key per occurrence. They are
evaluated daily by Vercel Cron (`vercel.json`, `CRON_SECRET`) or on demand.

**AI insights** receive a numbered table of computed facts and must cite fact
ids. Statements that cite unknown facts, quote a number not among the facts,
or read as trading advice are dropped before display; the rest are labelled
FACT or AI INTERPRETATION. Output is cached by input hash.

---

## Architecture

```
src/
  app/                  routes; (marketing) (auth) (dashboard) groups
  components/
    brand/              logo and wordmark
    data/               data-display primitives (figures, registers, plots)
    layout/             navigation and page chrome
    ui/                 interaction primitives
    visual/             the hero backdrop
  features/             screen-level composition, by domain
  server/
    auth/               sessions, password hashing, tokens
    data/               server-only reads — the boundary UI talks to
    db/                 Prisma client
  services/
    <domain>/           interface + adapters + factory, per domain
    http.ts             the one outbound HTTP path
    result.ts           the DataResult envelope
    providers.ts        key resolution (server-side only)
  lib/                  formatting, validation, constants
```

The flow is one direction only:

```
provider API → adapter → service interface → normalisation
            → server/data (cache + DataResult) → UI
```

**Components never call a provider.** `src/server/data/*` is the only place that
touches `src/services/*`, and every module in both starts with
`import 'server-only'`, so an accidental client import fails the build instead of
shipping an API key to the browser. No key is ever read through a `NEXT_PUBLIC_`
variable, and CoinGecko's key travels in a header rather than a query string so
it cannot land in a log.

Screens are server components that fetch once and pass data down. Client
components exist only where there is real interaction: the price chart, the
search console, the contents tracker, the watchlist controls, the account menu,
and the forms.

### News routes without persistence

`/news/[slug]` resolves out of the cached provider window rather than a
database. A slug is a pure function of the article's title and canonical URL
(readable stem plus an FNV-1a hash of the URL), so it is stable across requests,
unique even when two outlets run the same headline, and needs no stored row. An
article that ages out of the window returns 404 with a page that says exactly
that — which is why no migration was added for this feature.

Both providers normalise into one `NewsArticle`, and duplicates are collapsed on
the headline with the richer record winning; the loser's image, excerpt, topics
and tickers are folded in rather than discarded. Topic filters come from the
categories sources file themselves, mapped onto a small shared set — a chip only
appears when at least two articles really carry it, so the bar never offers an
invented category or an empty filter.

### Caching

`fetch` responses use the framework data cache with a window chosen per endpoint
— 60s for prices, 5m for market aggregates, 15m for series and news, 24h for
project descriptions. Alchemy is reached over POST, which that cache cannot
store, so the composed on-chain reading is wrapped in `unstable_cache` instead.

### Adding a provider

Implement the domain's `interface.ts`, then switch on the key in its `index.ts`
factory. Nothing else changes:

```ts
instance = sampleDataEnabled()
  ? new MockMarketDataService()
  : new CoinGeckoMarketService(providerKeys.coingecko);
```

---

## Design system

The system lives in `src/app/globals.css` as Tailwind v4 `@theme` tokens. Use
the token utilities (`text-ink-dim`, `border-line`, `bg-panel`) — never raw hex
and never arbitrary colour values.

**The idea.** *The instrument plate.* Warm graphite surfaces lit by a cold pale
"instrument light". The identity comes from the surface ramp and the typography,
not from an accent hue, which is why the accent stays reserved for interaction.

**Structure is carried by hairlines, not boxes.** A lens reveals structure; a
card hides it. Before adding a border and a radius, ask whether a rule, an
aligned column, or a `.bracket` would do the job. `Register`, `Block` and
`Figure`-style layouts exist so a metric never has to become a rounded rectangle.

**Typography is a rhythm, not a size ladder.** Use the role classes — `.t-display`,
`.t-editorial`, `.t-lede`, `.t-body`, `.t-micro`, `.t-figure` — rather than
composing `text-sm`/`text-xs` by hand. Three voices, with one rule:

| Voice | Face | Carries |
|---|---|---|
| Display | Newsreader (serif) | Headlines, and arguments — never figures |
| Interface | Inter | Reading text, controls |
| Technical | JetBrains Mono | Figures **and** structural labels |

Mono on *labels*, not just numbers, is what makes the interface read technical.

**Colour is validated, not chosen by eye.** Every ink step clears WCAG AA text
contrast on all four surfaces, and the six-slot plot ramp clears CVD-separation
and contrast gates against the page ground. Re-run the checks before changing
any value in `@theme`. Categorical hues are assigned in fixed order and never
cycled; status is never communicated by colour alone, which is why `Delta` ships
a glyph and a sign, and every risk meter states its reading in words.

**Motion is calm.** One easing family, entrances only, and everything surrenders
under `prefers-reduced-motion`. There is no 3D and no canvas anywhere: the hero
backdrop is two CSS grids at different scales, one off-axis light and a horizon
hairline, with a single 48-second drift of the light as the only ambient motion.
It is designed to look finished standing still, which is exactly what reduced
motion gives it.

---

## Commands

```bash
npm run dev               # development server
npm run build             # production build
npm run lint              # eslint, clean at --max-warnings=0
npm run typecheck         # tsc --noEmit
npm run verify:providers  # exercise every adapter against its real API
npm run verify:auth       # auth preflight against the configured database
npm test                  # unit tests (engine, classification, risk, alerts, AI, providers — mocked)
npm run test:e2e          # end-to-end against a running server (BASE_URL), real providers
```

---

## Notes

Figures come from live providers. Where a reading is derived rather than
measured — a 24-hour transaction count projected from a recent block sample, for
instance — the interface says so next to the number.

Nothing in BlockLens is investment advice.
