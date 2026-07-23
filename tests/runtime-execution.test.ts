import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  EnvironmentLoader,
  ExecutionPlanner,
  HealthManager,
  LogManager,
  PermissionValidator,
  RuntimeError,
  RuntimeManager,
  buildRuntimeServer,
  parseEnvFile,
  tokenize,
} from '@norien-live/runtime';
import type { FastifyInstance } from 'fastify';

/**
 * Runtime tests.
 *
 * These launch real child processes against real agent folders. The runtime's
 * whole job is process supervision, so mocking the process layer would test
 * nothing that matters.
 */

let workspace: string;
let manager: RuntimeManager;

/** Writes a minimal but genuine agent into the workspace. */
async function createAgent(
  slug: string,
  options: {
    manifest?: Record<string, unknown>;
    files?: Record<string, string>;
    env?: string;
  } = {},
): Promise<string> {
  const directory = path.join(workspace, 'norien_agents', slug);
  await mkdir(directory, { recursive: true });

  const manifest = {
    name: slug,
    version: '1.0.0',
    description: `Test agent ${slug}.`,
    runtime: 'node',
    entrypoint: 'index.js',
    tools: [],
    permissions: [],
    environment: [],
    commands: { start: 'node index.js' },
    ...options.manifest,
  };

  await writeFile(path.join(directory, 'agent.json'), JSON.stringify(manifest, null, 2));

  for (const [name, contents] of Object.entries(options.files ?? {})) {
    await writeFile(path.join(directory, name), contents);
  }

  if (options.env !== undefined) {
    await writeFile(path.join(directory, '.env'), options.env);
  }

  return directory;
}

/** A long-running agent that exits cleanly on SIGTERM. */
const LONG_RUNNING = `
let n = 0;
const timer = setInterval(() => { n += 1; console.log('tick ' + n); }, 100);
console.log('agent up: ' + process.env.NORIEN_AGENT);
console.error('warming up');
process.on('SIGTERM', () => { clearInterval(timer); process.exit(0); });
`;

const CRASHES = `
console.log('starting');
console.error('fatal: nothing works');
process.exit(17);
`;

async function waitFor(
  condition: () => boolean | Promise<boolean>,
  { timeoutMs = 10_000, intervalMs = 50 } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Timed out waiting for condition.');
}

beforeAll(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'norien-runtime-'));
  await mkdir(path.join(workspace, 'norien_agents'), { recursive: true });
  manager = new RuntimeManager({ workspace, healthIntervalMs: 500 });
});

afterAll(async () => {
  await manager.shutdown();
  await rm(workspace, { recursive: true, force: true });
});

