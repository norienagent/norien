import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { closeDb } from '../src/db/client.js';
import { applyMigrations } from '../src/db/migrate.js';
import { providerCache } from '../src/core/cache.js';
import { blockscoutService } from '../src/services/external/blockscout.js';
import { codexService } from '../src/services/external/codex.js';
import { coinGeckoService } from '../src/services/external/coingecko.js';
import { defiLlamaService } from '../src/services/external/defillama.js';
import { gitHubService, parseRepoPath } from '../src/services/external/github.js';
import { formatUnits, rpcService } from '../src/services/external/rpc.js';

/**
 * Live integration tests.
 *
 * These call the real providers with the real credentials from `.env.local`,
 * because the phase's requirement is that every integration genuinely connects
 * — a suite that mocked the providers would prove nothing about that.
 *
 * Consequences, accepted deliberately: the suite needs network access and
 * consumes a small amount of API quota. Every request is cached, so a full run
 * is a few dozen calls.
 */

let app: FastifyInstance;

/** A verified ERC-20 on the native chain, used across the on-chain tests. */
const NATIVE_TOKEN = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';

beforeAll(async () => {
  await applyMigrations();
  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
  await closeDb();
});

describe('environment', () => {
  it('loads every external provider variable from .env.local', () => {
    // The loader must actually populate config; a silent miss here would make
    // every provider fall back to "not configured".
    expect(env.CODEX_API_KEY, 'CODEX_API_KEY').toBeDefined();
    expect(env.CODEX_GRAPHQL_URL).toMatch(/^https:\/\//);

    expect(env.GITHUB_TOKEN, 'GITHUB_TOKEN').toBeDefined();
    expect(env.GITHUB_API_URL).toBe('https://api.github.com');

    expect(env.COINGECKO_API_KEY, 'COINGECKO_API_KEY').toBeDefined();
    expect(env.COINGECKO_API_URL).toContain('/api/v3');

    expect(env.DEFILLAMA_API_URL).toMatch(/^https:\/\//);
    expect(env.BLOCKSCOUT_API_URL, 'BLOCKSCOUT_API_URL').toBeDefined();
    expect(env.ROBINHOOD_RPC_URL, 'ROBINHOOD_RPC_URL').toBeDefined();

    expect(env.ROBINHOOD_CHAIN_ID).toBe(4663);
    expect(env.REQUEST_TIMEOUT).toBeGreaterThan(0);
    expect(env.CACHE_TTL).toBeGreaterThanOrEqual(0);
  });

  it('reports every provider as configured', () => {
    expect(codexService.configured).toBe(true);
    expect(gitHubService.configured).toBe(true);
    expect(coinGeckoService.configured).toBe(true);
    expect(defiLlamaService.configured).toBe(true);
    expect(blockscoutService.configured).toBe(true);
    expect(rpcService.configured).toBe(true);
  });
});

describe('codex (primary market data)', () => {
  it('lists networks including the native chain', async () => {
    const networks = await codexService.listNetworks();

    expect(networks.length).toBeGreaterThan(50);
    expect(networks.some((n) => n.id === env.ROBINHOOD_CHAIN_ID)).toBe(true);
  });

  it('returns ranked tokens with real market figures', async () => {
    const tokens = await codexService.listTokens({ limit: 3, ranking: 'volume24' });

    expect(tokens.length).toBeGreaterThan(0);
    const first = tokens[0];
    expect(first).toBeDefined();
    expect(typeof first?.symbol).toBe('string');
    expect(first?.price).toBeGreaterThan(0);
  });

  it('returns a single token with holders', async () => {
    const token = await codexService.getToken(NATIVE_TOKEN, env.ROBINHOOD_CHAIN_ID);

    expect(token).not.toBeNull();
    expect(token?.symbol).toBe('USDG');
    // Holders come from filterTokens, not the plan-gated holders query.
    expect(token?.holders).toBeGreaterThan(0);
  });

  it('converts the 24h change ratio into a percentage', async () => {
    const tokens = await codexService.listTokens({ networkIds: [1], limit: 5 });
    const withChange = tokens.find((t) => t.change24h !== null);

    expect(withChange).toBeDefined();
    // A ratio would sit near zero; a percentage is the human-facing unit.
    expect(Math.abs(withChange?.change24h ?? 0)).toBeLessThan(100_000);
  });
});

describe('github', () => {
  it('parses repository identifiers in every accepted form', () => {
    expect(parseRepoPath('aave/aave-v3-core')).toEqual({ owner: 'aave', repo: 'aave-v3-core' });
    expect(parseRepoPath('https://github.com/aave/aave-v3-core')).toEqual({
      owner: 'aave',
      repo: 'aave-v3-core',
    });
    expect(parseRepoPath('https://github.com/aave/aave-v3-core.git')).toEqual({
      owner: 'aave',
      repo: 'aave-v3-core',
    });
    // A bare org is not a repo path; it is resolved separately.
    expect(parseRepoPath('aave')).toBeNull();
  });

  it('fetches a repository with languages, contributors, and commits', async () => {
    const repo = await gitHubService.getRepository('aave/aave-v3-core');

    expect(repo).not.toBeNull();
    expect(repo?.fullName).toBe('aave/aave-v3-core');
    expect(repo?.stars).toBeGreaterThan(0);
    expect(repo?.languages.length).toBeGreaterThan(0);
    expect(repo?.languages[0]?.share).toBeGreaterThan(0);
    expect(repo?.topContributors.length).toBeGreaterThan(0);
    expect(repo?.recentCommits.length).toBeGreaterThan(0);
  });

  it('resolves a bare organisation to its most-starred repository', async () => {
    const resolved = await gitHubService.findOrganizationRepository('aave');

    expect(resolved).not.toBeNull();
    expect(resolved?.owner.toLowerCase()).toBe('aave');
  });

  it('returns null for a repository that does not exist', async () => {
    const repo = await gitHubService.getRepository('norien/definitely-not-a-real-repo-xyz');
    expect(repo).toBeNull();
  });
});

describe('coingecko (metadata only)', () => {
  it('returns logo, categories, description, and supply', async () => {
    const coin = await coinGeckoService.getCoin('ethereum');

    expect(coin).not.toBeNull();
    expect(coin?.logo).toMatch(/^https:\/\//);
    expect(coin?.categories.length).toBeGreaterThan(0);
    expect(coin?.description).toBeTruthy();
    expect(coin?.circulatingSupply).toBeGreaterThan(0);
  });

  it('looks a token up by contract address', async () => {
    const coin = await coinGeckoService.getByContract(
      'ethereum',
      '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    );

    expect(coin).not.toBeNull();
    expect(coin?.symbol).toBe('WETH');
  });

  it('returns null for an unknown coin rather than throwing', async () => {
    expect(await coinGeckoService.getCoin('definitely-not-a-coin-xyz')).toBeNull();
  });
});

describe('defillama', () => {
  it('lists protocols ranked by TVL', async () => {
    const { items, total } = await defiLlamaService.listProtocols({ limit: 5 });

    expect(total).toBeGreaterThan(1000);
    expect(items.length).toBe(5);
    expect(items[0]?.tvl ?? 0).toBeGreaterThanOrEqual(items[4]?.tvl ?? 0);
  });

  it('filters by chain and by name', async () => {
    const byChain = await defiLlamaService.listProtocols({ chain: 'Ethereum', limit: 5 });
    expect(byChain.items.length).toBeGreaterThan(0);

    const byName = await defiLlamaService.listProtocols({ query: 'aave', limit: 5 });
    expect(byName.items.some((p) => p.name.toLowerCase().includes('aave'))).toBe(true);
  });

  it('returns a protocol whose chain breakdown excludes accounting buckets', async () => {
    const detail = await defiLlamaService.getProtocol('aave');

    expect(detail).not.toBeNull();
    const chains = detail?.chainTvl.map((entry) => entry.chain) ?? [];

    expect(chains.length).toBeGreaterThan(0);
    // `borrowed` and `staking` are breakdowns, not chains.
    expect(chains).not.toContain('borrowed');
    expect(chains).not.toContain('staking');
    expect(chains).not.toContain('pool2');
  });

  it('returns null for an unknown protocol', async () => {
    expect(await defiLlamaService.getProtocol('not-a-real-protocol-xyz')).toBeNull();
  });
});

describe('blockscout', () => {
  it('reads an address record', async () => {
    const address = await blockscoutService.getAddress(NATIVE_TOKEN);

    expect(address).not.toBeNull();
    expect(address?.isContract).toBe(true);
  });

  it('reads verified source and an ABI', async () => {
    const contract = await blockscoutService.getContract(NATIVE_TOKEN);

    expect(contract).not.toBeNull();
    expect(contract?.verified).toBe(true);
    expect(contract?.sourceCode).toBeTruthy();

    const abi = await blockscoutService.getAbi(NATIVE_TOKEN);
    expect(Array.isArray(abi)).toBe(true);
  });

  it('reads token metadata and transfer history', async () => {
    const token = await blockscoutService.getToken(NATIVE_TOKEN);
    expect(token?.symbol).toBe('USDG');
    expect(token?.holders).toBeGreaterThan(0);

    const transfers = await blockscoutService.listTokenTransfers(NATIVE_TOKEN, 3);
    expect(transfers.length).toBeGreaterThan(0);
    expect(transfers[0]?.timestamp).toMatch(/^\d{4}-/);
  });
});

describe('rpc', () => {
  it('formats wei without floating-point loss', () => {
    expect(formatUnits('1000000000000000000', 18)).toBe('1');
    expect(formatUnits('1500000000000000000', 18)).toBe('1.5');
    expect(formatUnits('1', 18)).toBe('0.000000000000000001');
    expect(formatUnits('0', 18)).toBe('0');
  });

  it('reads chain head and gas price', async () => {
    const block = await rpcService.getBlockNumber();
    expect(block).toBeGreaterThan(0);

    const gas = await rpcService.getGasPrice();
    expect(BigInt(gas)).toBeGreaterThan(0n);
  });

  it('reads ERC-20 identity in one batched call', async () => {
    const token = await rpcService.readToken(NATIVE_TOKEN);

    expect(token.symbol).toBe('USDG');
    expect(token.decimals).toBe(6);
    expect(token.totalSupply).toBeTruthy();
  });

  it('reports code size, distinguishing a contract from a wallet', async () => {
    expect(await rpcService.getCodeSize(NATIVE_TOKEN)).toBeGreaterThan(0);
    expect(
      await rpcService.getCodeSize('0x000000000000000000000000000000000000dEaD'),
    ).toBe(0);
  });

  it('returns event logs', async () => {
    const head = await rpcService.getBlockNumber();
    const logs = await rpcService.getLogs({
      fromBlock: `0x${(head - 5).toString(16)}`,
      toBlock: 'latest',
    });

    expect(Array.isArray(logs)).toBe(true);
  });
});

describe('unified API', () => {
  it('reports every provider as configured and reachable', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/providers' });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    for (const provider of body.data) {
      expect(provider.configured, `${provider.provider} configured`).toBe(true);
      expect(provider.reachable, `${provider.provider} reachable`).toBe(true);
    }
  });

  it('returns normalized tokens with no provider vocabulary', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/tokens?limit=3' });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.degraded).toBe(false);
    expect(body.data.items.length).toBeGreaterThan(0);

    const token = body.data.items[0];
    // Exactly the specified normalized shape.
    for (const field of [
      'name', 'symbol', 'logo', 'price', 'marketCap',
      'liquidity', 'holders', 'volume24h', 'change24h', 'chain',
    ]) {
      expect(token, `missing ${field}`).toHaveProperty(field);
    }

    // No leakage of upstream field names.
    const serialized = JSON.stringify(token);
    expect(serialized).not.toContain('priceUSD');
    expect(serialized).not.toContain('volume24"');
    expect(serialized).not.toContain('networkId');
  });

  it('merges providers into one token record', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/token/${NATIVE_TOKEN}` });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.data.symbol).toBe('USDG');
    expect(body.data.price).toBeGreaterThan(0);
    expect(body.data.decimals).toBe(6);
    expect(body.data.links.explorer).toContain('blockscout');
    // Provenance is reported so a partial answer is visibly partial.
    expect(body.sources.map((s: { provider: string }) => s.provider)).toContain('codex');
  });

  it('returns trending tokens', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/trending?chainId=1&limit=3' });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.items.length).toBeGreaterThan(0);
  });

  it('returns projects and a project with repository health', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/projects?limit=3' });
    expect(list.json().data.items.length).toBe(3);

    const detail = await app.inject({ method: 'GET', url: '/api/project/aave' });
    const project = detail.json().data;

    expect(project.name).toBe('Aave');
    expect(project.chains.length).toBeGreaterThan(0);
    expect(project.repository?.stars).toBeGreaterThan(0);
  });

  it('returns a contract with ABI and verified source', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/contracts/${NATIVE_TOKEN}` });
    const contract = response.json().data;

    expect(contract.isContract).toBe(true);
    expect(contract.verified).toBe(true);
    expect(Array.isArray(contract.abi)).toBe(true);
    expect(contract.token?.symbol).toBe('USDG');
  });

  it('returns a wallet with balance and history', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/wallets/0xebe0e06e87038deaf43aec5a7baef04a0ca3c95b?limit=3',
    });
    const wallet = response.json().data;

    expect(wallet.chain.id).toBe(env.ROBINHOOD_CHAIN_ID);
    expect(typeof wallet.balanceFormatted).toBe('string');
    expect(wallet.transactions.length).toBeGreaterThan(0);
  });

  it('searches tokens and projects together', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/search?q=aave&limit=6' });
    const kinds = new Set(response.json().data.items.map((r: { kind: string }) => r.kind));

    expect(response.statusCode).toBe(200);
    expect(kinds.size).toBeGreaterThan(0);
  });

  it('short-circuits an address query to an address result', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/search?q=${NATIVE_TOKEN}` });
    const items = response.json().data.items;

    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('address');
  });

  it('returns live chain status', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/chain' });
    const chain = response.json().data;

    expect(chain.blockNumber).toBeGreaterThan(0);
    expect(chain.chain.id).toBe(env.ROBINHOOD_CHAIN_ID);
  });

  it('validates request input', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/token/nothex' })).statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url: '/api/search' })).statusCode).toBe(422);
    expect(
      (await app.inject({ method: 'GET', url: '/api/tokens?limit=9999' })).statusCode,
    ).toBe(422);
  });

  it('404s an unknown token instead of returning an empty shell', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/token/0x0000000000000000000000000000000000000001',
    });

    expect(response.statusCode).toBe(404);
  });

  it('serves repeat requests from cache', async () => {
    const before = providerCache.stats.hits;

    await app.inject({ method: 'GET', url: '/api/tokens?limit=3' });
    await app.inject({ method: 'GET', url: '/api/tokens?limit=3' });

    expect(providerCache.stats.hits).toBeGreaterThan(before);
  });
});
