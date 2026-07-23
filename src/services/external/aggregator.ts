import { env } from '../../config/env.js';
import { isProviderError } from '../../core/provider-client.js';
import { blockscoutService, type BlockscoutService } from './blockscout.js';
import { codexService, type CodexService, type CodexTokenRow } from './codex.js';
import { coinGeckoService, type CoinGeckoService } from './coingecko.js';
import { defiLlamaService, type DefiLlamaService, type LlamaProtocol } from './defillama.js';
import { formatUnits, rpcService, type RpcService } from './rpc.js';
import { gitHubService, type GitHubService } from './github.js';
import type {
  Aggregated,
  ChainRef,
  ChainStatus,
  Contract,
  Paged,
  Project,
  SearchResult,
  SourceReport,
  Token,
  Wallet,
} from './types.js';

/**
 * The aggregation layer.
 *
 * Composes providers into the normalized model and guarantees the phase's
 * central promise: **if one provider fails, the response still returns whatever
 * the others produced.** Every aggregate is assembled from settled results, and
 * each response reports which sources contributed.
 *
 * This is also the only place that knows which provider owns which field —
 * Codex for market data, CoinGecko for metadata, DeFiLlama for TVL, and so on.
 */

/** Runs a provider call, converting any failure into a source report. */
async function attempt<T>(
  provider: string,
  configured: boolean,
  run: () => Promise<T>,
): Promise<{ value: T | null; report: SourceReport }> {
  if (!configured) {
    return { value: null, report: { provider, status: 'not_configured' } };
  }

  const startedAt = Date.now();

  try {
    const value = await run();
    return { value, report: { provider, status: 'ok', ms: Date.now() - startedAt } };
  } catch (error) {
    const reason = isProviderError(error)
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error);

    return {
      value: null,
      report: { provider, status: 'unavailable', reason, ms: Date.now() - startedAt },
    };
  }
}

function wrap<T>(data: T, reports: SourceReport[]): Aggregated<T> {
  return {
    data,
    sources: reports,
    degraded: reports.some((report) => report.status === 'unavailable'),
  };
}

/**
 * CoinGecko names chains differently from everyone else. Only chains we can map
 * confidently are listed; an unmapped chain simply skips CoinGecko enrichment
 * rather than guessing and fetching the wrong token.
 */
const COINGECKO_PLATFORM_BY_CHAIN_ID: Readonly<Record<number, string>> = {
  1: 'ethereum',
  10: 'optimistic-ethereum',
  56: 'binance-smart-chain',
  137: 'polygon-pos',
  8453: 'base',
  42161: 'arbitrum-one',
  43114: 'avalanche',
};

export class AggregatorService {
  constructor(
    private readonly codex: CodexService = codexService,
    private readonly coingecko: CoinGeckoService = coinGeckoService,
    private readonly llama: DefiLlamaService = defiLlamaService,
    private readonly github: GitHubService = gitHubService,
    private readonly blockscout: BlockscoutService = blockscoutService,
    private readonly rpc: RpcService = rpcService,
  ) {}

  private get nativeChain(): ChainRef {
    return { id: env.ROBINHOOD_CHAIN_ID, name: env.ROBINHOOD_CHAIN_NAME };
  }

  private chainRef(networkId: number, networks: Map<number, string>): ChainRef {
    return { id: networkId, name: networks.get(networkId) ?? `Chain ${networkId}` };
  }

  /** Codex market row -> normalized Token. Metadata is layered on separately. */
  private toToken(row: CodexTokenRow, networks: Map<number, string>): Token {
    return {
      address: row.address,
      name: row.name,
      symbol: row.symbol,
      logo: row.imageUrl,
      price: row.price,
      marketCap: row.marketCap,
      liquidity: row.liquidity,
      holders: row.holders,
      volume24h: row.volume24h,
      change24h: row.change24h,
      chain: this.chainRef(row.networkId, networks),
    };
  }

