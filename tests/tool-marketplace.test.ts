import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { closeDb } from '../src/db/client.js';
import { applyMigrations } from '../src/db/migrate.js';
import { seed } from '../src/db/seed.js';

/**
 * Registry-side tool marketplace tests: the new manifest fields, the
 * `/tools/search`, `/tools/publish`, and `/tools/install` endpoints, and
 * tool-dependency validation.
 */

let app: FastifyInstance;

function as(actor: string | null) {
  return (options: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    url: string;
    payload?: unknown;
  }) => app.inject({ ...options, headers: actor ? { 'x-norien-actor': actor } : {} });
}

const anon = as(null);
const publisher = as('toolmaker');

const HTTP_TOOL = {
  name: 'Ping Tool',
  description: 'Pings an endpoint over HTTP.',
  version: '1.0.0',
  category: 'http',
  runtime: 'http',
  entrypoint: 'https://example.com/ping',
  input_schema: { type: 'object', properties: { host: { type: 'string' } } },
  output_schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  permissions: ['network:fetch'],
  environment: [{ name: 'PING_KEY', required: true, secret: true }],
  license: 'MIT',
  homepage: 'https://example.com',
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

describe('tool manifest', () => {
  it('publishes a tool with the full manifest and echoes every field', async () => {
    const response = await publisher({ method: 'POST', url: '/tools/publish', payload: HTTP_TOOL });
    const tool = response.json();

    expect(response.statusCode).toBe(201);
    expect(tool.slug).toBe('ping-tool');
    expect(tool.runtime).toBe('http');
    expect(tool.entrypoint).toBe('https://example.com/ping');
    expect(tool.permissions).toEqual(['network:fetch']);
    expect(tool.environment[0]).toMatchObject({ name: 'PING_KEY', required: true, secret: true });
    expect(tool.license).toBe('MIT');
    expect(tool.install_command).toBe('norien tool install ping-tool@1.0.0');
  });

  it('rejects an http tool with no entrypoint', async () => {
    const { entrypoint, ...withoutEntrypoint } = HTTP_TOOL;
    const response = await publisher({
      method: 'POST',
      url: '/tools/publish',
      payload: { ...withoutEntrypoint, name: 'No Entry Tool' },
    });

    expect(response.statusCode).toBe(422);
  });

  it('rejects an unknown category', async () => {
    const response = await publisher({
      method: 'POST',
      url: '/tools/publish',
      payload: { ...HTTP_TOOL, name: 'Bad Category Tool', category: 'nonsense' },
    });

    expect(response.statusCode).toBe(422);
  });

  it('validates tool dependencies exist', async () => {
    const response = await publisher({
      method: 'POST',
      url: '/tools/publish',
      payload: { ...HTTP_TOOL, name: 'Needy Tool', dependencies: ['no-such-tool'] },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('DEPENDENCY_MISSING');
  });

  it('refuses a tool that depends on itself', async () => {
    const response = await publisher({
      method: 'POST',
      url: '/tools/publish',
      payload: { ...HTTP_TOOL, name: 'Ping Tool', slug: 'ping-tool', dependencies: ['ping-tool'] },
    });

    expect(response.statusCode).toBe(422);
  });
});

describe('GET /tools/search', () => {
  it('finds tools by term', async () => {
    const response = await anon({ method: 'GET', url: '/tools/search?q=ping' });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.data.some((tool: { slug: string }) => tool.slug === 'ping-tool')).toBe(true);
  });

  it('filters by runtime', async () => {
    const response = await anon({ method: 'GET', url: '/tools/search?q=tool&runtime=http' });

    expect(
      response.json().data.every((tool: { runtime: string }) => tool.runtime === 'http'),
    ).toBe(true);
  });

  it('requires a query term', async () => {
    const response = await anon({ method: 'GET', url: '/tools/search' });
    expect(response.statusCode).toBe(422);
  });
});

describe('POST /tools/install', () => {
  it('resolves a tool with its manifest and version', async () => {
    const response = await anon({
      method: 'POST',
      url: '/tools/install',
      payload: { tool: 'ping-tool' },
    });
    const body = response.json();

    expect(response.statusCode).toBe(201);
    expect(body.resolved_version).toBe('1.0.0');
    expect(body.tool.slug).toBe('ping-tool');
    expect(body.tool.runtime).toBe('http');
    expect(body.install_command).toBe('norien tool install ping-tool@1.0.0');
  });

  it('returns dependency tools alongside the requested one', async () => {
    // A tool that depends on another published tool.
    await publisher({
      method: 'POST',
      url: '/tools/publish',
      payload: { ...HTTP_TOOL, name: 'Composite Tool', dependencies: ['ping-tool'] },
    });

    const response = await anon({
      method: 'POST',
      url: '/tools/install',
      payload: { tool: 'composite-tool' },
    });
    const body = response.json();

    expect(body.dependencies.map((tool: { slug: string }) => tool.slug)).toContain('ping-tool');
  });

  it('404s for an unknown tool', async () => {
    const response = await anon({
      method: 'POST',
      url: '/tools/install',
      payload: { tool: 'ghost-tool' },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('versioning', () => {
  it('appends an immutable version and resolves a pin', async () => {
    await publisher({
      method: 'POST',
      url: '/tools/publish',
      payload: { ...HTTP_TOOL, version: '1.1.0', permissions: ['network:fetch', 'network:listen'] },
    });

    const head = await anon({ method: 'GET', url: '/tools/ping-tool' });
    expect(head.json().version).toBe('1.1.0');

    const pinned = await anon({
      method: 'POST',
      url: '/tools/install',
      payload: { tool: 'ping-tool', version: '1.0.0' },
    });
    expect(pinned.json().resolved_version).toBe('1.0.0');
    expect(pinned.json().tool.permissions).toEqual(['network:fetch']);
  });
});

describe('backward compatibility', () => {
  it('keeps seeded tools working with null runtime', async () => {
    const response = await anon({ method: 'GET', url: '/tools/search?q=search' });
    const searchTool = response.json().data.find((tool: { slug: string }) => tool.slug === 'web-search');

    expect(searchTool).toBeDefined();
    // Seeded before the marketplace, so it has no runtime -- and that is fine.
    expect(searchTool.runtime).toBeNull();
    expect(searchTool.install_command).toContain('norien tool install web-search');
  });

  it('still resolves tools for an agent runtime with the new fields', async () => {
    const response = await anon({ method: 'GET', url: '/agents/research-agent/runtime' });
    const tool = response.json().dependencies.resolved[0];

    // ResolvedTool now carries runtime/permissions for injection.
    expect(tool).toHaveProperty('permissions');
    expect(tool).toHaveProperty('runtime');
  });
});
