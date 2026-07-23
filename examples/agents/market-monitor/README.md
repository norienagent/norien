# Market Monitor

A working Norien agent. Zero dependencies — Node builtins only, so it runs the
moment it is installed.

It polls Norien's unified data API for the highest-volume tokens, reports any
whose 24h move exceeds a threshold, and serves `/health` on the port the
supervisor allocates.

## Run it

```bash
norien install market-monitor
norien run market-monitor --grant network:fetch
norien logs market-monitor -f
```

## Making it installable by anyone

The registry stores the manifest, not the code. For `norien install` to bring
the code along on someone else's machine, declare where it lives — add a
`source` block to `agent.json`:

```json
"source": {
  "type": "git",
  "url": "https://github.com/YOUR_NAME/norien",
  "ref": "v1.0.0",
  "directory": "examples/agents/market-monitor"
}
```

Then `norien install market-monitor` clones that path into the install folder
(cloning only — nothing runs), and the agent is runnable end to end. Without it,
a fresh install writes the manifest and reports that the code is missing.

## Configuration

All optional — the agent runs with none of them set.

| Variable | Default | Purpose |
| --- | --- | --- |
| `WATCH_INTERVAL_SECONDS` | `30` | How often to poll |
| `MOVE_THRESHOLD_PERCENT` | `1` | Report a token when its 24h change exceeds this |
| `WATCH_LIMIT` | `10` | How many tokens to watch, ranked by volume |

## Health

`/health` returns **503** until the first successful poll, then **200**. An agent
that has never reached its data source is not healthy just because its socket is
open — which is what lets the supervisor tell "started" from "actually working".