  /** Network id -> name, cached hard upstream. Empty on failure, never throws. */
  private async networkMap(): Promise<Map<number, string>> {
    try {
      const networks = await this.codex.listNetworks();
      return new Map(networks.map((network) => [network.id, network.name]));
    } catch {
      return new Map();
    }
  }

  // --- Tokens --------------------------------------------------------------

  async listTokens(options: {
    chainId?: number;
    limit?: number;
    offset?: number;
    ranking?: 'trendingScore24' | 'volume24' | 'liquidity' | 'marketCap' | 'change24';
    query?: string;
  }): Promise<Aggregated<Paged<Token>>> {
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;

    const networks = await this.networkMap();

    const { value, report } = await attempt('codex', this.codex.configured, () =>
      this.codex.listTokens({
        ...(options.chainId !== undefined ? { networkIds: [options.chainId] } : {}),
        limit,
        offset,
        ...(options.ranking ? { ranking: options.ranking } : {}),
        ...(options.query ? { phrase: options.query } : {}),
      }),
    );

    const items = (value ?? []).map((row) => this.toToken(row, networks));

    return wrap(
      {
        items,
        meta: {
          // Codex does not return a stable total for filtered queries, so the
          // page reports what it actually has rather than inventing a count.
          total: offset + items.length,
          limit,
          offset,
          hasMore: items.length === limit,
        },
      },
      [report],
    );
  }

  async getTrending(chainId: number | undefined, limit: number): Promise<Aggregated<Paged<Token>>> {
    return this.listTokens({
      ...(chainId !== undefined ? { chainId } : {}),
      limit,
      ranking: 'trendingScore24',
    });
  }

  /**
   * One token: Codex for market data, CoinGecko for metadata, Blockscout for
   * on-chain identity when the token lives on the native chain.
   */
  async getToken(address: string, chainId: number): Promise<Aggregated<Token | null>> {
    const networks = await this.networkMap();
    const reports: SourceReport[] = [];

    const market = await attempt('codex', this.codex.configured, () =>
      this.codex.getToken(address, chainId),
    );
    reports.push(market.report);

    const platform = COINGECKO_PLATFORM_BY_CHAIN_ID[chainId];
    const isNativeChain = chainId === env.ROBINHOOD_CHAIN_ID;

    // Metadata and explorer data are fetched together; neither blocks the other.
    const [metadata, explorer] = await Promise.all([
      platform
        ? attempt('coingecko', this.coingecko.configured, () =>
            this.coingecko.getByContract(platform, address),
          )
        : Promise.resolve({
            value: null,
            report: {
              provider: 'coingecko',
              status: 'skipped' as const,
              reason: `no CoinGecko platform mapping for chain ${chainId}`,
            },
          }),
      isNativeChain
        ? attempt('blockscout', this.blockscout.configured, () =>
            this.blockscout.getToken(address),
          )
        : Promise.resolve({
            value: null,
            report: {
              provider: 'blockscout',
              status: 'skipped' as const,
              reason: 'token is not on the native chain',
            },
          }),
    ]);

    reports.push(metadata.report, explorer.report);

    if (!market.value && !explorer.value) {
      return wrap(null, reports);
    }

    const row = market.value;
    const meta = metadata.value;
    const chainToken = explorer.value;

    const token: Token = {
      address,
      name: row?.name ?? chainToken?.name ?? meta?.name ?? address,
      symbol: row?.symbol ?? chainToken?.symbol ?? meta?.symbol ?? '',
      // Logo preference: Codex, then the explorer, then CoinGecko.
      logo: row?.imageUrl ?? chainToken?.iconUrl ?? meta?.logo ?? null,
      price: row?.price ?? null,
      marketCap: row?.marketCap ?? null,
      liquidity: row?.liquidity ?? null,
      holders: row?.holders ?? chainToken?.holders ?? null,
      volume24h: row?.volume24h ?? null,
      change24h: row?.change24h ?? null,
      chain: this.chainRef(chainId, networks),
      decimals: row?.decimals ?? chainToken?.decimals ?? null,
      totalSupply: row?.totalSupply ?? null,
      circulatingSupply: meta?.circulatingSupply ?? null,
      maxSupply: meta?.maxSupply ?? null,
      description: row?.description ?? meta?.description ?? null,
      categories: meta?.categories ?? [],
      links: {
        website: row?.website ?? meta?.homepage ?? null,
        twitter: row?.twitter ?? meta?.twitter ?? null,
        telegram: row?.telegram ?? null,
        explorer: isNativeChain && env.ROBINHOOD_BLOCK_EXPLORER
          ? `${env.ROBINHOOD_BLOCK_EXPLORER.replace(/\/+$/, '')}/token/${address}`
          : null,
      },
      fdv: row?.fdv ?? null,
      txns24h: row?.txns24h ?? null,
    };

    return wrap(token, reports);
  }

