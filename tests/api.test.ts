import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { closeDb } from '../src/db/client.js';
import { applyMigrations } from '../src/db/migrate.js';

let app: FastifyInstance;

/** Issues a request as the given actor, mirroring how a client authenticates. */
function as(actor: string | null) {
  return (options: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    url: string;
    payload?: unknown;
  }) =>
    app.inject({
      ...options,
      headers: actor ? { 'x-norien-actor': actor } : {},
    });
}

const anon = as(null);
const acme = as('acme');
const other = as('rival');

const TOOL = {
  name: 'Echo Tool',
  description: 'Returns whatever it is given.',
  version: '1.0.0',
  category: 'developer',
  tags: ['testing'],
  input_schema: { type: 'object', properties: { text: { type: 'string' } } },
  output_schema: { type: 'object', properties: { text: { type: 'string' } } },
};

const MANIFEST = {
  name: 'Echo Agent',
  version: '1.0.0',
  description: 'An agent that echoes input back.',
  tools: ['echo-tool'],
  permissions: ['network:fetch'],
  entrypoint: 'dist/index.js',
  environment: ['ECHO_PREFIX'],
};

beforeAll(async () => {
  await applyMigrations();
  app = await buildApp();

  await acme({ method: 'POST', url: '/tools', payload: TOOL });
  await acme({ method: 'POST', url: '/agents', payload: { manifest: MANIFEST, tags: ['testing'] } });
});

afterAll(async () => {
  await app?.close();
  await closeDb();
});

describe('GET /health', () => {
  it('reports the database as reachable', async () => {
    const response = await anon({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      checks: { database: { ok: true } },
    });
  });
});

