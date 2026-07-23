<div align="center">

# Norien

**The registry for AI agents.**

Publish agents, install the tools they depend on, run them locally under a
supervisor, and read normalized on-chain & market data — one API, one CLI, one SDK.

[![license](https://img.shields.io/badge/license-MIT-2E261F)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A520-2E261F)](https://nodejs.org)
[![status](https://img.shields.io/badge/status-pre--release-7A5A3A)](CHANGELOG.md)
[![tests](https://img.shields.io/badge/tests-278%20passing-3f6b47)](tests/)

[Website](https://norien.live) · [Docs](https://norien.live/docs) · [Quickstart](#quick-start) · [CLI](#cli) · [API](#unified-data-api)

</div>

---

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/norienagent/norien/main/install.sh | sh
```

<details>
<summary>Windows (PowerShell)</summary>

```powershell
irm https://raw.githubusercontent.com/norienagent/norien/main/install.ps1 | iex
```

</details>

The installer checks for Node.js 20+, then installs the `norien` CLI — from npm
once published, or from source until then. Prefer npm directly?

```sh
npm install -g @norien/cli        # once published
```

```sh
norien --help
norien markets                    # live token data, once pointed at a registry
```

> **Pre-release.** Norien runs locally today. The CLI needs a Norien registry to
> talk to — run one with `npm run dev` from the source, or point at a deployed
> instance with `--registry`. A hosted registry and npm packages are on the way.

---

## What it is

A registry where developers publish agents, publish the reusable tools those
agents depend on, discover both through ranked search, and install an agent at a
pinned version — the npm-registry model applied to AI agents.

The platform *understands* an agent — it parses `agent.json`, detects the
runtime, resolves every declared tool, and reports what is satisfied — and then
**runs it**: a supervisor executes installed agents, streams their logs, probes
their health, and recovers them when they crash.

Alongside it runs a **unified data API**: six external providers — market data,
on-chain, repository, and TVL — normalized behind one surface, so a caller never
learns which one answered.

All of it is usable from the [web app](web/), entirely from the terminal via the
[CLI](packages/cli), and programmatically via the [TypeScript](packages/sdk) and
[Python](sdk-python) SDKs. Everything goes through the same public REST API.

No branding, landing page, or payments — those are later phases.

---

## Repository layout

| Path | What |
| --- | --- |
| [src/](src/) | The registry server (Fastify + Drizzle + Postgres) |
| [packages/cli/](packages/cli/) | `@norien/cli` — the `norien` command |
| [packages/runtime/](packages/runtime/) | `@norien/runtime` — the supervisor that executes agents |
| [packages/tools/](packages/tools/) | `@norien/tools` — the tool plugin system (validate, install, execute) |
| [src/services/external/](src/services/external/) | External data integration — six providers behind one unified API |
| [web/](web/) | `@norien/web` — the product UI (Next.js, port 3001) |
| [packages/sdk/](packages/sdk/) | `@norien/sdk` — TypeScript SDK |
| [sdk-python/](sdk-python/) | `norien` — Python SDK, zero dependencies |
| [examples/](examples/) | Runnable SDK walkthroughs and 12 example tools |

---

## Quick start

```bash
npm install
npm run dev
```

That is the whole setup (`npm install` links the workspaces and builds the CLI,
runtime, tools, and SDK through the root `prepare` script).
No database server: with `DATABASE_URL` unset the app
runs [PGlite](https://pglite.dev) — Postgres compiled to WASM — in a local data
directory. On first boot it applies migrations and seeds a sample catalogue of
**12 tools and 10 agents**, so the registry is immediately worth exploring.

| URL | What |
| --- | --- |
| `/docs` | Swagger UI |
| `/docs/json` | OpenAPI 3.1 document |
| `/console/` | Minimal browse / inspect / publish page for manual testing |
| `/health` | Liveness + database check |

The product UI is a second process on its own port, so the two never contend:

```bash
npm run dev                          # registry  → http://127.0.0.1:3000
npm run dev --workspace @norien/web  # product UI → http://localhost:3001
```

```bash
npm test               # 267 tests: real processes, real external APIs, throwaway database
npm run typecheck
npm run build:packages # build the CLI and TypeScript SDK
npm run cli -- --help  # run the CLI from source
npm run openapi        # writes openapi/openapi.json
npm run db:seed        # re-seed (idempotent)
npm run db:reset       # delete the embedded database
```

Point `DATABASE_URL` at a real Postgres and the identical migrations and queries
run there. Set `AUTO_SEED=false` to skip the sample catalogue.

## Authentication

There is no verification yet. The acting identity comes from the
`x-norien-actor` header — set it via `norien login`, or directly:

```bash
curl -X POST localhost:3000/publish \
  -H 'content-type: application/json' \
  -H 'x-norien-actor: acme' \
  -d @agent.json
```

Requests without it are anonymous: they can read public data but cannot publish
or install. This is deliberately not a security boundary — it exists so that
ownership, visibility, and install attribution are exercised end to end now.
A later phase replaces `resolvePrincipal` in
[src/middleware/auth.ts](src/middleware/auth.ts); nothing downstream changes.

---

## `agent.json`

```json
{
  "name": "Research Agent",
  "version": "1.0.0",
  "description": "Searches the web and summarises findings with citations.",
  "runtime": "node",
  "entrypoint": "dist/index.js",
  "tools": ["search", "http-fetch"],
  "permissions": ["network:fetch"],
  "environment": [
    { "name": "SEARCH_API_KEY", "required": true, "secret": true },
    { "name": "MAX_RESULTS", "required": false, "default": "10" }
  ],
  "commands": {
    "start": "node dist/index.js",
    "health": "/health"
  }
}
```

Everything is validated on publish, and every problem is reported at once
rather than the first:

- **Runtime** — `node` or `python`. Omit it and it is inferred from the
  entrypoint extension; an entrypoint that matches neither is rejected with an
  error that names the supported runtimes.
- **Version** — must parse as semver and strictly increase over the current
  head. Republishing or downgrading is refused.
- **Tools** — every slug must already be published. An agent naming a tool
  nobody published is unusable, so this is a hard failure at publish time.
- **Permissions** — must match a `namespace:action` convention.
- **Environment** — a bare string or a full descriptor; both normalise to the
  descriptor form.
- **Commands** — `start` is derived from the runtime when omitted.
- **Unknown top-level keys are preserved.** A manifest is a document the
  publisher owns; forward-compatible fields survive a round trip.

---

## Understanding an agent (inspection)

Two endpoints answer the same question — *does the platform understand this
agent, and could it run here?* — one for a published agent, one for an
`agent.json` that has not been published yet. Neither executes anything.

```
GET  /agents/{slug}/runtime?environment=A,B
POST /runtime/inspect
```

Both return the same normalized object:

```jsonc
{
  "slug": "trading-agent",
  "version": "0.5.0",
  "runtime": {
    "name": "python",
    "source": "declared",          // or "inferred", with a warning
    "entrypoint": "trader/run.py",
    "interpreter": "python",
    "manifest_file": "pyproject.toml",
    "commands": { "start": "python -m trader.run", "health": "python -m trader.health" }
  },
  "dependencies": {
    "requested": ["exchange", "market-data", "notifications"],
    "resolved":  [ /* full tool metadata: schemas, auth, version */ ],
    "missing":   [],
    "satisfied": true
  },
  "environment": {
    "required":  ["EXCHANGE_API_KEY", "EXCHANGE_API_SECRET", "MAX_POSITION_USD"],
    "optional":  ["DRY_RUN"],
    "secrets":   ["EXCHANGE_API_KEY", "EXCHANGE_API_SECRET"],
    "provided":  [],
    "missing":   ["EXCHANGE_API_KEY", "EXCHANGE_API_SECRET", "MAX_POSITION_USD"],
    "satisfied": false
  },
  "version_check": { "action": "new_version", "latest_published": "0.5.0", "acceptable": true },
  "install": { "command": "norien install trading-agent@0.5.0" },
  "ready": false,
  "diagnostics": [
    { "level": "error", "code": "ENVIRONMENT_MISSING", "field": "environment",
      "message": "Required environment variable 'EXCHANGE_API_KEY' is not set." }
  ]
}
```

`ready` is true only when dependencies **and** environment are both satisfied.
Pass `?environment=A,B` (or an `environment` array/map in the POST body) to ask
whether the agent could run with those variables set. Only variable *names* are
ever used — values are never stored, logged, or echoed back.

`version_check.action` is the publish pre-flight a CLI runs before uploading:

| action | meaning |
| --- | --- |
| `create` | the slug is free |
| `new_version` | the version would be accepted |
| `conflict` | already published, or lower than the current latest |

Inspection is a **report, not a gate**: a manifest that parses but cannot be
satisfied returns `200` with `ready: false` and the reasons in `diagnostics`.
Only structural problems return `422`. Publishing, by contrast, *is* a gate —
the same unsatisfiable manifest is rejected with `422 DEPENDENCY_MISSING`.

---

## API

### Registry

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/agents` | Search + filter by `tag`, `author`, `tool`, `runtime`, `visibility` |
| `GET` | `/agents/:slug` | `?version=` accepts an exact version or a semver range |
| `GET` | `/agents/:slug/versions` | Published version history |
| `GET` | `/agents/:slug/runtime` | Normalized runtime object |
| `POST` | `/agents` | Create; 409 if the slug exists |
| `PATCH` | `/agents/:slug` | Metadata only |
| `DELETE` | `/agents/:slug` | Soft delete; slug stays reserved |
| `POST` | `/publish` | Upsert-shaped: creates, then appends versions |
| `POST` | `/runtime/inspect` | Validate an `agent.json` without publishing |

`GET|POST /tools`, `GET|PATCH|DELETE /tools/:slug`, `GET /tools/:slug/versions`.
Deleting a tool that agents still require returns 409 and names the dependents.

`GET /search` ranks across both catalogues; `type=all|agent|tool`.

### Install

`POST /install` resolves a version or range against what is actually published,
records the concrete result, and returns everything needed to run the agent in
one round trip: `install_command`, `manifest`, `runtime`, `dependencies`,
`environment`, `permissions`, `ready`, and `diagnostics`. Repeated calls are
idempotent.

An install pinned to an old version is described **at that version**, not at the
catalogue head — so `research-agent@1.0.0` reports the two tools it declared,
not the three that `1.1.0` added.

`GET /installations` lists the caller's installs; `POST /uninstall` tombstones
one, preserving history.

### Response shapes

Lists:

```json
{ "data": [ ... ],
  "meta": { "total": 42, "limit": 20, "offset": 0, "has_more": true, "next_offset": 20 } }
```

Errors — every failure, from any endpoint:

```json
{ "error": {
    "code": "DEPENDENCY_MISSING",
    "message": "2 required tool(s) could not be resolved: ghost-tool, phantom-tool.",
    "details": [ { "field": "tools", "message": "Tool 'ghost-tool' is not published in this registry.", "slug": "ghost-tool" } ],
    "request_id": "361885dc-8d51-45f6-9309-0bb41baad9c0" } }
```

---

## Sample catalogue

Seeded automatically on first boot.

| Agent | Runtime | Tools |
| --- | --- | --- |
| `research-agent` (v1.0.0, v1.1.0) | node | search, http-fetch, vector-store |
| `search-agent` | python | search |
| `twitter-agent` | node | twitter, search |
| `discord-agent` | node | discord, search, vector-store |
| `wallet-agent` | node | wallet, market-data |
| `portfolio-agent` | python | wallet, market-data, postgres-query |
| `trading-agent` | python | exchange, market-data, notifications |
| `bridge-agent` | node | bridge, wallet, market-data |
| `notification-agent` | node | notifications, discord |
| `news-agent` | python | news-feed, search, notifications |

Tools: `search`, `http-fetch`, `wallet`, `twitter`, `discord`, `notifications`,
`market-data`, `exchange`, `bridge`, `news-feed`, `vector-store`,
`postgres-query`.

---

## CLI

```bash
npm install          # the root `prepare` builds the packages
npm run cli:link     # → npm link --workspace @norien/cli
norien --help        # available from any directory
```

`@norien/cli` is not published, so `norien` is a link into `packages/cli/dist`;
a `npm run build:packages` is picked up without relinking, and
`npm run cli:unlink` removes it. pnpm and the Windows shims are covered in
[packages/cli/README.md](packages/cli/README.md#local-development).

```bash
norien login                   # store credentials in ~/.norien/config.json
norien search trading          # ranked search across agents and tools
norien info trading-agent      # manifest, tools, permissions, runtime, env
norien install research-agent  # writes ./norien_agents/research-agent
norien list                    # what is installed here
norien update --check          # newer versions + changelog
norien publish --dry-run       # validate without uploading
norien doctor                  # API, manifest, deps, runtimes, config
```

Installing writes a folder mirroring `node_modules`:

```
norien_agents/research-agent/
  agent.json              the published manifest
  README.md               the published README (or a generated stub)
  .env.example            required variables blank, optional ones commented
  norien.metadata.json    resolved tools, runtime, permissions
  index.js, …             the agent's code, when the manifest declares a source
norien.lock.json          what is installed, at which version
```

**Code distribution.** The registry stores manifests, not bundles — a
deliberate split, since a shared catalogue should not host and serve arbitrary
code. A `node` or `python` agent closes the gap by declaring where its code
lives, and `norien install` clones it into the same folder:

```jsonc
// in agent.json
"source": {
  "type": "git",
  "url": "https://github.com/owner/repo",
  "ref": "v1.0.0",                    // optional: tag, branch, or commit
  "directory": "agents/research"      // optional: subpath within the repo
}
```

Cloning fetches code; it never runs it. Execution stays gated behind the
runtime's permission grant, so `norien install` is not a trust decision —
`norien run` is, and it is made separately. `--no-source` skips the fetch to
inspect a manifest first, and an agent with no declared source installs
manifest-only, exactly as before. Only `https`, `ssh`, and `git@` URLs are
accepted; `file://` is refused so a manifest can never point at a local path.

Every command supports `--json`, and stdout stays pure JSON — spinners and
diagnostics go to stderr — so the CLI is scriptable:

```bash
norien search trading --json | jq -r '.data[].item.slug'
norien doctor --json | jq '.checks[] | select(.status=="fail")'
```

Exit codes: `0` success, `1` error, `2` bad usage, `3` not authenticated,
`4` not found, `5` validation/dependency failure.

Full reference: [packages/cli/README.md](packages/cli/README.md).

### Two honest gaps

- **API keys are stored and sent, but not yet verified.** The registry
  identifies callers by handle (`x-norien-actor`); the `Authorization: Bearer`
  header is declared in the OpenAPI document but not enforced. The CLI and both
  SDKs send both, so nothing changes here when verification lands. Treat the
  current setup as identification, not as a security boundary.
- **`norien search` has no Downloads column** because no endpoint exposes
  install counts. The table renders the column only when the field is present,
  so it appears on its own once the registry serves it — rather than showing a
  fabricated or permanently blank value.

---

## Running an agent (execution)

Installed agents are executable. The supervisor is a **separate service from
the registry** — the registry is a shared catalogue and must never execute user
code, so process supervision runs on the machine that owns the agents:

```
norien CLI ──HTTP──> runtime daemon (127.0.0.1:4123)   owns child processes
norien CLI ──HTTP──> registry                          catalogue only
```

```bash
norien run research-agent --grant-all
norien logs research-agent -f
norien status
norien restart research-agent
norien stop research-agent
```

Agents keep running after the command exits. Every launch is gated, in order,
and any step can refuse it before a process is spawned:

1. **Manifest** — validate `agent.json`; reject an unknown runtime
2. **Permissions** — deny by default, granted in `norien.policy.json`
3. **Tools** — resolved to full metadata, offline from install metadata
4. **Execution plan** — detect `npm`/`pnpm`/`yarn`/`bun`/`uv`/`pip`
5. **Environment** — layer defaults → `.env` → overrides, refuse if incomplete
6. **Spawn** — own process group, output streamed to structured logs

The whole trace is recorded, so a run is never a mystery:

```
sys preparing ticker@1.0.0
sys permissions granted: network:fetch
sys tools resolved from install-metadata: search@2.1.0
sys execution plan (package-script): npm.cmd run start
sys started: npm.cmd run start (pid 34452)
out tick 1 hello
err stderr sample 3
sys exited: exited with code 42
```

**Status and health are separate axes**, because a process can be `running` but
`unhealthy`. Status is what the supervisor is doing (`starting`, `running`,
`restarting`, `stopping`, `stopped`, `failed`); health is what the agent reports
(`starting`, `healthy`, `unhealthy`, `stopped`, `failed`), probed via an HTTP
path or a health command from `commands.health`.

**Crashes are captured**: exit code, signal, reason, and the logs are kept.
`--restart-policy on-failure` adds automatic restarts with capped exponential
backoff (1s → 30s, max 5 attempts), reset after 60s of stable uptime.

**Tools are injected** as environment variables (`NORIEN_TOOLS` carries every
resolved tool's schemas and auth), so an agent needs no SDK to be launchable.

Runtime endpoints: `GET /runtime`, `GET /runtime/{agent}`, `GET /runtime/status`,
`GET /runtime/logs` (server-sent events with `?follow=true`), `POST /runtime/run`,
`POST /runtime/stop`, `POST /runtime/restart`.

Full details: [packages/runtime/README.md](packages/runtime/README.md).

---

## Tool marketplace

A tool is a reusable capability any agent can install and **execute** — npm
packages + MCP tools + Docker images, for agent tools. Every tool is a plugin
behind one generic protocol, so the runtime never hardcodes a tool.

```bash
norien tool search wallet
norien tool info web-search --docs        # generated docs: schemas + examples
norien tool install ./examples/tools/http-client
echo '{"url":"https://api.github.com/zen"}' | norien tool run http-client
norien tool publish                        # from a directory with tool.json
```

### tool.json

```json
{
  "name": "HTTP Client", "slug": "http-client", "version": "1.0.0",
  "description": "Perform an HTTP request.",
  "category": "http", "runtime": "node", "entrypoint": "index.js",
  "input_schema": { "type": "object", "required": ["url"], "properties": { "url": { "type": "string" } } },
  "output_schema": { "type": "object", "properties": { "status": { "type": "integer" } } },
  "permissions": ["network:fetch"], "license": "MIT"
}
```

`runtime` is `node`, `python`, or `http`. Everything is validated on publish;
categories are checked against a fixed vocabulary and tool dependencies must
already be published.

### The plugin protocol

`node`/`python` tools read `{ "input", "context" }` from **stdin** and write
`{ "output" }` (or `{ "error" }`) to **stdout**; logs go to stderr. `http`
tools need no code — the executor calls the entrypoint URL, filling
`{placeholders}` from the input and injecting auth from environment. The
executor validates input against `input_schema` before running and output
against `output_schema` after.

### API

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/tools` | Catalogue; filter by category, runtime, tag, author |
| `GET` | `/tools/search` | Ranked marketplace search |
| `GET` | `/tools/:slug` | One tool |
| `GET` | `/tools/:slug/versions` | Version history |
| `POST` | `/tools/publish` | Upsert-shaped publish |
| `POST` | `/tools/install` | Resolve a tool + its dependency tools |
| `PATCH` | `/tools/:slug` | Metadata only |
| `DELETE` | `/tools/:slug` | Soft delete; refused while agents depend on it |

### Runtime integration

When an agent starts, the runtime resolves its tools, verifies versions,
injects each tool's metadata (schemas, auth, runtime, entrypoint) as
`NORIEN_TOOLS`, and **refuses to launch if a tool requires a permission the
agent was not granted** — a tool's capabilities must sit within its host
agent's.

Twelve example tools ship in [examples/tools/](examples/tools/): web search,
HTTP client, filesystem, wallet, discord, telegram, github, browser, web
scraper, email, logger, scheduler.

Full details: [packages/tools/README.md](packages/tools/README.md).

---

## Unified data API

Six external providers behind one API. The frontend, CLI, and SDK talk only to
Norien; **nothing outside `src/services/external/` calls a third party.**

```
GET /api/tokens            GET /api/contracts/:address
GET /api/trending          GET /api/wallets/:address
GET /api/token/:address    GET /api/search
GET /api/projects          GET /api/chain
GET /api/project/:slug     GET /api/providers
```

Responses are normalized, so a caller cannot tell which provider supplied which
field:

```jsonc
{
  "data": {
    "name": "Global Dollar", "symbol": "USDG", "logo": "https://…",
    "price": 1.0002, "marketCap": 278170945, "liquidity": 2347222,
    "holders": 31579, "volume24h": 77301656, "change24h": 0.049,
    "chain": { "id": 4663, "name": "Robinhood Chain" }
  },
  "sources": [
    { "provider": "codex",      "status": "ok",      "ms": 210 },
    { "provider": "coingecko",  "status": "skipped", "reason": "no platform mapping for chain 4663" },
    { "provider": "blockscout", "status": "ok",      "ms": 340 }
  ],
  "degraded": false
}
```

Every response carries its provenance. **If a provider fails the request still
succeeds** with whatever the others returned, `status: "unavailable"` on the
source, and `degraded: true` — a partial answer is visibly partial rather than
quietly incomplete.

| Provider | Owns |
| --- | --- |
| Codex | price, market cap, liquidity, volume, 24h change, holders |
| CoinGecko | logo, description, categories, supply — **never price** |
| DeFiLlama | TVL, protocols, ecosystem |
| GitHub | stars, releases, commits, contributors, languages |
| Blockscout | ABI, verified source, transactions, token transfers |
| Robinhood RPC | block height, balances, contract reads, logs, gas, multicall |

Every outbound call goes through one client
([src/core/provider-client.ts](src/core/provider-client.ts)) that owns timeout,
retry with backoff, caching, stale-on-failure fallback, and structured logging —
so those behaviours exist exactly once. Provider variables load from `.env.local`
and are all optional: a missing credential disables that provider instead of
blocking start-up.

Full details: [src/services/external/README.md](src/services/external/README.md).

---

## Product surface

The same unified API is consumed by three clients — a web app, the CLI, and both
SDKs. **None of them knows a provider exists.** They call Norien; Norien calls
the world.

### Web ([web/](web/))

Next.js 15 App Router on **:3001**, server components, warm cream-and-brown
design system. A public marketing site and the application, in one project:

| Group | Routes |
| --- | --- |
| Marketing | `/`, `/docs`, `/pricing`, `/blog`, `/changelog`, `/about`, `/contact`, `/privacy`, `/terms` |
| Auth | `/login`, `/signup` — prepared for GitHub and Google, not yet wired |
| Application | `/app` and everything under it |

`/` is a marketing page; the dashboard is `/app`. Every `/app/*` route shares one
shell — sidebar, topbar, content column — collapsing to a drawer on mobile.

| Route | Shows |
| --- | --- |
| `/app` | Trending, new launches, highest volume, biggest gainers, latest projects, latest registry, latest tools, network status |
| `/app/markets`, `/app/tokens` | Live token table and card directory — search, sort, filter, paginate |
| `/app/token/:address` | Price, market cap, liquidity, holders, 24h range, supply, contract, links |
| `/app/wallet/:address` | Balance, per-token holdings, transactions, token transfers |
| `/app/contract/:address` | Verification, creator, read functions, events, ABI, source |
| `/app/projects`, `/app/project/:slug` | TVL rankings; TVL by chain, GitHub health, contributors |
| `/app/registry`, `/app/registry/:slug` | Published agents; manifest, requirements, runtime readiness, versions |
| `/app/tools`, `/app/tools/:slug` | The marketplace; schemas, permissions, dependencies, versions |
| `/app/runtime` | Supervisor state, per-agent status and health, registry and chain connectivity |
| `/app/publish` | Validates a pasted `agent.json` against the live registry |
| `/app/search` | Global search across market data **and** the registry |
| `/app/api-keys`, `/app/profile`, `/app/settings` | Identification model, account state, live provider health |
| `/app/address/:address` | Classifies an address and 307s to contract or wallet |

Every page handles four states: loading (skeletons), empty, error, and
**partial** — `DegradedNotice` surfaces the API's `sources`/`degraded` report
rather than presenting an incomplete answer as a complete one. The dashboard
suspends each of its eight widgets separately, so one slow provider delays only
its own card. No page uses mock data.

Full details: [web/README.md](web/README.md).

### CLI

```bash
norien markets --sort volume --limit 20   # live token table
norien trending                            # what is moving
norien token 0x5fc5…d168                   # price, liquidity, holders, contract
norien wallet 0xebe0…c95b                  # balance, holdings, history
norien contract 0x5fc5…d168 --abi          # verification + full ABI
norien project aave                        # TVL by chain + repository health
norien search usdg --type token            # one search across everything
```

### SDK

```ts
await client.tokens.list({ limit: 20 });
await client.tokens.trending();
await client.tokens.get(address);
await client.wallets.get(address);
await client.contracts.get(address);
await client.projects.get('aave');
await client.market.all('usdg');
await client.chain.status();
```

The Python SDK mirrors this exactly (`client.tokens.list(limit=20)`). Both return
the payload together with its `sources` and `degraded` flags, so a script can
branch on provenance the same way the UI does.

---

## SDKs

Both wrap the same REST API, with matching ergonomics.

```ts
import { Norien } from '@norien/sdk';

const client = new Norien(API_KEY);

await client.search('trading');
await client.info('trading-agent');
await client.install('trading-agent');
await client.publish({ manifest });

await client.tools.search('wallet');
await client.tools.info('http-client');
await client.tools.install('http-client');
```

```python
from norien import Norien

client = Norien(API_KEY)

client.search("trading")
client.info("trading-agent")
client.install("trading-agent")
client.publish(manifest=manifest)

client.tools.search("wallet")
client.tools.info("http-client")
client.tools.install("http-client")
```

Both expose the full surface (`agents`, `tools`, `runtime`, `installations`),
walk pages via `paginate`, retry transient GET failures with backoff, and raise
a typed error carrying the registry's envelope — `code`, `status`, `details`,
`request_id` — so callers branch on a stable code rather than message text.

The Python SDK has **zero dependencies**; the TypeScript SDK has one (axios).

Runnable walkthroughs: [examples/typescript](examples/typescript/quickstart.ts),
[examples/python](examples/python/quickstart.py).

---

## Architecture

```
src/
  config/        env (zod-validated) + domain constants — nothing is hardcoded elsewhere
  core/          errors, pagination, principal, domain event bus
  db/            schema, driver-agnostic client, migrations, fixtures, seed
  repositories/  data access, one per aggregate; no business rules
  services/      business rules and transactions
    runtime.service.ts        parse, detect, verify, normalize
    tool-resolver.service.ts  resolve declared tools to metadata
    search/                   pluggable ranking strategies
  routes/        validate → delegate → serialise; no logic
  middleware/    auth, error handler, service container
  utils/         slug, semver, serializers
  validation/    zod schemas shared by routes, services, and the OpenAPI document
```

The rules that hold it together:

- **One error taxonomy.** Services throw `AppError`; the HTTP error handler is
  the only place that turns one into a response. A CLI or MCP transport maps the
  same codes without touching business logic.
- **One serialisation boundary.** `utils/serializers.ts` is the only code that
  builds a response body.
- **One schema source.** The same Zod schemas drive request validation, response
  serialisation, and the OpenAPI document — they cannot drift.
- **One dependency resolver.** `ToolResolverService` has two entry points over
  one implementation: `resolve` reports what is missing (install, inspect),
  `require` throws (publish). They can never disagree about validity.
- **Repositories take an executor.** A service passes either the pool or an open
  transaction, so multi-table writes are atomic without any repository knowing
  transactions exist.

### Data model

Seven tables, UUID keys throughout. Agents and tools each have a **mutable head**
plus **immutable version rows** — that split is what lets a consumer trust a
pinned `agent@1.2.3` while the catalogue moves on.

- `users` — publishers; materialised on first write
- `agents` / `agent_versions` — including `runtime` and `commands`
- `tools` / `tool_versions`
- `agent_tool_dependencies` — queryable projection of `tools`, so "every agent
  using this tool" is an index scan rather than an array scan
- `installations` — one active row per user/agent via a partial unique index

Deletion is always soft, and slugs stay reserved forever: a registry must never
let a slug's history vanish from under someone who already installed it.

Search uses generated `tsvector` columns with GIN indexes and weighted fields
(name and slug > tags and category > description), ranked by `ts_rank` in the
database. `websearch_to_tsquery` parses user input, so a malformed query cannot
throw.

> Two wrinkles worth knowing:
> - Postgres marks `array_to_string` as STABLE, so it cannot appear in a STORED
>   generated column. `drizzle/0000_bootstrap.sql` defines an IMMUTABLE wrapper
>   used by the tag portion of both search vectors.
> - Schemas carrying `.meta({ id })` are emitted as `$ref`s, so the Swagger
>   plugin is registered with `transformObject` to hoist them into
>   `components.schemas`. Without it those references dangle.

### Semantic search

Ranking is behind a `SearchStrategy` interface
([src/services/search/strategy.ts](src/services/search/strategy.ts)). Only the
lexical implementation ships. A semantic one adds an embedding column and a
vector index, implements the same two methods, and registers ahead of lexical in
`SearchService` — no changes to the service, the route, or the response
contract. `isAvailable()` exists so a strategy with missing embeddings degrades
to lexical instead of returning nothing, and `?strategy=` lets a caller ask for
one by name.

---

## Built for what comes next

Not implemented, but each has a seam in place:

| Future work | Where it attaches |
| --- | --- |
| Auth, API keys, sessions | `resolvePrincipal` in `middleware/auth.ts`. The CLI and SDKs already send `Authorization: Bearer`, so only the server changes. On the web side, `/login` and `/signup` are the finished layout with GitHub and Google buttons waiting on Supabase Auth. |
| Teams, organisations | `Principal.organisationId` and `assertCanMutate` |
| Webhooks, downloads, ratings, audit log | `core/events.ts` — services publish facts |
| Semantic search | Register a strategy in `services/search/` |
| Download counts | Add the field to the agent response; the CLI renders the column automatically |
| API versioning | `routes/index.ts` is a plugin — mount it under `/v1` |
| Cursor pagination | `meta.has_more` / `next_offset` already model it |
| Managed Postgres | Set `DATABASE_URL`; the driver switch is in `db/client.ts` |
| MCP compatibility | Tool schemas are stored verbatim as JSON Schema |
| Remote runtimes, cloud execution | Point the CLI at another supervisor with `NORIEN_RUNTIME_HOST`; swap `ProcessManager` for a distributed worker |
| Schedules, webhooks | `RuntimeManager.start` is the unit a scheduler triggers; the manager emits `status`, `health`, and `exit` events |
| Secrets | `EnvironmentLoader` is the single place values enter a process |
| Price history / charts | The market API exposes a 24h change but no series; a provider that serves one attaches in `services/external/` and the token page swaps its 24h range for it |

---

## Configuration

Copy `.env.example` to `.env` to override. Every value has a working default —
the app runs with no `.env` at all.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | *(empty)* | Empty = embedded PGlite; set = real Postgres |
| `PGLITE_DATA_DIR` | `./.data/pglite` | Embedded database location |
| `AUTO_SEED` | `true` | Seed the sample catalogue when the registry is empty |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | Used to build `api_endpoint` values |
| `INSTALL_COMMAND_TEMPLATE` | `norien install {slug}@{version}` | Rendered per agent at read time |
| `DEFAULT_PAGE_SIZE` / `MAX_PAGE_SIZE` | `20` / `100` | Pagination bounds |
| `DEV_PRINCIPAL_HEADER` | `x-norien-actor` | Stand-in identity header |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW` | `300` / `1 minute` | Per-IP limit |
| `NORIEN_API_URL` | `http://127.0.0.1:3000` | Where the web app reads the unified API from |

Provider credentials live in `.env.local` (git-ignored) and are read by
`loadEnvFiles()` with shell variables winning over both files. All are optional:
an unset credential disables that provider — it never blocks start-up.
