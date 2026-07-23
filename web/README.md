# @norien/web

The Norien frontend: a public marketing site and the application, in one Next.js
15 App Router project on **:3001**, reading the registry on **:3000**.

```bash
npm run dev --workspace @norien/web    # :3001, expects the registry on :3000
```

The registry must be running (`npm run dev` at the repo root).

---

## Two shells, one design system

The root layout owns the document and nothing else. Chrome lives one level down,
which is what lets the two halves look nothing alike while sharing every token:

| Group | Chrome | Routes |
| --- | --- | --- |
| `(marketing)` | Sticky header, wide measure, footer | `/`, `/docs`, `/pricing`, `/blog`, `/changelog`, `/about`, `/contact`, `/privacy`, `/terms` |
| `(auth)` | Centred card, no nav | `/login`, `/signup` |
| `app/` | Fixed sidebar, topbar, content column | everything under `/app` |

`/` is a marketing page. The dashboard is `/app`.

## The one rule

Every page reads **only** from Norien, through [`src/lib/api.ts`](src/lib/api.ts)
— the market endpoints (`/api/*`), the registry (`/agents`, `/tools`, `/search`),
and the runtime supervisor. The app has no knowledge of Codex, CoinGecko,
DeFiLlama, GitHub, Blockscout, or the RPC node; that aggregation already happened
server-side. No component fetches anything directly, and there is no mock data
anywhere — if a page shows a number, a provider returned it.

## Application routes

| Route | Shows |
| --- | --- |
| `/app` | Eight widgets: trending, new launches, highest volume, biggest gainers, latest projects, latest registry, latest tools, network status |
| `/app/markets` | Dense token table — search, sort, filter, paginate, all URL-driven |
| `/app/tokens` | The same data as a browsable card directory |
| `/app/search` | Global search across market data **and** the registry |
| `/app/token/[address]` | Price, market cap, liquidity, holders, 24h range, supply, contract, links |
| `/app/wallet/[address]` | Balance, per-token holdings, transactions, token transfers |
| `/app/contract/[address]` | Verification, creator, read functions, events, ABI, source |
| `/app/projects`, `/app/project/[slug]` | TVL rankings; TVL by chain, GitHub health, contributors, commits |
| `/app/registry`, `/app/registry/[slug]` | Published agents; manifest, requirements, live runtime readiness, versions |
| `/app/tools`, `/app/tools/[slug]` | The marketplace; schemas, permissions, dependencies, versions |
| `/app/runtime` | Supervisor state, per-agent status and health, registry and chain connectivity |
| `/app/publish` | Validates a pasted `agent.json` against the live registry |
| `/app/api-keys` | How requests are identified today, and what changes with auth |
| `/app/profile`, `/app/settings` | Account state; connection, registry health, provider health |
| `/app/address/[address]` | Route handler: classifies an address and 307s to contract or wallet |

## Design system

Warm cream and brown, defined once in [`globals.css`](src/app/globals.css) as
Tailwind `@theme` tokens. Every colour in the product resolves to one of them —
there are no raw hex values in any component.

| Token | Value | Use |
| --- | --- | --- |
| `canvas` | `#F6F2EA` | Page background |
| `card` | `#FFFFFF` | Raised surface |
| `line` | `#DDD2C2` | Borders and rules |
| `ink` | `#2E261F` | Primary text, and the inverted code surface |
| `muted` | `#6C6257` | Secondary text |
| `accent` | `#7A5A3A` | Links, active nav, emphasis |

`sunken`, `accent-soft`, `code-fg`, and `code-prompt` are derived from those.
`up`/`down`/`warn` are reserved for price direction and status — never
decoration. No glassmorphism, no neon, no heavy gradients.

## Shared components

Reuse is deliberate: a card, a table, a badge, and an empty state look identical
everywhere because there is exactly one of each.

- [`ui.tsx`](src/components/ui.tsx) — `Card`, `Stat`, `Row`, `Badge`, `Button`, `Change`, `Empty`, `ErrorState`, `Skeleton`, `DegradedNotice`, `SourceList`
- [`table.tsx`](src/components/table.tsx) — the only table; owns alignment, responsive column hiding, and overflow
- [`controls.tsx`](src/components/controls.tsx) — `Input`, `Select`, `Toolbar`, `Pagination`, and the query-string builder every list route shares
- [`registry.tsx`](src/components/registry.tsx) — agent and tool cards, panel rows, install commands
- [`marketing.tsx`](src/components/marketing.tsx) — `Section`, `Terminal`, `CodeBlock`, `Prose`

## States

Every page handles four: loading (skeletons), empty, error, and *partial*.
Partial is the interesting one — the API reports which providers failed, and
`DegradedNotice` surfaces that rather than presenting incomplete data as
complete. `SourceList` shows the full provenance underneath.

Three pages are honest about not existing yet rather than faking it: sign-in
buttons are disabled because no auth backend is wired, the contact form is
disabled because there is no inbox, and API keys are not issued because a key
that authorises nothing is worse than none. The runtime page reports the
supervisor as offline when it is, because that is a normal local state.

## Performance

- **Server components** do the fetching, so provider data never costs the
  browser a round trip. Shared client JS is ~102 kB.
- **Two cache layers**: Norien caches provider responses; Next caches its own
  fetches (`revalidate` tuned per resource — 10s chain head, 120s TVL).
- **Per-panel streaming**: the dashboard suspends each of its eight widgets
  separately, so one slow provider delays only its own card.
- **Skeletons** on list routes, keyed to the filter parameters so changing a
  filter re-renders only the results.
- **Lazy images** for every remote logo.

## Two Next.js behaviours worth knowing

**`/app/address/[address]` is a route handler, not a page.** App Router streams
page responses, so a `redirect()` inside a page cannot emit a real `Location`
header once streaming starts. A route handler is not streamed, so it returns a
proper **307**.

**Data-backed detail pages render "not found" inline** rather than calling
`notFound()`. A thrown `notFound()` lands in the streamed RSC payload, so the
message only appears after hydration. Returning it as normal output puts it in
the initial HTML — visible immediately and without JavaScript. The trade-off is
an HTTP 200 on those responses. Static routes with known params (`/blog/[slug]`)
use `notFound()` normally, since nothing is streaming.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `NORIEN_API_URL` | `http://127.0.0.1:3000` | Registry base URL (server-side) |
| `NORIEN_RUNTIME_URL` | `http://127.0.0.1:4123` | Runtime supervisor (optional; offline is a valid state) |
| `NEXT_PUBLIC_APP_NAME` | `Norien` | Title |

`next.config.mjs` also rewrites `/api/*` to the registry, so any browser-side
call stays same-origin — no CORS configuration and no API origin in client
bundles.

## Authentication

Prepared, not implemented. `/login` and `/signup` are the final layout with
GitHub and Google provider buttons wired to nothing — they are the components
Supabase Auth attaches to in a later phase. Nothing in the app assumes a
session, and every page is fully usable without one.