describe('manifest validation', () => {
  it('derives the slug, normalises env vars, and stores a canonical manifest', async () => {
    const response = await anon({ method: 'GET', url: '/agents/echo-agent' });
    const agent = response.json();

    expect(response.statusCode).toBe(200);
    expect(agent.slug).toBe('echo-agent');
    expect(agent.version).toBe('1.0.0');
    expect(agent.required_tools).toEqual(['echo-tool']);
    // A bare string in the manifest becomes a full descriptor.
    expect(agent.environment_variables).toEqual([
      { name: 'ECHO_PREFIX', required: true, secret: false },
    ]);
    expect(agent.install_command).toBe('norien install echo-agent@1.0.0');
  });

  it('rejects a manifest that is missing required fields', async () => {
    const response = await acme({
      method: 'POST',
      url: '/agents',
      payload: { manifest: { name: 'Broken' } },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an invalid semantic version', async () => {
    const response = await acme({
      method: 'POST',
      url: '/agents',
      payload: { manifest: { ...MANIFEST, name: 'Bad Version', version: 'v-one' } },
    });

    expect(response.statusCode).toBe(422);
  });
});

describe('tool dependency validation', () => {
  it('refuses to publish an agent requiring an unpublished tool', async () => {
    const response = await acme({
      method: 'POST',
      url: '/agents',
      payload: {
        manifest: { ...MANIFEST, name: 'Ghost Agent', tools: ['does-not-exist'] },
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('DEPENDENCY_MISSING');
    expect(response.json().error.details[0].slug).toBe('does-not-exist');
  });

  it('refuses to delete a tool that agents still depend on', async () => {
    const response = await acme({ method: 'DELETE', url: '/tools/echo-tool' });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.details[0].agent).toBe('echo-agent');
  });
});

describe('slug uniqueness', () => {
  it('rejects a second agent claiming the same slug', async () => {
    const response = await acme({
      method: 'POST',
      url: '/agents',
      payload: { manifest: MANIFEST },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('SLUG_TAKEN');
  });

  it('rejects reserved slugs', async () => {
    const response = await acme({
      method: 'POST',
      url: '/agents',
      payload: { slug: 'health', manifest: { ...MANIFEST, name: 'Health', tools: [] } },
    });

    expect(response.statusCode).toBe(422);
  });
});

describe('versioning', () => {
  it('appends an immutable version and moves the catalogue head', async () => {
    const published = await acme({
      method: 'POST',
      url: '/publish',
      payload: {
        type: 'agent',
        manifest: { ...MANIFEST, version: '1.1.0', permissions: ['network:fetch', 'fs:read'] },
      },
    });

    expect(published.statusCode).toBe(201);
    expect(published.json().agent.version).toBe('1.1.0');

    const pinned = await anon({ method: 'GET', url: '/agents/echo-agent?version=1.0.0' });
    expect(pinned.json().permissions).toEqual(['network:fetch']);

    const head = await anon({ method: 'GET', url: '/agents/echo-agent' });
    expect(head.json().version).toBe('1.1.0');
  });

  it('resolves a semver range to the highest matching version', async () => {
    const response = await anon({ method: 'GET', url: '/agents/echo-agent?version=^1.0.0' });

    expect(response.json().version).toBe('1.1.0');
  });

  it('rejects republishing an existing version', async () => {
    const response = await acme({
      method: 'POST',
      url: '/publish',
      payload: { type: 'agent', manifest: { ...MANIFEST, version: '1.1.0' } },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('VERSION_EXISTS');
  });

  it('rejects a version lower than the current head', async () => {
    const response = await acme({
      method: 'POST',
      url: '/publish',
      payload: { type: 'agent', manifest: { ...MANIFEST, version: '0.9.0' } },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('VERSION_NOT_INCREASING');
  });

  it('orders versions numerically rather than lexically', async () => {
    await acme({
      method: 'POST',
      url: '/publish',
      payload: { type: 'agent', manifest: { ...MANIFEST, version: '10.0.0' } },
    });

    const head = await anon({ method: 'GET', url: '/agents/echo-agent' });
    expect(head.json().version).toBe('10.0.0');

    const versions = await anon({ method: 'GET', url: '/agents/echo-agent/versions' });
    expect(versions.json().data[0].version).toBe('10.0.0');
  });
});

describe('ownership', () => {
  it('forbids a non-owner from publishing a new version', async () => {
    const response = await other({
      method: 'POST',
      url: '/publish',
      payload: { type: 'agent', manifest: { ...MANIFEST, version: '11.0.0' } },
    });

    expect(response.statusCode).toBe(403);
  });

  it('forbids a non-owner from patching', async () => {
    const response = await other({
      method: 'PATCH',
      url: '/agents/echo-agent',
      payload: { description: 'Hijacked.' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('requires authentication to publish', async () => {
    const response = await anon({
      method: 'POST',
      url: '/agents',
      payload: { manifest: { ...MANIFEST, name: 'Anonymous Agent', tools: [] } },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('visibility', () => {
  it('hides private agents from other callers but shows them to the owner', async () => {
    await acme({
      method: 'POST',
      url: '/agents',
      payload: {
        visibility: 'private',
        manifest: { ...MANIFEST, name: 'Secret Agent', tools: [] },
      },
    });

    expect((await anon({ method: 'GET', url: '/agents/secret-agent' })).statusCode).toBe(404);
    expect((await acme({ method: 'GET', url: '/agents/secret-agent' })).statusCode).toBe(200);

    const listed = await anon({ method: 'GET', url: '/agents' });
    const slugs = listed.json().data.map((agent: { slug: string }) => agent.slug);
    expect(slugs).not.toContain('secret-agent');
  });
});

describe('search, filtering, and pagination', () => {
  it('ranks matches across both catalogues', async () => {
    const response = await anon({ method: 'GET', url: '/search?q=echo' });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((hit: { score: number }) => hit.score > 0)).toBe(true);
    expect(new Set(body.data.map((hit: { type: string }) => hit.type))).toEqual(
      new Set(['agent', 'tool']),
    );
  });

  it('restricts search to one type', async () => {
    const response = await anon({ method: 'GET', url: '/search?q=echo&type=tool' });

    expect(
      response.json().data.every((hit: { type: string }) => hit.type === 'tool'),
    ).toBe(true);
  });

  it('filters agents by required tool', async () => {
    const response = await anon({ method: 'GET', url: '/agents?tool=echo-tool' });
    const slugs = response.json().data.map((agent: { slug: string }) => agent.slug);

    expect(slugs).toContain('echo-agent');
    expect(slugs).not.toContain('secret-agent');
  });

  it('filters by tag', async () => {
    const response = await anon({ method: 'GET', url: '/agents?tag=testing' });

    expect(response.json().meta.total).toBeGreaterThan(0);
  });

  it('returns a coherent pagination envelope', async () => {
    const first = await anon({ method: 'GET', url: '/agents?limit=1&offset=0' });
    const body = first.json();

    expect(body.data).toHaveLength(1);
    expect(body.meta.limit).toBe(1);
    expect(body.meta.has_more).toBe(body.meta.total > 1);
    expect(body.meta.next_offset).toBe(body.meta.total > 1 ? 1 : null);
  });

  it('rejects an out-of-range limit', async () => {
    const response = await anon({ method: 'GET', url: '/agents?limit=99999' });

    expect(response.statusCode).toBe(422);
  });
});

describe('installation', () => {
  it('resolves a range to a concrete version and returns runtime dependencies', async () => {
    const response = await as('installer')({
      method: 'POST',
      url: '/install',
      payload: { agent: 'echo-agent', version: '^1.0.0' },
    });
    const body = response.json();

    expect(response.statusCode).toBe(201);
    expect(body.installation.installed_version).toBe('1.1.0');
    expect(body.installation.user).toBe('installer');
    expect(body.dependencies.resolved.map((tool: { slug: string }) => tool.slug)).toEqual([
      'echo-tool',
    ]);
    expect(body.dependencies.satisfied).toBe(true);
  });

  it('is idempotent', async () => {
    const first = await as('installer')({
      method: 'POST',
      url: '/install',
      payload: { agent: 'echo-agent' },
    });
    const second = await as('installer')({
      method: 'POST',
      url: '/install',
      payload: { agent: 'echo-agent' },
    });

    expect(first.json().installation.id).toBe(second.json().installation.id);

    const listed = await as('installer')({ method: 'GET', url: '/installations' });
    expect(listed.json().meta.total).toBe(1);
  });

  it('rejects installing an unknown agent', async () => {
    const response = await as('installer')({
      method: 'POST',
      url: '/install',
      payload: { agent: 'no-such-agent' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('uninstalls without losing history', async () => {
    const removed = await as('installer')({
      method: 'POST',
      url: '/uninstall',
      payload: { agent: 'echo-agent' },
    });
    expect(removed.statusCode).toBe(204);

    const active = await as('installer')({ method: 'GET', url: '/installations' });
    expect(active.json().meta.total).toBe(0);

    const all = await as('installer')({
      method: 'GET',
      url: '/installations?include_uninstalled=true',
    });
    expect(all.json().meta.total).toBe(1);
  });
});

describe('lifecycle', () => {
  it('patches metadata without touching published versions', async () => {
    const patched = await acme({
      method: 'PATCH',
      url: '/agents/echo-agent',
      payload: { description: 'Updated description.', tags: ['testing', 'echo'] },
    });

    expect(patched.statusCode).toBe(200);
    expect(patched.json().description).toBe('Updated description.');
    expect(patched.json().version).toBe('10.0.0');

    const pinned = await anon({ method: 'GET', url: '/agents/echo-agent?version=1.0.0' });
    expect(pinned.json().description).toBe('An agent that echoes input back.');
  });

  it('soft-deletes an agent and keeps its slug reserved', async () => {
    await acme({
      method: 'POST',
      url: '/tools',
      payload: { ...TOOL, name: 'Disposable Tool' },
    });
    await acme({
      method: 'POST',
      url: '/agents',
      payload: { manifest: { ...MANIFEST, name: 'Disposable Agent', tools: [] } },
    });

    const deleted = await acme({ method: 'DELETE', url: '/agents/disposable-agent' });
    expect(deleted.statusCode).toBe(204);

    expect((await anon({ method: 'GET', url: '/agents/disposable-agent' })).statusCode).toBe(404);

    const reclaim = await as('rival')({
      method: 'POST',
      url: '/agents',
      payload: { manifest: { ...MANIFEST, name: 'Disposable Agent', tools: [] } },
    });
    expect(reclaim.statusCode).toBe(409);
  });
});

describe('publish endpoint', () => {
  it('infers a tool from the payload shape', async () => {
    const response = await acme({
      method: 'POST',
      url: '/publish',
      payload: { ...TOOL, name: 'Inferred Tool' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().type).toBe('tool');
  });

  it('rejects an ambiguous payload', async () => {
    const response = await acme({
      method: 'POST',
      url: '/publish',
      payload: { name: 'Ambiguous', description: 'No discriminant.', version: '1.0.0' },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('error contract', () => {
  it('returns the standard envelope with a request id on 404', async () => {
    const response = await anon({ method: 'GET', url: '/agents/definitely-missing' });
    const body = response.json();

    expect(response.statusCode).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.request_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns the same envelope for unknown routes', async () => {
    const response = await anon({ method: 'GET', url: '/nope' });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
  });
});

describe('openapi', () => {
  it('documents every public endpoint', async () => {
    const document = app.swagger() as { paths: Record<string, unknown> };

    for (const path of [
      '/health',
      '/agents',
      '/agents/{slug}',
      '/tools',
      '/tools/{slug}',
      '/search',
      '/install',
      '/publish',
    ]) {
      expect(document.paths, `missing ${path}`).toHaveProperty([path]);
    }
  });
});
