import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { closeDb } from '../src/db/client.js';
import { applyMigrations } from '../src/db/migrate.js';
import { seed } from '../src/db/seed.js';

let app: FastifyInstance;

function as(actor: string | null) {
  return (options: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    url: string;
    payload?: unknown;
  }) => app.inject({ ...options, headers: actor ? { 'x-norien-actor': actor } : {} });
}

const anon = as(null);
const builder = as('builder');

/** A valid agent.json used as the base for negative cases. */
const MANIFEST = {
  name: 'Runtime Probe',
  version: '1.0.0',
  description: 'An agent used to exercise the runtime layer.',
  runtime: 'node' as const,
  entrypoint: 'dist/probe.js',
  tools: ['web-search'],
  permissions: ['network:fetch'],
  environment: [
    { name: 'PROBE_KEY', required: true, secret: true },
    { name: 'PROBE_TIMEOUT', required: false, default: '30' },
  ],
  commands: { start: 'node dist/probe.js', health: '/health' },
};

beforeAll(async () => {
  await applyMigrations();
  await seed();
  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
  await closeDb();
});

describe('sample catalogue', () => {
  it('ships ten agents that are all installable', async () => {
    const response = await anon({ method: 'GET', url: '/agents?limit=50' });
    const body = response.json();

    expect(body.meta.total).toBe(10);
    expect(body.data).toHaveLength(10);

    for (const agent of body.data as { slug: string; runtime: string }[]) {
      const runtime = await anon({ method: 'GET', url: `/agents/${agent.slug}/runtime` });

      expect(runtime.statusCode, agent.slug).toBe(200);
      // Every shipped agent's tools must resolve, or the catalogue is broken.
      expect(runtime.json().dependencies.satisfied, agent.slug).toBe(true);
    }
  });

  it('covers both runtimes', async () => {
    const node = await anon({ method: 'GET', url: '/agents?runtime=node&limit=50' });
    const python = await anon({ method: 'GET', url: '/agents?runtime=python&limit=50' });

    expect(node.json().meta.total).toBeGreaterThan(0);
    expect(python.json().meta.total).toBeGreaterThan(0);
    expect(node.json().meta.total + python.json().meta.total).toBe(10);
  });

  it('ships the tools the sample agents declare', async () => {
    const response = await anon({ method: 'GET', url: '/tools?limit=50' });

    expect(response.json().meta.total).toBe(12);
  });
});

describe('runtime detection', () => {
  it('reports a declared runtime as declared', async () => {
    const response = await anon({ method: 'GET', url: '/agents/research-agent/runtime' });
    const body = response.json();

    expect(body.runtime).toMatchObject({
      name: 'node',
      source: 'declared',
      interpreter: 'node',
      manifest_file: 'package.json',
    });
    expect(body.runtime.commands.start).toBe('node dist/index.js');
  });

  it('detects python from a declared runtime and interpreter', async () => {
    const response = await anon({ method: 'GET', url: '/agents/news-agent/runtime' });

    expect(response.json().runtime).toMatchObject({
      name: 'python',
      interpreter: 'python',
      manifest_file: 'pyproject.toml',
    });
  });

  it('infers the runtime from the entrypoint when undeclared', async () => {
    const { runtime, ...withoutRuntime } = MANIFEST;
    const response = await builder({
      method: 'POST',
      url: '/runtime/inspect',
      payload: { manifest: { ...withoutRuntime, entrypoint: 'app/main.py' } },
    });
    const body = response.json();

    expect(body.runtime.name).toBe('python');
    expect(body.runtime.source).toBe('inferred');
    // Inference is a fallback, so it is surfaced as a warning.
    expect(body.diagnostics).toContainEqual(
      expect.objectContaining({ level: 'warning', code: 'RUNTIME_INFERRED' }),
    );
  });

  it('derives a start command when the manifest omits one', async () => {
    const { commands, ...withoutCommands } = MANIFEST;
    const response = await builder({
      method: 'POST',
      url: '/runtime/inspect',
      payload: { manifest: withoutCommands },
    });
    const body = response.json();

    expect(body.runtime.commands.start).toBe('node dist/probe.js');
    expect(body.runtime.commands.health).toBeNull();
    expect(body.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'NO_HEALTH_COMMAND' }),
    );
  });

  it('rejects an unsupported runtime by name', async () => {
    const response = await builder({
      method: 'POST',
      url: '/runtime/inspect',
      payload: { manifest: { ...MANIFEST, runtime: 'ruby' } },
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.stringify(response.json())).toContain('node');
  });

  it('rejects an entrypoint it cannot classify', async () => {
    const { runtime, ...withoutRuntime } = MANIFEST;
    const response = await builder({
      method: 'POST',
      url: '/runtime/inspect',
      payload: { manifest: { ...withoutRuntime, entrypoint: 'bin/agent.wasm' } },
    });
    const body = response.json();

    expect(response.statusCode).toBe(422);
    expect(body.error.code).toBe('MANIFEST_INVALID');
    // The error must say how to fix it, not just that it failed.
    expect(body.error.details[0].message).toContain('runtime');
  });
});