  // --- Projects ------------------------------------------------------------

  private toProject(protocol: LlamaProtocol, chainTvl: { chain: string; tvl: number }[]): Project {
    return {
      slug: protocol.slug,
      name: protocol.name,
      symbol: protocol.symbol,
      description: protocol.description,
      logo: protocol.logo,
      category: protocol.category,
      url: protocol.url,
      chains: protocol.chains,
      tvl: protocol.tvl,
      chainTvl,
      twitter: protocol.twitter ? `https://twitter.com/${protocol.twitter.replace(/^@/, '')}` : null,
      github: protocol.github,
      repository: null,
    };
  }

  async listProjects(options: {
    chain?: string;
    category?: string;
    query?: string;
    limit?: number;
    offset?: number;
  }): Promise<Aggregated<Paged<Project>>> {
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;

    const { value, report } = await attempt('defillama', this.llama.configured, () =>
      this.llama.listProtocols({ ...options, limit, offset }),
    );

    const items = (value?.items ?? []).map((protocol) => this.toProject(protocol, []));
    const total = value?.total ?? items.length;

    return wrap(
      { items, meta: { total, limit, offset, hasMore: offset + items.length < total } },
      [report],
    );
  }

  /** A project plus, when it links a repository, its GitHub health. */
  async getProject(slug: string): Promise<Aggregated<Project | null>> {
    const reports: SourceReport[] = [];

    const detail = await attempt('defillama', this.llama.configured, () =>
      this.llama.getProtocol(slug),
    );
    reports.push(detail.report);

    if (!detail.value) {
      reports.push({ provider: 'github', status: 'skipped', reason: 'project not found' });
      return wrap(null, reports);
    }

    const project = this.toProject(detail.value.protocol, detail.value.chainTvl);

    if (project.github) {
      const repo = await attempt('github', this.github.configured, () =>
        this.github.getRepository(project.github as string),
      );
      reports.push(repo.report);
      project.repository = repo.value;
    } else {
      reports.push({ provider: 'github', status: 'skipped', reason: 'no repository linked' });
    }

    return wrap(project, reports);
  }

  // --- Contracts and wallets ----------------------------------------------