describe('environment loader', () => {
  it('parses quoting, comments, and export prefixes', () => {
    const parsed = parseEnvFile(
      [
        '# a comment',
        'PLAIN=value',
        'export EXPORTED=exported',
        'QUOTED="with spaces"',
        "SINGLE='literal $NOT_EXPANDED'",
        'ESCAPED="line\\nbreak"',
        'TRAILING=value # inline comment',
        'EMPTY=',
        'not a pair',
      ].join('\n'),
    );

    expect(parsed).toEqual({
      PLAIN: 'value',
      EXPORTED: 'exported',
      QUOTED: 'with spaces',
      SINGLE: 'literal $NOT_EXPANDED',
      ESCAPED: 'line\nbreak',
      TRAILING: 'value',
      EMPTY: '',
    });
  });

  it('layers manifest defaults under .env under overrides', async () => {
    const directory = await createAgent('layered', {
      manifest: {
        environment: [
          { name: 'FROM_DEFAULT', required: false, secret: false, default: 'default-value' },
          { name: 'FROM_ENV', required: true, secret: false, default: 'should-be-overridden' },
          { name: 'FROM_OVERRIDE', required: false, secret: false, default: 'lowest' },
        ],
      },
      env: 'FROM_ENV=from-dotenv\n',
    });

    const loaded = await new EnvironmentLoader().load({
      slug: 'layered',
      version: '1.0.0',
      agentDirectory: directory,
      workspace,
      manifest: JSON.parse(await readFile(path.join(directory, 'agent.json'), 'utf8')),
      tools: [],
      grantedPermissions: [],
      overrides: { FROM_OVERRIDE: 'highest' },
    });

    expect(loaded.values.FROM_DEFAULT).toBe('default-value');
    expect(loaded.values.FROM_ENV).toBe('from-dotenv');
    expect(loaded.values.FROM_OVERRIDE).toBe('highest');
    expect(loaded.resolution.missing).toEqual([]);
  });

  it('reports missing required variables without exposing values', async () => {
    const directory = await createAgent('needs-secret', {
      manifest: {
        environment: [{ name: 'API_SECRET', required: true, secret: true }],
      },
      env: 'UNRELATED=present\n',
    });

    const loader = new EnvironmentLoader();
    const loaded = await loader.load({
      slug: 'needs-secret',
      version: '1.0.0',
      agentDirectory: directory,
      workspace,
      manifest: JSON.parse(await readFile(path.join(directory, 'agent.json'), 'utf8')),
      tools: [],
      grantedPermissions: [],
    });

    expect(loaded.resolution.missing).toEqual(['API_SECRET']);
    // Only names are ever surfaced.
    expect(JSON.stringify(loaded.resolution)).not.toContain('present');

    expect(() =>
      loader.validate(loaded.resolution, {
        slug: 'needs-secret',
        agentDirectory: directory,
        declared: [{ name: 'API_SECRET', required: true, secret: true }],
      }),
    ).toThrow(RuntimeError);
  });

  it('injects agent identity, permissions, and tool metadata', async () => {
    const directory = await createAgent('injected');

    const loaded = await new EnvironmentLoader().load({
      slug: 'injected',
      version: '2.3.4',
      agentDirectory: directory,
      workspace,
      manifest: JSON.parse(await readFile(path.join(directory, 'agent.json'), 'utf8')),
      grantedPermissions: ['network:fetch'],
      registry: 'http://registry.example',
      port: 5555,
      tools: [
        {
          id: '00000000-0000-0000-0000-000000000001',
          slug: 'search',
          name: 'Web Search',
          version: '2.1.0',
          category: 'search',
          description: 'Search the web.',
          authentication: { type: 'api_key' },
          input_schema: { type: 'object' },
          output_schema: { type: 'object' },
        },
      ],
    });

    expect(loaded.values.NORIEN_AGENT).toBe('injected');
    expect(loaded.values.NORIEN_AGENT_VERSION).toBe('2.3.4');
    expect(loaded.values.NORIEN_PERMISSIONS).toBe('network:fetch');
    expect(loaded.values.NORIEN_TOOL_SLUGS).toBe('search');
    expect(loaded.values.NORIEN_REGISTRY).toBe('http://registry.example');
    // PORT too, because that is what HTTP frameworks read.
    expect(loaded.values.PORT).toBe('5555');

    const tools = JSON.parse(loaded.values.NORIEN_TOOLS as string);
    expect(tools[0].slug).toBe('search');
    expect(tools[0].input_schema).toEqual({ type: 'object' });
  });
});

describe('permission validator', () => {
  it('denies by default and records grants to a reviewable file', async () => {
    const validator = new PermissionValidator(workspace);

    const before = await validator.resolve('perm-agent', ['network:fetch', 'fs:read']);
    expect(before.missing).toEqual(['network:fetch', 'fs:read']);

    expect(() => validator.assertSatisfied('perm-agent', before)).toThrow(RuntimeError);

    await validator.grant('perm-agent', ['network:fetch', 'fs:read']);

    const after = await validator.resolve('perm-agent', ['network:fetch', 'fs:read']);
    expect(after.missing).toEqual([]);
    expect(() => validator.assertSatisfied('perm-agent', after)).not.toThrow();

    const policy = JSON.parse(await readFile(path.join(workspace, 'norien.policy.json'), 'utf8'));
    expect(policy.agents['perm-agent'].granted).toEqual(['fs:read', 'network:fetch']);
  });

  it('honours namespace wildcards', async () => {
    const validator = new PermissionValidator(workspace);
    await validator.grant('wildcard-agent', ['network:*']);

    const resolution = await validator.resolve('wildcard-agent', ['network:fetch', 'network:listen']);
    expect(resolution.missing).toEqual([]);

    const unrelated = await validator.resolve('wildcard-agent', ['fs:write']);
    expect(unrelated.missing).toEqual(['fs:write']);
  });

  it('revokes grants', async () => {
    const validator = new PermissionValidator(workspace);
    await validator.grant('revoked-agent', ['a:b', 'c:d']);
    await validator.revoke('revoked-agent', ['a:b']);

    expect(await validator.grantedFor('revoked-agent')).toEqual(['c:d']);
  });
});

