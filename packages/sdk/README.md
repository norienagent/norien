# @norien/sdk

Official TypeScript SDK for the Norien agent registry. Fully typed, one
dependency (axios), works in Node 20+.

```bash
npm install @norien/sdk
```

## Quickstart

```ts
import { Norien } from '@norien/sdk';

const client = new Norien(API_KEY);

await client.search('trading');
await client.info('trading-agent');
await client.install('trading-agent');
await client.publish({ manifest });
```

Or with full options:

```ts
const client = new Norien({
  apiKey: process.env.NORIEN_API_KEY,
  baseUrl: 'https://registry.example.com',
  actor: 'acme',          // sent as x-norien-actor; attributes writes
  timeout: 30_000,
  retries: 2,
});
```

`NORIEN_REGISTRY`, `NORIEN_ACTOR`, and `NORIEN_API_KEY` are read from the
environment when the matching option is omitted.

> The registry does not verify API keys yet — it identifies callers by handle.
> The SDK sends `Authorization: Bearer <key>` regardless, so no code changes
> when key verification lands.

## API

Top-level shorthands cover the common workflow:

| Method | Endpoint |
| --- | --- |
| `client.health()` | `GET /health` |
| `client.search(q \| params)` | `GET /search` |
| `client.info(slug, { version })` | `GET /agents/:slug` |
| `client.install(slug \| params)` | `POST /install` |
| `client.uninstall(slug)` | `POST /uninstall` |
| `client.publish(input)` | `POST /publish` |

Grouped resources cover the rest: `client.agents`, `client.tools`,
`client.runtime`, `client.installations`.

```ts
// Could this agent run here?
const runtime = await client.agents.runtime('trading-agent', {
  environment: ['EXCHANGE_API_KEY'],
});

runtime.ready;                  // false
runtime.environment.missing;    // ['EXCHANGE_API_SECRET', 'MAX_POSITION_USD']
runtime.dependencies.resolved;  // full tool metadata

// Validate an agent.json before publishing it
const check = await client.runtime.inspect(manifest);
check.version_check.action;     // 'create' | 'new_version' | 'conflict'
```

## Market data

`client.tokens`, `client.projects`, `client.contracts`, `client.wallets`,
`client.chain`, and `client.market` read Norien's unified `/api/*` surface — six
external providers normalized into one shape.

```ts
const tokens = await client.tokens.list({ limit: 20, sort: 'volume' });
const token = await client.tokens.get('0x5fc5…d168');
const wallet = await client.wallets.get('0xebe0…c95b');
const contract = await client.contracts.get('0x5fc5…d168');
const project = await client.projects.get('aave');

await client.tokens.trending();
await client.market.all('usdg');   // tokens + projects + addresses
await client.chain.status();       // block height, gas, providers
```

Each returns the payload alongside its provenance, so a caller can tell a
complete answer from a partial one:

```ts
token.data.price;    // 1.0002
token.sources;       // [{ provider: 'codex', status: 'ok', ms: 210 }, …]
token.degraded;      // false
```

A failing provider never fails the call — the remaining data returns with
`degraded: true`. `client.search()` stays registry search; `client.market.all()`
is the market-wide one.

## Pagination

```ts
for await (const agent of client.paginate((page) => client.agents.list({ ...page, runtime: 'python' }))) {
  console.log(agent.slug);
}
```

## Errors

Every failure throws a `NorienError` carrying the registry's error envelope.
Branch on the stable `code`, never on message text.

```ts
import { NorienError } from '@norien/sdk';

try {
  await client.publish({ manifest });
} catch (error) {
  if (error instanceof NorienError) {
    error.code;        // 'DEPENDENCY_MISSING'
    error.status;      // 422
    error.details;     // [{ field: 'tools', message: "Tool 'x' is not published…" }]
    error.requestId;   // quote this in a bug report
    error.format();    // multi-line, human-readable

    if (error.isNotFound) { /* … */ }
    if (error.isNetworkError) { /* registry unreachable */ }
  }
}
```

GET requests retry transient failures (408, 429, 502, 503, 504, connection
errors) with exponential backoff. Writes are never retried.

## Example

See [`examples/typescript/quickstart.ts`](../../examples/typescript/quickstart.ts)
for a runnable walkthrough.