  /** Explorer plus node: the explorer is richer, the node is authoritative. */
  async getContract(address: string): Promise<Aggregated<Contract | null>> {
    const [addressResult, contractResult, tokenResult, abiResult, codeResult] = await Promise.all([
      attempt('blockscout', this.blockscout.configured, () => this.blockscout.getAddress(address)),
      attempt('blockscout', this.blockscout.configured, () => this.blockscout.getContract(address)),
      attempt('blockscout', this.blockscout.configured, () => this.blockscout.getToken(address)),
      attempt('blockscout', this.blockscout.configured, () => this.blockscout.getAbi(address)),
      attempt('rpc', this.rpc.configured, () => this.rpc.getCodeSize(address)),
    ]);

    const reports: SourceReport[] = [
      { ...addressResult.report, provider: 'blockscout' },
      { ...codeResult.report, provider: 'rpc' },
    ];

    const bytecodeSize = codeResult.value ?? 0;
    const explorerAddress = addressResult.value;

    // Nothing on-chain and nothing in the explorer means the address is unknown.
    if (bytecodeSize === 0 && !explorerAddress && !contractResult.value) {
      return wrap(null, reports);
    }

    const verified = contractResult.value;
    const token = tokenResult.value;

    const contract: Contract = {
      address,
      chain: this.nativeChain,
      isContract: bytecodeSize > 0 || explorerAddress?.isContract === true,
      verified: verified?.verified ?? false,
      name: verified?.name ?? token?.name ?? null,
      compilerVersion: verified?.compilerVersion ?? null,
      optimizationEnabled: verified?.optimizationEnabled ?? null,
      license: verified?.license ?? null,
      abi: verified?.abi ?? abiResult.value ?? null,
      sourceCode: verified?.sourceCode ?? null,
      creator: explorerAddress?.creator ?? null,
      creationTxHash: explorerAddress?.creationTxHash ?? null,
      bytecodeSize,
      balance: explorerAddress?.balance ?? null,
      token: token
        ? {
            name: token.name,
            symbol: token.symbol,
            decimals: token.decimals,
            totalSupply: token.totalSupply,
            holders: token.holders,
          }
        : null,
    };

    return wrap(contract, reports);
  }

  async getWallet(address: string, limit: number): Promise<Aggregated<Wallet>> {
    const [balanceResult, nonceResult, codeResult, txResult, transferResult] = await Promise.all([
      attempt('rpc', this.rpc.configured, () => this.rpc.getBalance(address)),
      attempt('rpc', this.rpc.configured, () => this.rpc.getTransactionCount(address)),
      attempt('rpc', this.rpc.configured, () => this.rpc.getCodeSize(address)),
      attempt('blockscout', this.blockscout.configured, () =>
        this.blockscout.listTransactions(address, limit),
      ),
      attempt('blockscout', this.blockscout.configured, () =>
        this.blockscout.listTokenTransfers(address, limit),
      ),
    ]);

    const reports: SourceReport[] = [
      { ...balanceResult.report, provider: 'rpc' },
      { ...txResult.report, provider: 'blockscout' },
    ];

    const balance = balanceResult.value ?? '0';

    const wallet: Wallet = {
      address,
      chain: this.nativeChain,
      balance,
      balanceFormatted: formatUnits(balance, 18),
      nonce: nonceResult.value,
      isContract: (codeResult.value ?? 0) > 0,
      transactionCount: nonceResult.value,
      transactions: txResult.value ?? [],
      tokenTransfers: transferResult.value ?? [],
    };

    return wrap(wallet, reports);
  }

  async getChainStatus(): Promise<Aggregated<ChainStatus | null>> {
    const [blockResult, gasResult] = await Promise.all([
      attempt('rpc', this.rpc.configured, () => this.rpc.getBlockNumber()),
      attempt('rpc', this.rpc.configured, () => this.rpc.getGasPrice()),
    ]);

    const reports = [{ ...blockResult.report, provider: 'rpc' }];

    if (blockResult.value === null) return wrap(null, reports);

    const gasPrice = gasResult.value ?? '0';

    return wrap(
      {
        chain: this.nativeChain,
        blockNumber: blockResult.value,
        gasPrice,
        gasPriceGwei: Number(formatUnits(gasPrice, 9)),
        nativeCurrency: env.ROBINHOOD_NATIVE_CURRENCY,
        explorer: env.ROBINHOOD_BLOCK_EXPLORER ?? null,
      },
      reports,
    );
  }

  // --- Search --------------------------------------------------------------

