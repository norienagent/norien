import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
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

let app: FastifyInstance;
let registry: string;
let configDir: string;
let workDir: string;

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function cli(args: string[], options: { cwd?: string; input?: string } = {}): Promise<CliResult> {
  try {
    const child = run(process.execPath, [cliEntry, ...args], {
      cwd: options.cwd ?? workDir,
      env: { ...process.env, NORIEN_CONFIG_DIR: configDir, NORIEN_REGISTRY: registry, NO_COLOR: '1', FORCE_COLOR: '0' },
      timeout: 45_000,
    });
    if (options.input !== undefined) {
      child.child.stdin?.end(options.input);
    }
    const { stdout, stderr } = await child;
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
}

async function cliJson<T>(args: string[], options: { cwd?: string; input?: string } = {}): Promise<T> {
  const result = await cli([...args, '--json'], options);
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    throw new Error(`Expected JSON for "${args.join(' ')}".\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  }
}

/** Writes a runnable local node tool into a directory. */
async function writeLocalTool(dir: string, slug: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'tool.json'),
    JSON.stringify({
      name: slug,
      slug,
      version: '1.0.0',
      description: `A CLI test tool named ${slug}.`,
      category: 'utility',
      runtime: 'node',
      entrypoint: 'index.js',
      input_schema: { type: 'object', required: ['n'], properties: { n: { type: 'integer' } } },
      output_schema: { type: 'object', required: ['squared'], properties: { squared: { type: 'integer' } } },
    }),
  );
  await writeFile(
    path.join(dir, 'index.js'),
    `const c=[];process.stdin.on('data',x=>c.push(x));process.stdin.on('end',()=>{const p=JSON.parse(Buffer.concat(c).toString()||'{}');const n=(p.input||{}).n;process.stdout.write(JSON.stringify({output:{squared:n*n}}));});`,
  );
}

beforeAll(async () => {
  await applyMigrations();
  await seed();

  app = await buildApp();
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  registry = `http://127.0.0.1:${address.port}`;

  configDir = await mkdtemp(path.join(tmpdir(), 'norien-tool-cfg-'));
  workDir = await mkdtemp(path.join(tmpdir(), 'norien-tool-work-'));

  await cli(['login', '--handle', 'toolcli', '--api-key', 'k']);
});

afterAll(async () => {
  await app?.close();
  await closeDb();
  await rm(configDir, { recursive: true, force: true });
  await rm(workDir, { recursive: true, force: true });
});

describe('tool search and info', () => {
  it('searches the marketplace', async () => {
    const result = await cliJson<{ data: { item?: unknown; slug: string }[] }>(['tool', 'search', 'wallet']);
    expect(result.data.length).toBeGreaterThan(0);
  });

  it('shows a tool and generates docs', async () => {
    const info = await cli(['tool', 'info', 'web-search']);
    expect(info.code).toBe(0);
    expect(info.stdout).toContain('Input schema');

    const docs = await cli(['tool', 'info', 'web-search', '--docs']);
    expect(docs.stdout).toContain('## Installation');
    expect(docs.stdout).toContain('client.tools.install');
  });

  it('exits 4 for an unknown tool', async () => {
    const result = await cli(['tool', 'info', 'no-such-tool']);
    expect(result.code).toBe(4);
  });
});

describe('tool publish', () => {
  it('publishes a tool from a local tool.json', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'norien-tool-pub-'));
    await writeLocalTool(dir, 'cli-square');

    const dry = await cliJson<{ published: boolean; dry_run: boolean }>(['tool', 'publish', '--dry-run'], { cwd: dir });
    expect(dry.published).toBe(false);

    const published = await cliJson<{ ok: boolean; tool: { slug: string }; url: string }>(
      ['tool', 'publish', '--yes'],
      { cwd: dir },
    );
    expect(published.ok).toBe(true);
    expect(published.tool.slug).toBe('cli-square');

    await rm(dir, { recursive: true, force: true });
  });

  it('rejects an invalid manifest before uploading', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'norien-tool-bad-'));
    await writeFile(path.join(dir, 'tool.json'), JSON.stringify({ name: 'Broken' }));

    const result = await cli(['tool', 'publish', '--yes'], { cwd: dir });
    expect(result.code).toBe(5);

    await rm(dir, { recursive: true, force: true });
  });
});

describe('tool install, list, run', () => {
  it('installs a local node tool and runs it through the executor', async () => {
    const toolDir = path.join(workDir, 'src', 'squarer');
    await writeLocalTool(toolDir, 'squarer');

    const installed = await cliJson<{ ok: boolean; slug: string; executable: boolean }>([
      'tool',
      'install',
      toolDir,
    ]);
    expect(installed.ok).toBe(true);
    expect(installed.executable).toBe(true);

    const list = await cliJson<{ count: number; tools: { slug: string }[] }>(['tool', 'list']);
    expect(list.tools.map((t) => t.slug)).toContain('squarer');

    const result = await cliJson<{ ok: boolean; output: { squared: number } }>(
      ['tool', 'run', 'squarer', '--input', '{"n":9}'],
    );
    expect(result.output.squared).toBe(81);
  });

  it('validates input before running', async () => {
    const result = await cli(['tool', 'run', 'squarer', '--input', '{}']);
    expect(result.code).toBe(5);
    expect(result.stdout + result.stderr).toContain('input_schema');
  });

  it('reads input from stdin when --input is omitted', async () => {
    const result = await cliJson<{ output: { squared: number } }>(
      ['tool', 'run', 'squarer'],
      { input: '{"n":4}' },
    );
    expect(result.output.squared).toBe(16);
  });

  it('installs an http tool from the registry as runnable', async () => {
    // ping-... published via the registry as an http tool is runnable from a
    // registry install because http tools carry no local code.
    const dir = await mkdtemp(path.join(tmpdir(), 'norien-http-tool-'));
    await writeFile(
      path.join(dir, 'tool.json'),
      JSON.stringify({
        name: 'CLI Echo HTTP',
        slug: 'cli-echo-http',
        version: '1.0.0',
        description: 'An http echo tool for CLI tests.',
        category: 'http',
        runtime: 'http',
        entrypoint: 'https://example.com/echo',
        input_schema: { type: 'object' },
        output_schema: { type: 'object' },
      }),
    );
    await cli(['tool', 'publish', '--yes'], { cwd: dir });

    const installed = await cliJson<{ executable: boolean; runtime: string }>([
      'tool',
      'install',
      'cli-echo-http',
    ]);
    expect(installed.runtime).toBe('http');
    expect(installed.executable).toBe(true);

    await rm(dir, { recursive: true, force: true });
  });

  it('removes an installed tool', async () => {
    const result = await cliJson<{ ok: boolean; local: boolean }>(['tool', 'remove', 'squarer']);
    expect(result.local).toBe(true);

    const list = await cliJson<{ tools: { slug: string }[] }>(['tool', 'list']);
    expect(list.tools.map((t) => t.slug)).not.toContain('squarer');
  });
});

describe('help', () => {
  it('documents every tool subcommand', async () => {
    const result = await cli(['tool', '--help']);
    for (const command of ['search', 'info', 'install', 'publish', 'update', 'remove', 'list', 'run']) {
      expect(result.stdout, `missing ${command}`).toContain(command);
    }
  });
});
