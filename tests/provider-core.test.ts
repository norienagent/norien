import { createServer, type Server } from 'node:http';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { TtlCache } from '../src/core/cache.js';
import {
  ProviderClient,
  ProviderError,
  isProviderError,
  resetProviderLogger,
  setProviderLogger,
  type ProviderLogRecord,
} from '../src/core/provider-client.js';

/**
 * Core provider-infrastructure tests: cache, retry, timeout, fallback, and
 * structured logging.
 *
 * These run against a real local HTTP server whose behaviour is controllable.
 * That is test infrastructure, not mock data: the product code under test makes
 * genuine network calls, and a controllable peer is the only way to exercise a
 * timeout or a 5xx retry deterministically. The live third-party providers are
 * covered separately in `external-live.test.ts`.
 */

let server: Server;
let baseUrl: string;

/** Per-path behaviour, reconfigured by each test. */
interface Route {
  handler: (attempt: number) => {
    status: number;
    body: unknown;
    delayMs?: number;
  };
  attempts: number;
}

const routes = new Map<string, Route>();

function route(path: string, handler: Route['handler']): () => number {
  routes.set(path, { handler, attempts: 0 });
  return () => routes.get(path)?.attempts ?? 0;
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0] as string;
    const entry = routes.get(path);

    if (!entry) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'no route' }));
      return;
    }

    entry.attempts += 1;
    const result = entry.handler(entry.attempts);

    const send = () => {
      res.writeHead(result.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result.body));
    };

    if (result.delayMs) setTimeout(send, result.delayMs);
    else send();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  routes.clear();
  resetProviderLogger();
});

describe('TtlCache', () => {
  it('serves a fresh value and counts the hit', () => {
    const cache = new TtlCache();
    cache.set('k', { v: 1 }, 1000);

    const hit = cache.get<{ v: number }>('k');
    expect(hit?.value).toEqual({ v: 1 });
    expect(hit?.stale).toBe(false);
    expect(cache.stats.hits).toBe(1);
  });

  it('marks an entry stale past its TTL but still returns it', async () => {
    const cache = new TtlCache({ staleMultiplier: 10 });
    cache.set('k', 'value', 20);

    await new Promise((resolve) => setTimeout(resolve, 40));

    const lookup = cache.get<string>('k');
    expect(lookup?.value).toBe('value');
    expect(lookup?.stale).toBe(true);
    expect(cache.stats.staleServed).toBe(1);
  });

  it('discards an entry once even the stale window has passed', async () => {
    // No stale window: the entry dies exactly at its TTL.
    const cache = new TtlCache({ staleMultiplier: 0 });
    cache.set('k', 'value', 20);

    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(cache.get('k')).toBeUndefined();
  });

  it('evicts the oldest entries past the cap', () => {
    const cache = new TtlCache({ maxEntries: 3 });
    for (const key of ['a', 'b', 'c', 'd']) cache.set(key, key, 10_000);

    expect(cache.stats.size).toBe(3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('d')?.value).toBe('d');
  });
});

describe('ProviderClient — caching', () => {
  it('serves a repeat request from cache without touching the provider', async () => {
    const attempts = route('/cached', () => ({ status: 200, body: { ok: true } }));
    const client = new ProviderClient({ cache: new TtlCache() });

    const first = await client.request<{ ok: boolean }>('codex', `${baseUrl}/cached`, {
      cacheKey: 'test:cached',
      cacheTtlMs: 5000,
    });
    const second = await client.request<{ ok: boolean }>('codex', `${baseUrl}/cached`, {
      cacheKey: 'test:cached',
      cacheTtlMs: 5000,
    });

    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
    // One network call for two requests: that is the cache working.
    expect(attempts()).toBe(1);
  });

  it('refetches once the entry is no longer fresh', async () => {
    const attempts = route('/short', () => ({ status: 200, body: { ok: true } }));
    const client = new ProviderClient({ cache: new TtlCache() });

    await client.request('codex', `${baseUrl}/short`, { cacheKey: 'test:short', cacheTtlMs: 20 });
    await new Promise((resolve) => setTimeout(resolve, 40));
    await client.request('codex', `${baseUrl}/short`, { cacheKey: 'test:short', cacheTtlMs: 20 });

    expect(attempts()).toBe(2);
  });

  it('bypasses the cache entirely when no key is given', async () => {
    const attempts = route('/nocache', () => ({ status: 200, body: { ok: true } }));
    const client = new ProviderClient({ cache: new TtlCache() });

    await client.request('codex', `${baseUrl}/nocache`);
    await client.request('codex', `${baseUrl}/nocache`);

    expect(attempts()).toBe(2);
  });
});