describe('execution planner', () => {
  const planner = new ExecutionPlanner();

  it('tokenizes quoted commands', () => {
    expect(tokenize('node "my script.js" --flag=1')).toEqual([
      'node',
      'my script.js',
      '--flag=1',
    ]);
  });

  it('prefers an explicit command over everything else', async () => {
    const directory = await createAgent('explicit');

    const plan = await planner.plan({
      manifest: JSON.parse(await readFile(path.join(directory, 'agent.json'), 'utf8')),
      agentDirectory: directory,
      explicitCommand: 'node other.js',
    });

    expect(plan.source).toBe('explicit-command');
    expect(plan.args).toEqual(['other.js']);
  });

  it('uses a package script through the detected package manager', async () => {
    const directory = await createAgent('scripted', {
      files: {
        'package.json': JSON.stringify({ name: 'scripted', scripts: { start: 'node index.js' } }),
        'package-lock.json': '{}',
      },
    });

    const plan = await planner.plan({
      manifest: JSON.parse(await readFile(path.join(directory, 'agent.json'), 'utf8')),
      agentDirectory: directory,
    });

    expect(plan.source).toBe('package-script');
    expect(plan.packageManager).toBe('npm');
    // Windows ships npm as a .cmd shim; the plan must name what actually runs.
    expect(plan.command).toMatch(/^npm(\.cmd|\.exe|\.bat)?$/);
    expect(plan.args).toEqual(['run', 'start']);
  });

  it('falls back to the manifest command with no package manager', async () => {
    const directory = await createAgent('manifest-only');

    const plan = await planner.plan({
      manifest: JSON.parse(await readFile(path.join(directory, 'agent.json'), 'utf8')),
      agentDirectory: directory,
    });

    expect(plan.source).toBe('manifest-command');
    expect(plan.command).toMatch(/node/);
    expect(plan.interpreterVersion).toMatch(/^v?\d+/);
  });

  it('falls back to interpreter plus entrypoint', async () => {
    const directory = await createAgent('bare', { manifest: { commands: {} } });

    const plan = await planner.plan({
      manifest: JSON.parse(await readFile(path.join(directory, 'agent.json'), 'utf8')),
      agentDirectory: directory,
    });

    expect(plan.source).toBe('interpreter-entrypoint');
    expect(plan.args).toEqual(['index.js']);
  });

  it('rejects a runtime with no interpreter available', async () => {
    const directory = await createAgent('alien', { manifest: { runtime: 'ruby' } });

    await expect(
      planner.plan({
        manifest: JSON.parse(await readFile(path.join(directory, 'agent.json'), 'utf8')),
        agentDirectory: directory,
      }),
    ).rejects.toMatchObject({ code: 'RUNTIME_UNAVAILABLE' });
  });
});

describe('health manager', () => {
  it('classifies health commands into probe kinds', () => {
    expect(HealthManager.describeProbe('/health')).toEqual({ kind: 'http', target: '/health' });
    expect(HealthManager.describeProbe('http://x/y').kind).toBe('http');
    expect(HealthManager.describeProbe('python health.py')).toEqual({
      kind: 'command',
      target: 'python health.py',
    });
    // No declared command means liveness is all the supervisor can honestly know.
    expect(HealthManager.describeProbe(undefined)).toEqual({ kind: 'process', target: null });
  });

  it('reports a dead process as unhealthy regardless of probe kind', async () => {
    const health = new HealthManager();

    const result = await health.probe({
      slug: 'gone',
      probe: { kind: 'process', target: null },
      port: null,
      cwd: workspace,
      env: {},
      isAlive: () => false,
    });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain('not running');
  });
});

