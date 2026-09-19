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

Only `DATABASE_URL` and `AUTH_SECRET` are required. Market data, DeFi metrics and
news are live without any provider key at all; see **Providers** below for what
each key adds and what happens without it.

---

## Providers

| Domain | Provider | Key required | Behaviour without a key |
|---|---|---|---|
| Market data | CoinGecko | no | Live on the public tier; a key only raises the rate limit |
| DeFi metrics | DeFiLlama | **none exists** | Always live — the API needs no authentication |
| Chain metrics | Alchemy | yes | Block-level readings are omitted; DeFi metrics still shown |
| News | RSS + GNews | RSS no, GNews yes | RSS alone; GNews widens coverage |
| AI synthesis | OpenAI | yes | The Interpretation section reports itself unavailable |
| Email | Resend | yes | Messages are written to the server console |
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
OpenAI is unreachable.

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
```

---

## Notes

Figures come from live providers. Where a reading is derived rather than
measured — a 24-hour transaction count projected from a recent block sample, for
instance — the interface says so next to the number.

Nothing in BlockLens is investment advice.