describe('ProviderClient — retry', () => {
  it('retries a 503 and succeeds on a later attempt', async () => {
    const attempts = route('/flaky', (attempt) =>
      attempt < 3 ? { status: 503, body: { error: 'busy' } } : { status: 200, body: { ok: true } },
    );

    const client = new ProviderClient({ cache: new TtlCache() });
    const result = await client.request<{ ok: boolean }>('codex', `${baseUrl}/flaky`, {
      retries: 3,
    });

    expect(result).toEqual({ ok: true });
    expect(attempts()).toBe(3);
  });

  it('does not retry a 400, because a bad request stays bad', async () => {
    const attempts = route('/badreq', () => ({ status: 400, body: { error: 'bad' } }));
    const client = new ProviderClient({ cache: new TtlCache() });

    await expect(
      client.request('codex', `${baseUrl}/badreq`, { retries: 3 }),
    ).rejects.toBeInstanceOf(ProviderError);

    expect(attempts()).toBe(1);
  });

  it('gives up after the configured number of attempts', async () => {
    const attempts = route('/always503', () => ({ status: 503, body: { error: 'busy' } }));
    const client = new ProviderClient({ cache: new TtlCache() });

    const error = await client
      .request('codex', `${baseUrl}/always503`, { retries: 2 })
      .catch((caught: unknown) => caught);

    expect(isProviderError(error)).toBe(true);
    expect((error as ProviderError).status).toBe(503);
    // Initial attempt plus two retries.
    expect(attempts()).toBe(3);
  });
});

describe('ProviderClient — timeout', () => {
  it('aborts a response that exceeds the timeout', async () => {
    route('/slow', () => ({ status: 200, body: { ok: true }, delayMs: 400 }));
    const client = new ProviderClient({ cache: new TtlCache() });

    const error = await client
      .request('codex', `${baseUrl}/slow`, { timeoutMs: 80, retries: 0 })
      .catch((caught: unknown) => caught as ProviderError);

    expect(isProviderError(error)).toBe(true);
    expect(error.message).toContain('timed out');
    expect(error.isNetworkError).toBe(true);
  });

  it('succeeds when the response arrives inside the timeout', async () => {
    route('/quick', () => ({ status: 200, body: { ok: true }, delayMs: 20 }));
    const client = new ProviderClient({ cache: new TtlCache() });

    await expect(
      client.request('codex', `${baseUrl}/quick`, { timeoutMs: 1000, retries: 0 }),
    ).resolves.toEqual({ ok: true });
  });
});

describe('ProviderClient — graceful fallback', () => {
  it('serves a stale cached value when the provider fails', async () => {
    let healthy = true;
    route('/fallback', () =>
      healthy ? { status: 200, body: { value: 'good' } } : { status: 500, body: { error: 'down' } },
    );

    const client = new ProviderClient({ cache: new TtlCache({ staleMultiplier: 50 }) });

    // Populate the cache while the provider is healthy.
    await client.request('codex', `${baseUrl}/fallback`, {
      cacheKey: 'test:fallback',
      cacheTtlMs: 20,
    });

    healthy = false;
    await new Promise((resolve) => setTimeout(resolve, 40));

    // The entry is stale and the provider is down -- the stale value wins over
    // an error, which is the whole point of the fallback.
    const result = await client.request<{ value: string }>('codex', `${baseUrl}/fallback`, {
      cacheKey: 'test:fallback',
      cacheTtlMs: 20,
      retries: 0,
    });

    expect(result).toEqual({ value: 'good' });
  });

  it('throws when the provider fails and nothing is cached', async () => {
    route('/nofallback', () => ({ status: 500, body: { error: 'down' } }));
    const client = new ProviderClient({ cache: new TtlCache() });

    await expect(
      client.request('codex', `${baseUrl}/nofallback`, {
        cacheKey: 'test:nofallback',
        retries: 0,
      }),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it('treats a configured status as absent rather than an error', async () => {
    route('/missing', () => ({ status: 404, body: { error: 'not found' } }));
    const client = new ProviderClient({ cache: new TtlCache() });

    const result = await client.request('coingecko', `${baseUrl}/missing`, {
      nullOnStatus: [404],
    });

    expect(result).toBeNull();
  });
});

describe('ProviderClient — structured logging', () => {
  it('emits a structured record per outcome, without leaking query strings', async () => {
    route('/logged', () => ({ status: 200, body: { ok: true } }));

    const records: ProviderLogRecord[] = [];
    setProviderLogger((record) => records.push(record));

    const client = new ProviderClient({ cache: new TtlCache() });
    await client.request('codex', `${baseUrl}/logged?apikey=SUPERSECRET`, {
      cacheKey: 'test:logged',
    });

    const success = records.find((record) => record.event === 'provider.request.ok');
    expect(success).toBeDefined();
    expect(success?.provider).toBe('codex');
    expect(typeof success?.ms).toBe('number');

    // Credentials frequently ride in query strings; they must not be logged.
    expect(JSON.stringify(records)).not.toContain('SUPERSECRET');
  });

  it('logs a retry and then a failure', async () => {
    route('/logfail', () => ({ status: 503, body: { error: 'busy' } }));

    const records: ProviderLogRecord[] = [];
    setProviderLogger((record) => records.push(record));

    const client = new ProviderClient({ cache: new TtlCache() });
    await client.request('rpc', `${baseUrl}/logfail`, { retries: 1 }).catch(() => undefined);

    expect(records.some((r) => r.event === 'provider.request.retry')).toBe(true);
    expect(records.some((r) => r.event === 'provider.request.failed')).toBe(true);
  });
});