describe('log manager', () => {
  it('reassembles lines split across chunks', () => {
    const first = LogManager.splitChunk('', 'complete\npartial');
    expect(first.lines).toEqual(['complete']);
    expect(first.carry).toBe('partial');

    const second = LogManager.splitChunk(first.carry, ' finished\n');
    expect(second.lines).toEqual(['partial finished']);
    expect(second.carry).toBe('');
  });

  it('bounds the in-memory buffer', () => {
    const logs = new LogManager({ bufferSize: 5 });

    for (let index = 0; index < 20; index += 1) {
      logs.append('bounded', { ts: index, stream: 'stdout', line: `line ${index}`, runId: 'r' });
    }

    const tail = logs.tail('bounded', 100);
    expect(tail).toHaveLength(5);
    expect(tail[0]?.line).toBe('line 15');
  });
});

describe('lifecycle', () => {
  afterEach(async () => {
    for (const running of manager.processes.list()) {
      await manager.stop(running.slug).catch(() => undefined);
    }
  });

  it('starts an agent and reports it running', async () => {
    await createAgent('runner', { files: { 'index.js': LONG_RUNNING } });

    const instance = await manager.start('runner');

    expect(instance.status).toBe('running');
    expect(instance.pid).toBeGreaterThan(0);
    expect(instance.plan?.runtime).toBe('node');

    await waitFor(() => manager.logs.tail('runner').some((r) => r.line.includes('tick')));

    const tail = manager.logs.tail('runner');
    expect(tail.some((record) => record.stream === 'stdout' && record.line.startsWith('tick'))).toBe(true);
    expect(tail.some((record) => record.stream === 'stderr')).toBe(true);
    // The launch trace is recorded, so a run is explainable after the fact.
    expect(tail.some((record) => record.stream === 'system' && record.line.includes('execution plan'))).toBe(true);
  });

  it('injects the agent identity into the process', async () => {
    await createAgent('identified', { files: { 'index.js': LONG_RUNNING } });
    await manager.start('identified');

    await waitFor(() =>
      manager.logs.tail('identified').some((r) => r.line.includes('agent up: identified')),
    );
  });

  it('refuses a second start while running', async () => {
    await createAgent('singleton', { files: { 'index.js': LONG_RUNNING } });
    await manager.start('singleton');

    await expect(manager.start('singleton')).rejects.toMatchObject({ code: 'ALREADY_RUNNING' });
  });

  it('stops gracefully and records the exit', async () => {
    await createAgent('stoppable', { files: { 'index.js': LONG_RUNNING } });
    await manager.start('stoppable');

    const stopped = await manager.stop('stoppable');

    expect(stopped.status).toBe('stopped');
    expect(stopped.exit?.expected).toBe(true);
    expect(manager.processes.isRunning('stoppable')).toBe(false);
  });

  it('restarts and increments the restart count', async () => {
    await createAgent('restartable', { files: { 'index.js': LONG_RUNNING } });
    await manager.start('restartable');

    const restarted = await manager.restart('restartable');

    expect(restarted.status).toBe('running');
    expect(restarted.restarts).toBeGreaterThan(0);

    await manager.stop('restartable');
  });

  it('reports a crash with its exit code and keeps the logs', async () => {
    await createAgent('crasher', {
      manifest: { entrypoint: 'index.js', commands: { start: 'node index.js' } },
      files: { 'index.js': CRASHES },
    });

    await manager.start('crasher');
    await waitFor(async () => (await manager.describe('crasher')).status === 'failed');

    const instance = await manager.describe('crasher');
    expect(instance.status).toBe('failed');
    expect(instance.health).toBe('failed');
    expect(instance.exit?.code).toBe(17);
    expect(instance.exit?.expected).toBe(false);
    expect(instance.exit?.reason).toContain('17');

    // The reason the agent died must survive the agent.
    const logs = manager.logs.tail('crasher', 100);
    expect(logs.some((record) => record.line.includes('fatal: nothing works'))).toBe(true);
  });

  it('persists durable logs to disk for later investigation', async () => {
    const history = await manager.logs.history(path.join(workspace, 'norien_agents', 'crasher'));

    expect(history.length).toBeGreaterThan(0);
    expect(history.some((record) => record.line.includes('fatal: nothing works'))).toBe(true);
  });

  it('refuses to start when a required permission is not granted', async () => {
    await createAgent('guarded', {
      manifest: { permissions: ['network:fetch'], commands: { start: 'node index.js' } },
      files: { 'index.js': LONG_RUNNING },
    });

    await expect(manager.start('guarded')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });

    const instance = await manager.start('guarded', { grant: ['network:fetch'] });
    expect(instance.status).toBe('running');

    await manager.stop('guarded');
  });

  it('refuses to start when a required variable is missing', async () => {
    await createAgent('unconfigured', {
      manifest: {
        environment: [{ name: 'REQUIRED_TOKEN', required: true, secret: true }],
        commands: { start: 'node index.js' },
      },
      files: { 'index.js': LONG_RUNNING },
    });

    await expect(manager.start('unconfigured')).rejects.toMatchObject({
      code: 'ENVIRONMENT_INCOMPLETE',
    });

    const instance = await manager.start('unconfigured', { env: { REQUIRED_TOKEN: 'supplied' } });
    expect(instance.status).toBe('running');

    await manager.stop('unconfigured');
  });

  it('reports an agent that is not installed', async () => {
    await expect(manager.start('never-installed')).rejects.toMatchObject({
      code: 'AGENT_NOT_INSTALLED',
    });
  });

  it('surfaces a missing binary as a start failure', async () => {
    await createAgent('missing-binary', { files: { 'index.js': LONG_RUNNING } });

    await expect(
      manager.start('missing-binary', { command: 'definitely-not-a-real-binary-xyz' }),
    ).rejects.toMatchObject({ code: 'START_FAILED' });
  });

  it('lists every installed agent, running or not', async () => {
    const instances = await manager.list();
    const slugs = instances.map((instance) => instance.slug);

    expect(slugs).toContain('runner');
    expect(slugs).toContain('crasher');
    expect(instances.every((instance) => instance.manifest.name)).toBe(true);
  });
});

