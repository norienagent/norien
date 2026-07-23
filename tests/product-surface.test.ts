import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { NorienClient } from '@norien-live/sdk';

import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { closeDb } from '../src/db/client.js';
import { applyMigrations } from '../src/db/migrate.js';

const run = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliEntry = path.join(repoRoot, 'packages', 'cli', 'dist', 'index.js');

/**
 * Product-surface tests: the SDK market-data resources and the CLI commands
 * built on top of them.
 *
 * These run against the live registry, which in turn calls the real providers —
 * the point is to prove the whole chain works, not to re-test the aggregator in
 * isolation (that is `external-live.test.ts`).
 */

let app: FastifyInstance;
let registry: string;
let client: NorienClient;
let configDir: string;
let workDir: string;

const NATIVE_TOKEN = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';
const WALLET = '0xebe0e06e87038deaf43aec5a7baef04a0ca3c95b';

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function cli(args: string[]): Promise<CliResult> {
  try {
    const { stdout, stderr } = await run(process.execPath, [cliEntry, ...args], {
      cwd: workDir,
      env: { ...process.env, NORIEN_CONFIG_DIR: configDir, NORIEN_REGISTRY: registry, NO_COLOR: '1' },
      timeout: 60_000,
      maxBuffer: 10_000_000,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
}

async function cliJson<T>(args: string[]): Promise<T> {
  const result = await cli([...args, '--json']);
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    throw new Error(`Expected JSON for "${args.join(' ')}".\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  }
}

beforeAll(async () => {
  await applyMigrations();
  app = await buildApp();
  await app.listen({ host: '127.0.0.1', port: 0 });

  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  registry = `http://127.0.0.1:${address.port}`;

  client = new NorienClient({ baseUrl: registry });
  configDir = await mkdtemp(path.join(tmpdir(), 'norien-p7-cfg-'));
  workDir = await mkdtemp(path.join(tmpdir(), 'norien-p7-work-'));
});

afterAll(async () => {
  await app?.close();
  await closeDb();
  await rm(configDir, { recursive: true, force: true });
  await rm(workDir, { recursive: true, force: true });
});

describe('SDK market-data resources', () => {
  it('exposes every documented namespace', () => {
    expect(client.tokens).toBeDefined();
    expect(client.projects).toBeDefined();
    expect(client.contracts).toBeDefined();
    expect(client.wallets).toBeDefined();
    expect(client.market).toBeDefined();
    expect(client.chain).toBeDefined();
  });

  it('lists tokens in the normalized shape', async () => {
    const result = await client.tokens.list({ limit: 3 });

    expect(result.data.items.length).toBeGreaterThan(0);
    const token = result.data.items[0];

    for (const field of ['name', 'symbol', 'logo', 'price', 'marketCap', 'liquidity', 'holders', 'volume24h', 'change24h', 'chain']) {
      expect(token, `missing ${field}`).toHaveProperty(field);
    }
    // Provenance travels with the payload.
    expect(Array.isArray(result.sources)).toBe(true);
    expect(typeof result.degraded).toBe('boolean');
  });

  it('returns trending tokens', async () => {
    const result = await client.tokens.trending({ limit: 3 });
    expect(result.data.items.length).toBeGreaterThan(0);
  });

  it('returns one token merged from several providers', async () => {
    const result = await client.tokens.get(NATIVE_TOKEN);

    expect(result.data.symbol).toBe('USDG');
    expect(result.data.price).toBeGreaterThan(0);
    expect(result.data.chain.id).toBe(env.ROBINHOOD_CHAIN_ID);
  });

  it('returns projects and a project with repository health', async () => {
    const list = await client.projects.list({ limit: 3 });
    expect(list.data.items.length).toBe(3);

    const detail = await client.projects.get('aave');
    expect(detail.data.name).toBe('Aave');
    expect(detail.data.chainTvl.length).toBeGreaterThan(0);
  });

  it('returns a contract with ABI', async () => {
    const result = await client.contracts.get(NATIVE_TOKEN);

    expect(result.data.isContract).toBe(true);
    expect(result.data.verified).toBe(true);
    expect(Array.isArray(result.data.abi)).toBe(true);
  });

  it('returns a wallet with history', async () => {
    const result = await client.wallets.get(WALLET, { limit: 3 });

    expect(result.data.address.toLowerCase()).toBe(WALLET);
    expect(typeof result.data.balanceFormatted).toBe('string');
  });

  it('searches tokens and projects globally', async () => {
    const result = await client.market.all('usdg', { limit: 5 });
    expect(result.data.items.length).toBeGreaterThan(0);
  });

  it('reports chain status and provider health', async () => {
    const status = await client.chain.status();
    expect(status.data.blockNumber).toBeGreaterThan(0);

    const providers = await client.chain.providers();
    expect(providers.data.length).toBe(6);
    expect(providers.data.every((p) => p.configured)).toBe(true);
  });
});

describe('CLI market-data commands', () => {
  it('norien markets returns normalized rows', async () => {
    const result = await cliJson<{ data: { items: { symbol: string }[] } }>(['markets', '--limit', '3']);
    expect(result.data.items.length).toBeGreaterThan(0);
    expect(typeof result.data.items[0]?.symbol).toBe('string');
  });

  it('norien markets renders a human table with the expected columns', async () => {
    const result = await cli(['markets', '--limit', '3']);

    expect(result.code).toBe(0);
    for (const header of ['SYMBOL', 'PRICE', 'VOLUME', 'LIQUIDITY', 'MCAP', 'HOLDERS']) {
      expect(result.stdout, `missing ${header}`).toContain(header);
    }
  });

  it('norien trending works', async () => {
    const result = await cliJson<{ data: { items: unknown[] } }>(['trending', '--limit', '3']);
    expect(result.data.items.length).toBeGreaterThan(0);
  });

  it('norien token shows a detail view', async () => {
    const result = await cli(['token', NATIVE_TOKEN]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('USDG');
    expect(result.stdout).toContain('holders');
    expect(result.stdout).toContain('liquidity');
  });

  it('norien wallet shows balance and history', async () => {
    const result = await cli(['wallet', WALLET, '--limit', '2']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('balance');
    expect(result.stdout).toContain('Transactions');
  });

  it('norien contract shows verification and ABI summary', async () => {
    const result = await cli(['contract', NATIVE_TOKEN]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('verified');
    expect(result.stdout).toContain('abi entries');
  });

  it('norien contract --abi prints the full ABI', async () => {
    const result = await cli(['contract', NATIVE_TOKEN, '--abi']);
    expect(result.stdout).toContain('"type"');
  });

  it('norien project shows TVL and GitHub statistics', async () => {
    const result = await cli(['project', 'aave']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('TVL by chain');
    expect(result.stdout).toContain('Repository');
  });

  it('norien search spans the registry and market data', async () => {
    const result = await cliJson<{ data: { type: string }[] }>(['search', 'usdg', '--limit', '6']);
    expect(result.data.some((row) => row.type === 'token')).toBe(true);
  });

  it('norien search --type narrows to one catalogue', async () => {
    const tokens = await cliJson<{ data: { type: string }[] }>([
      'search', 'usdg', '--type', 'token', '--limit', '4',
    ]);
    expect(tokens.data.every((row) => row.type === 'token')).toBe(true);
  });

  it('exits 4 for a token that does not exist', async () => {
    const result = await cli(['token', '0x0000000000000000000000000000000000000001']);
    expect(result.code).toBe(4);
  });

  it('documents every product command in help', async () => {
    const result = await cli(['--help']);

    for (const command of ['markets', 'trending', 'token', 'wallet', 'contract', 'project', 'search']) {
      expect(result.stdout, `missing ${command}`).toContain(command);
    }
  });
});