describe('environment checking', () => {
  it('classifies required, optional, and secret variables', async () => {
    const response = await builder({
      method: 'POST',
      url: '/runtime/inspect',
      payload: { manifest: MANIFEST },
    });
    const environment = response.json().environment;

    expect(environment.required).toEqual(['PROBE_KEY']);
    expect(environment.optional).toEqual(['PROBE_TIMEOUT']);
    expect(environment.secrets).toEqual(['PROBE_KEY']);
  });

  it('reports missing required variables and marks the agent not ready', async () => {
    const response = await builder({
      method: 'POST',
      url: '/runtime/inspect',
      payload: { manifest: MANIFEST },
    });
    const body = response.json();

    expect(body.environment.missing).toEqual(['PROBE_KEY']);
    expect(body.environment.satisfied).toBe(false);
    expect(body.ready).toBe(false);
    expect(body.diagnostics).toContainEqual(
      expect.objectContaining({ level: 'error', code: 'ENVIRONMENT_MISSING' }),
    );
  });

  it('becomes ready once the required variables are supplied', async () => {
    const response = await builder({
      method: 'POST',
      url: '/runtime/inspect',
      payload: { manifest: MANIFEST, environment: ['PROBE_KEY'] },
    });
    const body = response.json();

    expect(body.environment.missing).toEqual([]);
    expect(body.ready).toBe(true);
  });

  it('accepts a name/value map and never echoes the values', async () => {
    const response = await builder({
      method: 'POST',
      url: '/runtime/inspect',
      payload: { manifest: MANIFEST, environment: { PROBE_KEY: 'super-secret-value' } },
    });

    expect(response.json().ready).toBe(true);
    expect(response.body).not.toContain('super-secret-value');
  });

  it('does not count a variable with a declared default as missing', async () => {
    const response = await builder({
      method: 'POST',
      url: '/runtime/inspect',
      payload: {
        manifest: {
          ...MANIFEST,
          environment: [{ name: 'HAS_DEFAULT', required: true, default: 'ok' }],
        },
      },
    });

    expect(response.json().environment.missing).toEqual([]);
    expect(response.json().ready).toBe(true);
  });

  it('answers the environment question for a published agent', async () => {
    const without = await anon({ method: 'GET', url: '/agents/trading-agent/runtime' });
    expect(without.json().environment.missing).toContain('EXCHANGE_API_KEY');
    expect(without.json().ready).toBe(false);

    const query = 'EXCHANGE_API_KEY,EXCHANGE_API_SECRET,MAX_POSITION_USD';
    const with_ = await anon({
      method: 'GET',
      url: `/agents/trading-agent/runtime?environment=${query}`,
    });
    expect(with_.json().environment.missing).toEqual([]);
    expect(with_.json().ready).toBe(true);
  });
});

