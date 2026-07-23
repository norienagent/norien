// Market Monitor — a real, running Norien agent.
//
// Zero dependencies: Node builtins only, so it runs immediately after install
// with no package step. It polls Norien's unified data API, reports tokens whose
// 24h move exceeds a threshold, and serves the health endpoint the supervisor
// probes.
//
// Everything it needs is injected by the runtime:
//   PORT              the port the supervisor allocated for health probing
//   NORIEN_REGISTRY   the registry to read market data from
//   NORIEN_AGENT      this agent's slug, for log lines
//   NORIEN_TOOLS      resolved tool metadata, as JSON

import { createServer } from 'node:http';

const AGENT = process.env.NORIEN_AGENT ?? 'market-monitor';
const VERSION = process.env.NORIEN_AGENT_VERSION ?? '1.0.0';
const PORT = Number(process.env.PORT ?? 0);
const REGISTRY = process.env.NORIEN_REGISTRY ?? 'http://127.0.0.1:3000';

const INTERVAL_MS = Math.max(5, Number(process.env.WATCH_INTERVAL_SECONDS ?? 30)) * 1000;
const THRESHOLD = Math.abs(Number(process.env.MOVE_THRESHOLD_PERCENT ?? 1));
const LIMIT = Math.min(Math.max(Number(process.env.WATCH_LIMIT ?? 10), 1), 100);

/**
 * What `/health` reports.
 *
 * `ready` only flips true after the first successful poll: an agent that has
 * never reached its data source is not healthy just because its socket is open.
 */
const state = {
  ready: false,
  startedAt: new Date().toISOString(),
  polls: 0,
  failures: 0,
  lastPollAt: null,
  lastError: null,
  watching: 0,
  movers: [],
};

function log(level, message, extra) {
  const line = { ts: new Date().toISOString(), level, agent: AGENT, message, ...extra };
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(`${JSON.stringify(line)}\n`);
}

/** One poll of the market API. Failures are recorded, never thrown. */
async function poll() {
  const url = `${REGISTRY}/api/tokens?limit=${LIMIT}&sort=volume24`;

  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) throw new Error(`registry responded ${response.status}`);

    const payload = await response.json();
    const tokens = payload?.data?.items ?? [];

    const movers = tokens
      .filter((token) => typeof token.change24h === 'number' && Math.abs(token.change24h) >= THRESHOLD)
      .map((token) => ({
        symbol: token.symbol,
        price: token.price,
        change24h: token.change24h,
        volume24h: token.volume24h,
      }))
      .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h));

    state.polls += 1;
    state.lastPollAt = new Date().toISOString();
    state.lastError = null;
    state.watching = tokens.length;
    state.movers = movers.slice(0, 5);
    state.ready = true;

    // Provenance travels with the payload, so a partial answer stays visible.
    if (payload?.degraded) {
      const down = (payload.sources ?? [])
        .filter((source) => source.status === 'unavailable')
        .map((source) => source.provider);
      log('warn', 'market data is degraded', { unavailable: down });
    }

    if (movers.length === 0) {
      log('info', `no token moved more than ${THRESHOLD}%`, { watching: tokens.length });
      return;
    }

    for (const mover of movers.slice(0, 5)) {
      const direction = mover.change24h >= 0 ? 'up' : 'down';
      log('info', `${mover.symbol} ${direction} ${mover.change24h.toFixed(2)}%`, {
        symbol: mover.symbol,
        price: mover.price,
        change24h: mover.change24h,
      });
    }
  } catch (error) {
    state.failures += 1;
    state.lastError = String(error?.message ?? error);
    log('error', 'poll failed', { error: state.lastError });
  }
}

/**
 * Health endpoint.
 *
 * 200 once the agent has successfully reached its data source at least once,
 * 503 before that — which is what lets the supervisor distinguish "started" from
 * "actually working".
 */
const server = createServer((request, response) => {
  if (request.url?.split('?')[0] !== '/health') {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  const body = {
    status: state.ready ? 'ok' : 'starting',
    agent: AGENT,
    version: VERSION,
    uptime_seconds: Math.round(process.uptime()),
    ...state,
  };

  response.writeHead(state.ready ? 200 : 503, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
});

server.listen(PORT, '127.0.0.1', () => {
  const tools = (() => {
    try {
      return JSON.parse(process.env.NORIEN_TOOLS ?? '[]').map((tool) => tool.slug);
    } catch {
      return [];
    }
  })();

  log('info', `${AGENT}@${VERSION} listening`, {
    port: server.address()?.port,
    registry: REGISTRY,
    interval_seconds: INTERVAL_MS / 1000,
    threshold_percent: THRESHOLD,
    tools,
  });

  // Poll immediately so the agent becomes healthy without waiting a full cycle.
  void poll();
});

const timer = setInterval(poll, INTERVAL_MS);

/** Graceful shutdown, so `norien stop` is a clean exit rather than a kill. */
function shutdown(signal) {
  log('info', `received ${signal}, shutting down`);
  clearInterval(timer);
  server.close(() => process.exit(0));
  // A socket that refuses to close must not hold the process open forever.
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
