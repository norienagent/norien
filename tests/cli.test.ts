import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { closeDb } from '../src/db/client.js';
import { applyMigrations } from '../src/db/migrate.js';
import { seed } from '../src/db/seed.js';

const run = promisify(execFile);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliEntry = path.join(repoRoot, 'packages', 'cli', 'dist', 'index.js');
const pythonExample = path.join(repoRoot, 'examples', 'python', 'quickstart.py');
const pythonSdkRoot = path.join(repoRoot, 'sdk-python');

let app: FastifyInstance;
let registry: string;
let configDir: string;
let workDir: string;

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs the built CLI as a real subprocess against the live registry. Exercising
 * the shipped binary -- not an imported function -- is what makes these tests
 * cover argument parsing, exit codes, and stdout/stderr routing.
 */
async function cli(args: string[], options: { cwd?: string } = {}): Promise<CliResult> {
  try {
    const { stdout, stderr } = await run(process.execPath, [cliEntry, ...args], {
      cwd: options.cwd ?? workDir,
      env: {
        ...process.env,
        NORIEN_CONFIG_DIR: configDir,
        NORIEN_REGISTRY: registry,
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      },
      timeout: 45_000,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
}

/** Parses a `--json` invocation, failing loudly if stdout was not clean JSON. */
async function cliJson<T>(args: string[], options: { cwd?: string } = {}): Promise<T> {
  const result = await cli([...args, '--json'], options);

  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    throw new Error(
      `Expected JSON on stdout for "${args.join(' ')}".\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  }
}

beforeAll(async () => {
  await applyMigrations();
  await seed();

  app = await buildApp();
  await app.listen({ host: '127.0.0.1', port: 0 });

  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('Server did not bind a port.');
  registry = `http://127.0.0.1:${address.port}`;

  configDir = await mkdtemp(path.join(tmpdir(), 'norien-cli-config-'));
  workDir = await mkdtemp(path.join(tmpdir(), 'norien-cli-work-'));
});

afterAll(async () => {
  await app?.close();
  await closeDb();
  await rm(configDir, { recursive: true, force: true });
  await rm(workDir, { recursive: true, force: true });
});

describe('authentication', () => {
  it('reports not-logged-in before login', async () => {
    const result = await cliJson<{ authenticated: boolean }>(['whoami']);
    expect(result.authenticated).toBe(false);
  });

  it('stores credentials and verifies the registry', async () => {
    const result = await cliJson<{ ok: boolean; handle: string; api_key_stored: boolean }>([
      'login',
      '--handle',
      'acme',
      '--api-key',
      'nrn_test_key',
    ]);

    expect(result.ok).toBe(true);
    expect(result.handle).toBe('acme');
    expect(result.api_key_stored).toBe(true);

    const stored = JSON.parse(await readFile(path.join(configDir, 'config.json'), 'utf8'));
    expect(stored.profiles.default.handle).toBe('acme');
  });

  it('resolves the identity after login', async () => {
    const result = await cliJson<{ handle: string; registry_reachable: boolean }>(['whoami']);

    expect(result.handle).toBe('acme');
    expect(result.registry_reachable).toBe(true);
  });

  it('fails a login against an unreachable registry without storing anything', async () => {
    const result = await cli([
      'login',
      '--handle',
      'ghost',
      '--registry',
      'http://127.0.0.1:1',
    ]);

    expect(result.code).not.toBe(0);

    const stored = JSON.parse(await readFile(path.join(configDir, 'config.json'), 'utf8'));
    expect(stored.profiles.default.handle).toBe('acme');
  });
});

describe('search', () => {
  it('returns ranked results across both catalogues', async () => {
    // Phase 7 flattened the row shape: registry hits and market hits share one
    // `SearchRow`, so nothing is nested under `item` any more.
    const result = await cliJson<{ data: { type: string; name: string }[] }>(['search', 'trading']);

    const names = result.data.map((hit) => hit.name);
    expect(names).toContain('trading-agent');
    expect(result.data.some((hit) => hit.type === 'tool')).toBe(true);
  });

  it('restricts to one catalogue', async () => {
    const result = await cliJson<{ data: { type: string }[] }>(['search', 'trading', '--type', 'agent']);

    expect(result.data.every((hit) => hit.type === 'agent')).toBe(true);
  });

  it('omits the downloads column while the registry serves no counts', async () => {
    const result = await cli(['search', 'trading']);

    expect(result.stdout).toContain('trading-agent');
    // Nothing fabricated: no column, rather than a permanently blank one.
    expect(result.stdout.toLowerCase()).not.toContain('downloads');
  });

  it('reports no matches without failing', async () => {
    const result = await cli(['search', 'zzzznotathing']);

    expect(result.code).toBe(0);
    expect(result.stderr).toContain('No results');
  });
});

describe('info', () => {
  it('shows manifest, tools, permissions, runtime, and environment', async () => {
    const result = await cli(['info', 'trading-agent']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('trading-agent');
    expect(result.stdout).toContain('python');
    expect(result.stdout).toContain('exchange');
    expect(result.stdout).toContain('EXCHANGE_API_KEY');
    expect(result.stdout).toContain('Manifest');
    expect(result.stdout).toContain('norien install trading-agent');
  });

  it('exits 4 for an unknown agent', async () => {
    const result = await cli(['info', 'no-such-agent']);

    expect(result.code).toBe(4);
  });
});

describe('install', () => {
  it('writes the agent folder and lockfile', async () => {
    const result = await cliJson<{
      ok: boolean;
      version: string;
      files: string[];
      runtime: { name: string };
    }>(['install', 'research-agent']);

    expect(result.ok).toBe(true);
    expect(result.runtime.name).toBe('node');
    expect(result.files).toEqual(
      expect.arrayContaining(['agent.json', 'README.md', '.env.example', 'norien.metadata.json']),
    );

    const dir = path.join(workDir, 'norien_agents', 'research-agent');
    expect((await readdir(dir)).sort()).toEqual(
      ['.env.example', 'README.md', 'agent.json', 'norien.metadata.json'].sort(),
    );

    const lockfile = JSON.parse(await readFile(path.join(workDir, 'norien.lock.json'), 'utf8'));
    expect(lockfile.agents['research-agent'].version).toBe(result.version);
  });

  it('generates .env.example with required variables blank and optional ones commented', async () => {
    const env = await readFile(
      path.join(workDir, 'norien_agents', 'research-agent', '.env.example'),
      'utf8',
    );

    expect(env).toContain('SEARCH_API_KEY=');
    expect(env).toContain('# MAX_RESULTS=10');
    expect(env).toContain('secret');
  });

  it('writes a manifest that matches the published one', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(workDir, 'norien_agents', 'research-agent', 'agent.json'), 'utf8'),
    );

    expect(manifest.name).toBe('Research Agent');
    expect(manifest.runtime).toBe('node');
    expect(manifest.commands.start).toBe('node dist/index.js');
  });

  it('refuses to reinstall without --force', async () => {
    const result = await cli(['install', 'research-agent']);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('already installed');
  });

  it('honours a pinned version', async () => {
    const result = await cliJson<{ version: string }>([
      'install',
      'research-agent@1.0.0',
      '--force',
    ]);

    expect(result.version).toBe('1.0.0');
  });

  it('exits 4 for an unknown agent', async () => {
    const result = await cli(['install', 'no-such-agent']);

    expect(result.code).toBe(4);
  });
});

describe('list and update', () => {
  it('lists what is installed locally', async () => {
    const result = await cliJson<{ count: number; agents: { slug: string; version: string }[] }>([
      'list',
    ]);

    expect(result.count).toBeGreaterThan(0);
    expect(result.agents.map((entry) => entry.slug)).toContain('research-agent');
  });

  it('detects an outdated agent and reports the changelog', async () => {
    const result = await cli(['update', '--check']);

    expect(result.stdout).toContain('research-agent');
    expect(result.stdout).toContain('1.0.0');
    expect(result.stdout).toContain('1.1.0');
    // The changelog is the intervening version's description.
    expect(result.stdout).toContain('source ranking');
  });

  it('applies the update and then reports everything current', async () => {
    const applied = await cliJson<{ updated: { slug: string; to: string }[] }>(['update']);
    expect(applied.updated.map((entry) => entry.slug)).toContain('research-agent');

    const again = await cli(['update']);
    expect(again.stdout + again.stderr).toContain('up to date');
  });
});

describe('publish', () => {
  const manifest = {
    name: 'CLI Test Agent',
    version: '1.0.0',
    description: 'Published by the CLI integration test suite.',
    runtime: 'node',
    entrypoint: 'dist/index.js',
    tools: ['web-search'],
    permissions: ['network:fetch'],
    environment: [{ name: 'CLI_TEST_KEY', required: true, secret: true }],
    commands: { start: 'node dist/index.js', health: '/health' },
  };

  let projectDir: string;

  beforeAll(async () => {
    projectDir = await mkdtemp(path.join(tmpdir(), 'norien-cli-project-'));
    await writeFile(path.join(projectDir, 'agent.json'), JSON.stringify(manifest, null, 2));
    await writeFile(path.join(projectDir, 'README.md'), '# CLI Test Agent\n\nFrom the test suite.\n');
  });

  afterAll(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it('validates without uploading on --dry-run', async () => {
    const result = await cliJson<{ published: boolean; dry_run: boolean }>(['publish', '--dry-run'], {
      cwd: projectDir,
    });

    expect(result.published).toBe(false);
    expect(result.dry_run).toBe(true);

    const missing = await cli(['info', 'cli-test-agent']);
    expect(missing.code).toBe(4);
  });

  it('does not block on environment variables the publishing machine lacks', async () => {
    // The author declares what the agent needs; they need not hold the secrets.
    const result = await cli(['publish', '--dry-run'], { cwd: projectDir });

    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain('CLI_TEST_KEY');
  });

  it('publishes and returns the URL and install command', async () => {
    const result = await cliJson<{
      ok: boolean;
      url: string;
      install_command: string;
      agent: { slug: string; version: string; author: string };
    }>(['publish', '--yes', '--tag', 'testing'], { cwd: projectDir });

    expect(result.ok).toBe(true);
    expect(result.agent.slug).toBe('cli-test-agent');
    expect(result.agent.author).toBe('acme');
    expect(result.url).toBe(`${registry}/agents/cli-test-agent`);
    expect(result.install_command).toBe('norien install cli-test-agent@1.0.0');
  });

  it('rejects republishing the same version', async () => {
    const result = await cli(['publish', '--yes'], { cwd: projectDir });

    expect(result.code).toBe(5);
    expect(result.stderr + result.stdout).toContain('already been published');
  });

  it('rejects a manifest whose tools do not exist', async () => {
    const broken = await mkdtemp(path.join(tmpdir(), 'norien-cli-broken-'));
    await writeFile(
      path.join(broken, 'agent.json'),
      JSON.stringify({ ...manifest, name: 'Ghost CLI Agent', tools: ['no-such-tool'] }, null, 2),
    );

    const result = await cli(['publish', '--yes'], { cwd: broken });

    expect(result.code).toBe(5);
    expect(result.stdout + result.stderr).toContain('no-such-tool');

    await rm(broken, { recursive: true, force: true });
  });

  it('fails clearly when there is no agent.json', async () => {
    const empty = await mkdtemp(path.join(tmpdir(), 'norien-cli-empty-'));
    const result = await cli(['publish'], { cwd: empty });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('agent.json');

    await rm(empty, { recursive: true, force: true });
  });
});

describe('uninstall', () => {
  it('removes the folder, the lockfile entry, and the registry record', async () => {
    await cli(['install', 'search-agent', '--force']);

    const result = await cliJson<{ ok: boolean; remote_removed: boolean }>([
      'uninstall',
      'search-agent',
      '--yes',
    ]);

    expect(result.ok).toBe(true);
    expect(result.remote_removed).toBe(true);

    const entries = await readdir(path.join(workDir, 'norien_agents'));
    expect(entries).not.toContain('search-agent');

    const lockfile = JSON.parse(await readFile(path.join(workDir, 'norien.lock.json'), 'utf8'));
    expect(lockfile.agents['search-agent']).toBeUndefined();
  });

  it('exits 4 when the agent is not installed', async () => {
    const result = await cli(['uninstall', 'search-agent', '--yes']);

    expect(result.code).toBe(4);
  });
});

describe('doctor', () => {
  it('passes in a healthy workspace', async () => {
    const result = await cliJson<{ ok: boolean; checks: { name: string; status: string }[] }>([
      'doctor',
    ]);

    expect(result.ok).toBe(true);

    const byName = new Map(result.checks.map((check) => [check.name, check.status]));
    expect(byName.get('node')).toBe('pass');
    expect(byName.get('registry')).toBe('pass');
    expect(byName.get('registry db')).toBe('pass');
    expect(byName.get('config')).toBe('pass');
    expect(byName.get('installed')).toBe('pass');
  });

  it('fails when a manifest declares an unpublished tool', async () => {
    const broken = await mkdtemp(path.join(tmpdir(), 'norien-doctor-'));
    await writeFile(
      path.join(broken, 'agent.json'),
      JSON.stringify({
        name: 'Doctor Broken Agent',
        version: '1.0.0',
        description: 'Declares a tool that does not exist.',
        runtime: 'node',
        entrypoint: 'index.js',
        tools: ['definitely-not-a-tool'],
      }),
    );

    const result = await cliJson<{ ok: boolean; checks: { name: string; status: string }[] }>(
      ['doctor'],
      { cwd: broken },
    );

    expect(result.ok).toBe(false);
    const dependencies = result.checks.find((check) => check.name === 'dependencies');
    expect(dependencies?.status).toBe('fail');

    await rm(broken, { recursive: true, force: true });
  });

  it('treats a locally unset environment variable as a warning, not a failure', async () => {
    const project = await mkdtemp(path.join(tmpdir(), 'norien-doctor-env-'));
    await writeFile(
      path.join(project, 'agent.json'),
      JSON.stringify({
        name: 'Doctor Env Agent',
        version: '9.9.9',
        description: 'Requires a secret the local machine does not have.',
        runtime: 'node',
        entrypoint: 'index.js',
        tools: [],
        environment: [{ name: 'SOME_UNSET_SECRET', required: true, secret: true }],
      }),
    );

    const result = await cliJson<{ ok: boolean; checks: { name: string; status: string }[] }>(
      ['doctor'],
      { cwd: project },
    );

    const environment = result.checks.find((check) => check.name === 'environment');
    expect(environment?.status).toBe('warn');
    expect(result.ok).toBe(true);

    await rm(project, { recursive: true, force: true });
  });

  it('reports the registry as unreachable without crashing', async () => {
    const result = await cliJson<{ ok: boolean; checks: { name: string; status: string }[] }>([
      'doctor',
      '--registry',
      'http://127.0.0.1:1',
    ]);

    expect(result.ok).toBe(false);
    const registryCheck = result.checks.find((check) => check.name === 'registry');
    expect(registryCheck?.status).toBe('fail');
  });
});

describe('global behaviour', () => {
  it('prints a version', async () => {
    const result = await cli(['--version']);

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('documents every advertised command in help', async () => {
    const result = await cli(['--help']);

    for (const command of [
      'login',
      'logout',
      'whoami',
      'search',
      'info',
      'install',
      'publish',
      'update',
      'uninstall',
      'list',
      'doctor',
    ]) {
      expect(result.stdout, `missing ${command}`).toContain(command);
    }
  });

  it('exits non-zero on an unknown command', async () => {
    const result = await cli(['definitely-not-a-command']);

    expect(result.code).not.toBe(0);
  });

  it('keeps stdout pure JSON so output can be piped', async () => {
    const result = await cli(['list', '--json']);

    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });

  it('requires authentication for writes', async () => {
    const isolated = await mkdtemp(path.join(tmpdir(), 'norien-anon-'));

    const result = await run(process.execPath, [cliEntry, 'install', 'research-agent', '--json'], {
      cwd: workDir,
      // A config dir with no profile, and no identity in the environment.
      env: { ...process.env, NORIEN_CONFIG_DIR: isolated, NORIEN_REGISTRY: registry, NO_COLOR: '1' },
    }).catch((error: { code?: number; stdout?: string }) => error);

    expect((result as { code?: number }).code).toBe(3);

    await rm(isolated, { recursive: true, force: true });
  });
});

describe('python sdk', () => {
  it('drives the full workflow against the live registry', async () => {
    const python = await resolvePython();
    if (!python) {
      // Recorded rather than silently passing on a machine without Python.
      console.warn('python not found on PATH; skipping Python SDK test');
      return;
    }

    const { stdout } = await run(python, [pythonExample], {
      cwd: repoRoot,
      env: {
        ...process.env,
        NORIEN_REGISTRY: registry,
        NORIEN_ACTOR: 'python-sdk-test',
        PYTHONPATH: pythonSdkRoot,
      },
      timeout: 60_000,
    });

    expect(stdout).toContain('registry ok');
    expect(stdout).toContain('trading-agent');
    expect(stdout).toContain('installed research-agent@');
    expect(stdout).toContain('python agents in the registry:');
  });
});

async function resolvePython(): Promise<string | null> {
  for (const candidate of ['python3', 'python']) {
    try {
      await run(candidate, ['--version'], { timeout: 5000 });
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}