describe('tool resolver', () => {
  it('returns full metadata for every declared tool, in declaration order', async () => {
    const response = await anon({ method: 'GET', url: '/agents/trading-agent/runtime' });
    const dependencies = response.json().dependencies;

    expect(dependencies.requested).toEqual(['exchange', 'market-data', 'notifications']);
    expect(dependencies.resolved.map((tool: { slug: string }) => tool.slug)).toEqual([
      'exchange',
      'market-data',
      'notifications',
    ]);
    expect(dependencies.satisfied).toBe(true);

    const exchange = dependencies.resolved[0];
    expect(exchange.authentication.type).toBe('api_key');
    expect(exchange.input_schema).toHaveProperty('properties');
    expect(exchange.output_schema).toHaveProperty('properties');
  });

  it('reports unsatisfiable dependencies without throwing', async () => {
    const response = await builder({
      method: 'POST',
      url: '/runtime/inspect',
      payload: {
        manifest: { ...MANIFEST, tools: ['web-search', 'ghost-tool', 'phantom-tool'] },
      },
    });
    const body = response.json();

    // Inspection is a report, not a gate: 200 with the problem described.
    expect(response.statusCode).toBe(200);
    expect(body.dependencies.missing).toEqual(['ghost-tool', 'phantom-tool']);
    expect(body.dependencies.resolved.map((t: { slug: string }) => t.slug)).toEqual(['web-search']);
    expect(body.dependencies.satisfied).toBe(false);
    expect(body.ready).toBe(false);
  });

  it('de-duplicates a repeated tool declaration', async () => {
    const response = await builder({
      method: 'POST',
      url: '/runtime/inspect',
      payload: { manifest: { ...MANIFEST, tools: ['web-search', 'web-search'] } },
    });

    expect(response.json().dependencies.requested).toEqual(['web-search']);
  });

  it('still rejects an unsatisfiable agent at publish time', async () => {
    const response = await builder({
      method: 'POST',
      url: '/publish',
      payload: {
        type: 'agent',
        manifest: { ...MANIFEST, name: 'Ghost Runtime', tools: ['ghost-tool'] },
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('DEPENDENCY_MISSING');
  });
});

describe('version pre-flight', () => {
  it('reports `create` for an unpublished slug', async () => {
    const response = await builder({
      method: 'POST',
      url: '/runtime/inspect',
      payload: { manifest: { ...MANIFEST, name: 'Brand New Agent' } },
    });

    expect(response.json().version_check).toMatchObject({
      action: 'create',
      latest_published: null,
      acceptable: true,
    });
  });

  it('reports `new_version` for a higher version of an existing agent', async () => {
    const response = await builder({
      method: 'POST',
      url: '/runtime/inspect',
      payload: {
        slug: 'research-agent',
        manifest: { ...MANIFEST, name: 'Research Agent', version: '9.0.0', tools: [] },
      },
    });

    expect(response.json().version_check).toMatchObject({
      action: 'new_version',
      latest_published: '1.1.0',
      acceptable: true,
    });
  });

  it('reports `conflict` for an already-published version', async () => {
    const response = await builder({
      method: 'POST',
      url: '/runtime/inspect',
      payload: {
        slug: 'research-agent',
        manifest: { ...MANIFEST, name: 'Research Agent', version: '1.0.0', tools: [] },
      },
    });
    const check = response.json().version_check;

    expect(check.action).toBe('conflict');
    expect(check.acceptable).toBe(false);
    expect(check.conflict_reason).toContain('already been published');
  });

  it('reports `conflict` for a downgrade', async () => {
    const response = await builder({
      method: 'POST',
      url: '/runtime/inspect',
      payload: {
        slug: 'research-agent',
        manifest: { ...MANIFEST, name: 'Research Agent', version: '0.1.0', tools: [] },
      },
    });

    expect(response.json().version_check.conflict_reason).toContain('lower than');
  });

  it('agrees with what publishing actually does', async () => {
    const inspect = await builder({
      method: 'POST',
      url: '/runtime/inspect',
      payload: {
        slug: 'research-agent',
        manifest: { ...MANIFEST, name: 'Research Agent', version: '1.0.0', tools: [] },
      },
    });
    const publish = await as('norien')({
      method: 'POST',
      url: '/publish',
      payload: {
        type: 'agent',
        slug: 'research-agent',
        manifest: { ...MANIFEST, name: 'Research Agent', version: '1.0.0', tools: [] },
      },
    });

    expect(inspect.json().version_check.acceptable).toBe(false);
    expect(publish.statusCode).toBe(409);
  });

  it('does not flag a published agent as conflicting with itself', async () => {
    const response = await anon({ method: 'GET', url: '/agents/research-agent/runtime' });

    expect(response.json().version_check.action).not.toBe('conflict');
    expect(response.json().version_check.acceptable).toBe(true);
  });
});

describe('install response', () => {
  it('returns everything a CLI needs in one round trip', async () => {
    const response = await as('cli-user')({
      method: 'POST',
      url: '/install',
      payload: { agent: 'discord-agent', environment: ['DISCORD_BOT_TOKEN'] },
    });
    const body = response.json();

    expect(response.statusCode).toBe(201);

    expect(body.install_command).toBe('norien install discord-agent@1.3.0');
    expect(body.runtime).toMatchObject({ name: 'node', interpreter: 'node' });
    expect(body.manifest.entrypoint).toBe('dist/bot.js');
    expect(body.manifest.commands.start).toBe('node dist/bot.js');
    expect(body.permissions).toContain('chat:write');

    expect(body.dependencies.resolved.map((t: { slug: string }) => t.slug)).toEqual([
      'discord',
      'web-search',
      'vector-store',
    ]);

    // One variable was supplied, two were not.
    expect(body.environment.provided).toEqual(['DISCORD_BOT_TOKEN']);
    expect(body.environment.missing).toEqual(['DISCORD_GUILD_ID', 'VECTOR_API_KEY']);
    expect(body.ready).toBe(false);
  });

  it('describes the pinned version, not the catalogue head', async () => {
    const response = await as('cli-user')({
      method: 'POST',
      url: '/install',
      payload: { agent: 'research-agent', version: '1.0.0' },
    });
    const body = response.json();

    expect(body.installation.installed_version).toBe('1.0.0');
    expect(body.manifest.version).toBe('1.0.0');
    // 1.1.0 added vector-store; the pinned install must not see it.
    expect(body.dependencies.requested).toEqual(['web-search', 'http-fetch']);
  });
});

describe('registry filtering', () => {
  it('finds agents by the tool they require', async () => {
    const response = await anon({ method: 'GET', url: '/agents?tool=wallet&limit=50' });
    const slugs = response.json().data.map((agent: { slug: string }) => agent.slug).sort();

    expect(slugs).toEqual(['bridge-agent', 'portfolio-agent', 'wallet-agent']);
  });

  it('combines a runtime filter with a tag filter', async () => {
    const response = await anon({
      method: 'GET',
      url: '/agents?runtime=python&tag=finance&limit=50',
    });
    const slugs = response.json().data.map((agent: { slug: string }) => agent.slug).sort();

    expect(slugs).toEqual(['portfolio-agent', 'trading-agent']);
  });

  it('searches across agents and tools together', async () => {
    const response = await anon({ method: 'GET', url: '/search?q=discord' });
    const types = response.json().data.map((hit: { type: string }) => hit.type);

    expect(types).toContain('agent');
    expect(types).toContain('tool');
  });

  it('allows domain words that used to be reserved slugs', async () => {
    // `search`, `wallet`, and `twitter` are legitimate tool names.
    for (const slug of ['web-search', 'wallet', 'twitter']) {
      const response = await anon({ method: 'GET', url: `/tools/${slug}` });
      expect(response.statusCode, slug).toBe(200);
    }
  });
});

describe('openapi', () => {
  it('documents the runtime endpoints with examples', async () => {
    const document = app.swagger() as {
      paths: Record<string, unknown>;
      components?: { schemas?: Record<string, unknown> };
    };

    expect(document.paths).toHaveProperty(['/agents/{slug}/runtime']);
    expect(document.paths).toHaveProperty(['/runtime/inspect']);

    const schemas = JSON.stringify(document.components?.schemas ?? {});
    expect(schemas).toContain('manifest_file');
    expect(schemas).toContain('dist/index.js');
  });
});
