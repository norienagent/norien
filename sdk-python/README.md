# norien (Python SDK)

Official Python SDK for the Norien agent registry. **Zero dependencies** — it
is a thin REST client built on the standard library, so it installs cleanly
into any environment, including the constrained ones agents themselves run in.

```bash
pip install norien
```

Requires Python 3.9+.

## Quickstart

```python
from norien import Norien

client = Norien(API_KEY)

client.search("trading")
client.info("trading-agent")
client.install("trading-agent")
client.publish(manifest=manifest)
```

Or with full options:

```python
client = Norien(
    api_key=os.environ["NORIEN_API_KEY"],
    base_url="https://registry.example.com",
    actor="acme",        # sent as x-norien-actor; attributes writes
    timeout=30.0,
    retries=2,
)
```

`NORIEN_REGISTRY`, `NORIEN_ACTOR`, and `NORIEN_API_KEY` are read from the
environment when the matching argument is omitted.

> The registry does not verify API keys yet — it identifies callers by handle.
> The SDK sends `Authorization: Bearer <key>` regardless, so no code changes
> when key verification lands.

## API

| Method | Endpoint |
| --- | --- |
| `health()` | `GET /health` |
| `search(q, *, type, tag, author, limit, offset)` | `GET /search` |
| `info(slug, *, version)` | `GET /agents/:slug` |
| `list_agents(**params)` / `list_tools(**params)` | `GET /agents`, `GET /tools` |
| `versions(slug)` | `GET /agents/:slug/versions` |
| `runtime(slug, *, environment)` | `GET /agents/:slug/runtime` |
| `inspect(manifest, *, environment, slug)` | `POST /runtime/inspect` |
| `install(agent, *, version, environment)` | `POST /install` |
| `uninstall(agent)` / `installations()` | `POST /uninstall`, `GET /installations` |
| `publish(payload \| manifest=…, **fields)` | `POST /publish` |
| `update_agent(slug, **fields)` / `delete_agent(slug)` | `PATCH`, `DELETE` |

```python
# Could this agent run here?
runtime = client.runtime("trading-agent", environment=["EXCHANGE_API_KEY"])

runtime["ready"]                    # False
runtime["environment"]["missing"]   # ['EXCHANGE_API_SECRET', 'MAX_POSITION_USD']
runtime["dependencies"]["resolved"] # full tool metadata

# Validate an agent.json before publishing it
check = client.inspect(manifest)
check["version_check"]["action"]    # 'create' | 'new_version' | 'conflict'
```

## Market data

`client.tokens`, `client.projects`, `client.contracts`, `client.wallets`,
`client.chain`, and `client.market` read Norien's unified `/api/*` surface — six
external providers normalized into one shape.

```python
client.tokens.list(limit=20, sort="volume")
client.tokens.trending()
client.tokens.get("0x5fc5…d168")
client.wallets.get("0xebe0…c95b", limit=10)
client.contracts.get("0x5fc5…d168")
client.projects.get("aave")
client.market.all("usdg")           # tokens + projects + addresses
client.chain.status()               # block height, gas, providers
```

Each returns the payload alongside its provenance, so a caller can tell a
complete answer from a partial one:

```python
token = client.tokens.get("0x5fc5…d168")

token["data"]["price"]   # 1.0002
token["sources"]         # [{'provider': 'codex', 'status': 'ok', 'ms': 210}, …]
token["degraded"]        # False
```

A failing provider never fails the call — the remaining data returns with
`degraded: True`. `client.search()` stays registry search; `client.market.all()`
is the market-wide one.

## Pagination

```python
for agent in client.paginate(client.list_agents, runtime="python"):
    print(agent["slug"])
```

## Errors

Every failure raises `NorienError` carrying the registry's error envelope.
Branch on the stable `code`, never on message text.

```python
from norien import NorienError

try:
    client.publish(manifest=manifest)
except NorienError as error:
    error.code          # 'DEPENDENCY_MISSING'
    error.status        # 422
    error.details       # [{'field': 'tools', 'message': "Tool 'x' is not published…"}]
    error.request_id    # quote this in a bug report
    print(error.format())

    if error.is_not_found:
        ...
    if error.is_network_error:
        ...  # registry unreachable
```

GET requests retry transient failures (408, 429, 502, 503, 504, connection
errors) with exponential backoff. Writes are never retried.

## Example

See [`examples/python/quickstart.py`](../examples/python/quickstart.py) for a
runnable walkthrough:

```bash
PYTHONPATH=sdk-python python examples/python/quickstart.py
```
