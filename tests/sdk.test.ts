import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Norien, NorienClient, NorienError, toQuery } from '@norien/sdk';

import { buildApp } from '../src/app.js';
import { closeDb } from '../src/db/client.js';
import { applyMigrations } from '../src/db/migrate.js';
import { seed } from '../src/db/seed.js';

let app: FastifyInstance;
let registry: string;

function client(actor = 'sdk-test'): NorienClient {
  return new NorienClient({ baseUrl: registry, actor, apiKey: 'nrn_sdk_test' });
}

beforeAll(async () => {
  await applyMigrations();
  await seed();

  app = await buildApp();
  await app.listen({ host: '127.0.0.1', port: 0 });

  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('Server did not bind a port.');
  registry = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await app?.close();
  await closeDb();
});

describe('construction', () => {
  it('accepts a bare API key, matching the documented shape', () => {
    // `new Norien(API_KEY)` is the form the docs and examples promise.
    const instance = new Norien('nrn_key');
    expect(instance).toBeInstanceOf(NorienClient);
  });

  it('accepts an options object and exposes the resolved target', () => {
    const instance = new NorienClient({ baseUrl: `${registry}/`, actor: 'acme' });

    // The trailing slash is normalised away so paths never double up.
    expect(instance.baseUrl).toBe(registry);
    expect(instance.actor).toBe('acme');
  });
});

describe('query serialisation', () => {
  it('repeats array parameters and drops empty values', () => {
    const query = toQuery({ tag: ['a', 'b'], q: 'x', limit: undefined, author: '' });

    expect(query.getAll('tag')).toEqual(['a', 'b']);
    expect(query.get('q')).toBe('x');
    expect(query.has('limit')).toBe(false);
    expect(query.has('author')).toBe(false);
  });
});

describe('reads', () => {
  it('searches across both catalogues', async () => {
    const results = await client().search('trading');

    expect(results.meta.total).toBeGreaterThan(0);
    expect(results.data.some((hit) => hit.type === 'agent')).toBe(true);
  });

  it('accepts a params object for filtered search', async () => {
    const results = await client().search({ q: 'trading', type: 'agent', limit: 1 });

    expect(results.data).toHaveLength(1);
    expect(results.data[0]?.type).toBe('agent');
  });

  it('fetches an agent and its runtime view', async () => {
    const agent = await client().info('trading-agent');
    expect(agent.runtime).toBe('python');

    const runtime = await client().agents.runtime('trading-agent', {
      environment: ['EXCHANGE_API_KEY', 'EXCHANGE_API_SECRET', 'MAX_POSITION_USD'],
    });

    expect(runtime.environment.missing).toEqual([]);
    expect(runtime.ready).toBe(true);
  });

  it('resolves a version range', async () => {
    const agent = await client().info('research-agent', { version: '^1.0.0' });
    expect(agent.version).toBe('1.1.0');
  });
});

describe('pagination', () => {
  it('walks every page without repeating or dropping items', async () => {
    const instance = client();
    const seen: string[] = [];

    for await (const agent of instance.paginate(
      (page) => instance.agents.list(page),
      { pageSize: 3 },
    )) {
      seen.push(agent.slug);
    }

    const total = (await instance.agents.list({ limit: 1 })).meta.total;

    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
  });
});

describe('writes', () => {
  it('publishes and installs an agent', async () => {
    const instance = client('sdk-publisher');

    const published = await instance.publish({
      manifest: {
        name: 'SDK Test Agent',
        version: '1.0.0',
        description: 'Published by the SDK test suite.',
        runtime: 'node',
        entrypoint: 'dist/index.js',
        tools: ['web-search'],
        permissions: ['network:fetch'],
        environment: [{ name: 'SDK_TEST_KEY', required: true, secret: true }],
        commands: { start: 'node dist/index.js' },
      },
    });

    expect(published.type).toBe('agent');
    if (published.type !== 'agent') throw new Error('unreachable');
    expect(published.agent.slug).toBe('sdk-test-agent');
    expect(published.agent.author).toBe('sdk-publisher');

    const installed = await instance.install('sdk-test-agent');
    expect(installed.installation.installed_version).toBe('1.0.0');
    expect(installed.dependencies.satisfied).toBe(true);
    expect(installed.environment.missing).toEqual(['SDK_TEST_KEY']);
  });

  it('inspects a manifest without publishing it', async () => {
    const inspection = await client().runtime.inspect({
      name: 'Never Published',
      version: '1.0.0',
      description: 'Only inspected, never uploaded.',
      runtime: 'node',
      entrypoint: 'index.js',
      tools: ['web-search'],
    });

    expect(inspection.version_check.action).toBe('create');

    await expect(client().info('never-published')).rejects.toMatchObject({ status: 404 });
  });
});

describe('errors', () => {
  it('preserves the registry error envelope', async () => {
    const error = await client()
      .info('definitely-missing-agent')
      .then(() => null)
      .catch((caught: unknown) => caught as NorienError);

    expect(error).toBeInstanceOf(NorienError);
    expect(error?.code).toBe('NOT_FOUND');
    expect(error?.status).toBe(404);
    expect(error?.isNotFound).toBe(true);
    // Quotable in a bug report.
    expect(error?.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('surfaces field-scoped validation details', async () => {
    const error = await client('sdk-publisher')
      .publish({
        manifest: {
          name: 'Broken Agent',
          version: '1.0.0',
          description: 'Declares a tool nobody published.',
          runtime: 'node',
          entrypoint: 'index.js',
          tools: ['no-such-tool-anywhere'],
        },
      })
      .then(() => null)
      .catch((caught: unknown) => caught as NorienError);

    expect(error?.code).toBe('DEPENDENCY_MISSING');
    expect(error?.isValidationError).toBe(true);
    expect(error?.details[0]?.message).toContain('no-such-tool-anywhere');
    expect(error?.format()).toContain('no-such-tool-anywhere');
  });

  it('reports an unreachable registry as a network error', async () => {
    const offline = new NorienClient({ baseUrl: 'http://127.0.0.1:1', retries: 0, timeout: 2000 });

    const error = await offline
      .health()
      .then(() => null)
      .catch((caught: unknown) => caught as NorienError);

    expect(error).toBeInstanceOf(NorienError);
    expect(error?.isNetworkError).toBe(true);
    expect(error?.status).toBeNull();
  });

  it('rejects an anonymous write with 401', async () => {
    const anonymous = new NorienClient({ baseUrl: registry });

    const error = await anonymous
      .install('research-agent')
      .then(() => null)
      .catch((caught: unknown) => caught as NorienError);

    expect(error?.status).toBe(401);
    expect(error?.isUnauthorized).toBe(true);
  });
});