describe('http api', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildRuntimeServer({ manager });
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes every documented endpoint', async () => {
    await createAgent('api-agent', { files: { 'index.js': LONG_RUNNING } });

    const list = await app.inject({ method: 'GET', url: '/runtime' });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.length).toBeGreaterThan(0);

    const started = await app.inject({
      method: 'POST',
      url: '/runtime/run',
      payload: { agent: 'api-agent' },
    });
    expect(started.statusCode).toBe(201);
    expect(started.json().status).toBe('running');

    const detail = await app.inject({ method: 'GET', url: '/runtime/api-agent' });
    expect(detail.json().pid).toBeGreaterThan(0);

    const status = await app.inject({ method: 'GET', url: '/runtime/status' });
    expect(status.json().summary.running).toBeGreaterThan(0);

    await waitFor(() => manager.logs.tail('api-agent').some((r) => r.line.includes('tick')));

    const logs = await app.inject({ method: 'GET', url: '/runtime/logs?agent=api-agent&limit=10' });
    expect(logs.json().data.length).toBeGreaterThan(0);

    const restarted = await app.inject({
      method: 'POST',
      url: '/runtime/restart',
      payload: { agent: 'api-agent' },
    });
    expect(restarted.json().status).toBe('running');

    const stopped = await app.inject({
      method: 'POST',
      url: '/runtime/stop',
      payload: { agent: 'api-agent' },
    });
    expect(stopped.json().status).toBe('stopped');
  });

  it('returns the shared error envelope', async () => {
    const response = await app.inject({ method: 'GET', url: '/runtime/not-installed' });
    const body = response.json();

    expect(response.statusCode).toBe(404);
    expect(body.error.code).toBe('AGENT_NOT_INSTALLED');
    expect(body.error.hint).toContain('norien install');
    expect(body.error.request_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects a malformed request body', async () => {
    const response = await app.inject({ method: 'POST', url: '/runtime/run', payload: {} });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });
});
