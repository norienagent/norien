# External Data Integration

Six external providers, one unified API. Nothing outside this directory ever
calls a third party.

```
routes/api.routes.ts   →  services/external/aggregator.ts
                              ├── codex.ts        market data (primary)
                              ├── coingecko.ts    metadata only
                              ├── defillama.ts    TVL / protocols
                              ├── github.ts       repository health
                              ├── blockscout.ts   explorer
                              └── rpc.ts          chain node
                                      ↓
                          core/provider-client.ts   timeout · retry · cache · logging
                          core/cache.ts             TTL + stale fallback
```

## Where this lives

The phase brief sketched `lib/services/`. This project's services already live
under `src/services/`, and the instruction was not to change the folder
structure — so the layer sits at `src/services/external/`, following the
existing convention rather than introducing a second one.

## The one rule

Every outbound request goes through `ProviderClient.request()`. It is the only
place that calls `fetch` against a third party, which is why timeout, retry,
caching, structured logging, and error normalisation exist exactly once.

| Concern | Behaviour |
| --- | --- |
| **Timeout** | `REQUEST_TIMEOUT` (10s), per attempt, via `AbortController` |
| **Retry** | `PROVIDER_RETRIES` (2) on 408/425/429/5xx and network errors, exponential backoff with jitter. Never on 4xx — a bad request stays bad |
| **Cache** | `CACHE_TTL` (300s) default, per-call overrides. Keyed per provider+query |
| **Fallback** | A **stale** cached value is served when a provider fails. Only an empty cache surfaces the error |
| **Logging** | One JSON line per outcome on stderr. Query strings are stripped, so keys never reach the logs |
| **Errors** | `ProviderError` with provider, status, retriable, attempts |

## Provider responsibilities

Each provider owns specific fields, and the boundaries are enforced by the
aggregator rather than by convention:

| Provider | Owns | Notes |
| --- | --- | --- |
| **Codex** | price, marketCap, liquidity, volume24h, change24h, holders, fdv | The primary market-data source |
| **CoinGecko** | logo, description, categories, supply | **Never a price source.** Mixing price sources would produce self-contradicting numbers |
| **DeFiLlama** | TVL, protocols, ecosystem | No key required |
| **GitHub** | stars, releases, commits, contributors, languages | |
| **Blockscout** | ABI, verified source, transactions, token transfers, holders | v1 and v2 both used |
| **RPC** | block height, balances, contract reads, logs, gas, multicall | Ground truth for the native chain |

## Graceful degradation

Every aggregate is assembled from settled results. A provider outage degrades a
response; it never fails the request:

```jsonc
{
  "data": { "symbol": "USDG", "price": 1.0002, "holders": 31579, "…": "…" },
  "sources": [
    { "provider": "codex",      "status": "ok",      "ms": 210 },
    { "provider": "coingecko",  "status": "skipped", "reason": "no platform mapping for chain 4663" },
    { "provider": "blockscout", "status": "ok",      "ms": 340 }
  ],
  "degraded": false
}
```

`status` is `ok`, `unavailable` (tried and failed), `not_configured` (no
credential), or `skipped` (not applicable). `degraded` is true when any source
is `unavailable` — so a caller can tell a complete answer from a partial one
instead of guessing.

## Endpoints

| Endpoint | Composed from |
| --- | --- |
| `GET /api/tokens` | Codex |
| `GET /api/trending` | Codex (`trendingScore24`) |
| `GET /api/token/:address` | Codex + CoinGecko + Blockscout |
| `GET /api/projects` | DeFiLlama |
| `GET /api/project/:slug` | DeFiLlama + GitHub |
| `GET /api/contracts/:address` | Blockscout + RPC |
| `GET /api/wallets/:address` | RPC + Blockscout |
| `GET /api/search` | Codex + DeFiLlama |
| `GET /api/chain` | RPC |
| `GET /api/providers` | Liveness of all six, plus cache stats |

## Things learned from the live APIs

Written against probed behaviour, not documentation:

- **Codex introspection is disabled.** Field selections were confirmed by
  probing error messages. Its standalone `holders(…)` query is plan-gated, but
  the `holders` field on `filterTokens` is not — so holders come from there.
- **Codex reports 24h change as a ratio** (`-0.0075`). It is converted to a
  percentage at the service boundary.
- **DeFiLlama returns HTTP 400 "Protocol not found"** for an unknown slug, not
  404.
- **DeFiLlama's `github` field is an organisation name**, often an array
  (`["aave","aave-dao"]`), not an `owner/repo` path. The GitHub service resolves
  an org to its most-starred repository.
- **DeFiLlama's `currentChainTvls` mixes chains with accounting buckets**
  (`borrowed`, `staking`, `pool2`, and `Chain-suffixed` variants). Counting
  those as chains would invent chains that do not exist.
- **The protocol detail endpoint often returns an empty `chains` array**, so the
  chain list is derived from the TVL breakdown.
- **Blockscout serves both v1 and v2**, and v2 carries data v1 does not
  (verified source, creator, holder counts, icons). Both are used.

## Configuration

All provider variables are optional at boot. A missing credential disables that
provider rather than preventing start-up — `/api/providers` reports what is
configured and reachable. `.env` and `.env.local` are loaded automatically, with
precedence: shell environment > `.env.local` > `.env`.