  /**
   * Unified search across tokens and projects.
   *
   * An input that looks like an address short-circuits to an address result, so
   * pasting a contract goes straight to the thing you meant.
   */
  async search(query: string, limit: number): Promise<Aggregated<Paged<SearchResult>>> {
    const trimmed = query.trim();
    const reports: SourceReport[] = [];

    if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
      return wrap(
        {
          items: [
            {
              kind: 'address' as const,
              id: trimmed.toLowerCase(),
              name: trimmed,
              symbol: null,
              logo: null,
              chain: this.nativeChain,
              score: 1,
            },
          ],
          meta: { total: 1, limit, offset: 0, hasMore: false },
        },
        [{ provider: 'input', status: 'ok', reason: 'matched an address pattern' }],
      );
    }

    const networks = await this.networkMap();

    const [tokenResult, projectResult] = await Promise.all([
      attempt('codex', this.codex.configured, () =>
        this.codex.listTokens({ phrase: trimmed, limit }),
      ),
      attempt('defillama', this.llama.configured, () =>
        this.llama.listProtocols({ query: trimmed, limit }),
      ),
    ]);

    reports.push(tokenResult.report, projectResult.report);

    const tokens: SearchResult[] = (tokenResult.value ?? []).map((row) => ({
      kind: 'token',
      id: row.address,
      name: row.name,
      symbol: row.symbol,
      logo: row.imageUrl,
      chain: this.chainRef(row.networkId, networks),
      // Liquidity is the most honest relevance signal Codex gives for a phrase.
      score: row.liquidity ?? 0,
    }));

    const projects: SearchResult[] = (projectResult.value?.items ?? []).map((protocol) => ({
      kind: 'project',
      id: protocol.slug,
      name: protocol.name,
      symbol: protocol.symbol,
      logo: protocol.logo,
      chain: null,
      score: protocol.tvl ?? 0,
    }));

    // Ranked within each kind, then interleaved so neither kind buries the
    // other — a raw score merge would let TVL numbers swamp liquidity numbers.
    tokens.sort((a, b) => b.score - a.score);
    projects.sort((a, b) => b.score - a.score);

    const items: SearchResult[] = [];
    for (let index = 0; index < Math.max(tokens.length, projects.length); index += 1) {
      if (tokens[index]) items.push(tokens[index] as SearchResult);
      if (projects[index]) items.push(projects[index] as SearchResult);
      if (items.length >= limit) break;
    }

    const trimmedItems = items.slice(0, limit);

    return wrap(
      {
        items: trimmedItems,
        meta: {
          total: tokens.length + projects.length,
          limit,
          offset: 0,
          hasMore: tokens.length + projects.length > trimmedItems.length,
        },
      },
      reports,
    );
  }

  /** Configuration and liveness of every provider, for `/api/providers`. */
  async describeProviders(): Promise<
    { provider: string; configured: boolean; reachable: boolean | null; reason?: string; ms?: number }[]
  > {
    const probes: { provider: string; configured: boolean; run: () => Promise<boolean> }[] = [
      { provider: 'codex', configured: this.codex.configured, run: async () => (await this.codex.listNetworks()).length > 0 },
      { provider: 'github', configured: this.github.configured, run: () => this.github.ping() },
      { provider: 'coingecko', configured: this.coingecko.configured, run: () => this.coingecko.ping() },
      { provider: 'defillama', configured: this.llama.configured, run: () => this.llama.ping() },
      { provider: 'blockscout', configured: this.blockscout.configured, run: () => this.blockscout.ping() },
      { provider: 'rpc', configured: this.rpc.configured, run: () => this.rpc.ping() },
    ];

    return Promise.all(
      probes.map(async (probe) => {
        if (!probe.configured) {
          return { provider: probe.provider, configured: false, reachable: null };
        }

        const started = Date.now();
        try {
          await probe.run();
          return {
            provider: probe.provider,
            configured: true,
            reachable: true,
            ms: Date.now() - started,
          };
        } catch (error) {
          return {
            provider: probe.provider,
            configured: true,
            reachable: false,
            reason: error instanceof Error ? error.message : String(error),
            ms: Date.now() - started,
          };
        }
      }),
    );
  }
}

export const aggregatorService = new AggregatorService();
