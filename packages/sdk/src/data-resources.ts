import type { HttpTransport } from './http.js';
import type {
  Aggregated,
  ChainContract,
  ChainStatus,
  ChainWallet,
  DataPage,
  ListMarketProjectsParams,
  ListMarketTokensParams,
  MarketProject,
  MarketSearchResult,
  MarketToken,
  ProvidersResponse,
} from './data-types.js';

/**
 * Resources for the unified market-data API.
 *
 * Each method maps onto exactly one `/api/*` endpoint. The aggregation across
 * external providers already happened server-side, so these stay thin: the SDK
 * never merges providers itself, which is what keeps a single source of truth.
 */

export class TokensResource {
  constructor(private readonly http: HttpTransport) {}

  /** Ranked token listing. Defaults to the native chain server-side. */
  list(params: ListMarketTokensParams = {}): Promise<Aggregated<DataPage<MarketToken>>> {
    return this.http.get<Aggregated<DataPage<MarketToken>>>('/api/tokens', params);
  }

  /** Tokens ranked by 24h trending score. */
  trending(
    params: { chainId?: number; limit?: number } = {},
  ): Promise<Aggregated<DataPage<MarketToken>>> {
    return this.http.get<Aggregated<DataPage<MarketToken>>>('/api/trending', params);
  }

  /** One token, merged from market data, metadata, and on-chain identity. */
  get(address: string, options: { chainId?: number } = {}): Promise<Aggregated<MarketToken>> {
    return this.http.get<Aggregated<MarketToken>>(
      `/api/token/${encodeURIComponent(address)}`,
      options,
    );
  }
}

export class ProjectsResource {
  constructor(private readonly http: HttpTransport) {}

  list(params: ListMarketProjectsParams = {}): Promise<Aggregated<DataPage<MarketProject>>> {
    return this.http.get<Aggregated<DataPage<MarketProject>>>('/api/projects', params);
  }

  /** One protocol, with repository health when it links a GitHub project. */
  get(slug: string): Promise<Aggregated<MarketProject>> {
    return this.http.get<Aggregated<MarketProject>>(`/api/project/${encodeURIComponent(slug)}`);
  }
}

export class ContractsResource {
  constructor(private readonly http: HttpTransport) {}

  /** Verified source, ABI, creator, and token identity for a contract. */
  get(address: string): Promise<Aggregated<ChainContract>> {
    return this.http.get<Aggregated<ChainContract>>(
      `/api/contracts/${encodeURIComponent(address)}`,
    );
  }
}

export class WalletsResource {
  constructor(private readonly http: HttpTransport) {}

  /** Balance, nonce, transactions, and token transfers for an address. */
  get(address: string, options: { limit?: number } = {}): Promise<Aggregated<ChainWallet>> {
    return this.http.get<Aggregated<ChainWallet>>(
      `/api/wallets/${encodeURIComponent(address)}`,
      options,
    );
  }
}

export class ChainResource {
  constructor(private readonly http: HttpTransport) {}

  /** Current block height and gas price, read from the node. */
  status(): Promise<Aggregated<ChainStatus>> {
    return this.http.get<Aggregated<ChainStatus>>('/api/chain');
  }

  /** Which providers are configured and reachable, plus cache statistics. */
  providers(): Promise<ProvidersResponse> {
    return this.http.get<ProvidersResponse>('/api/providers');
  }
}

/**
 * Global product search across tokens, projects, and addresses.
 *
 * Distinct from `client.search()`, which searches the *registry* catalogue of
 * agents and tools. Two different catalogues, two different endpoints.
 */
export class MarketSearchResource {
  constructor(private readonly http: HttpTransport) {}

  all(
    query: string,
    options: { limit?: number } = {},
  ): Promise<Aggregated<DataPage<MarketSearchResult>>> {
    return this.http.get<Aggregated<DataPage<MarketSearchResult>>>('/api/search', {
      q: query,
      ...options,
    });
  }
}
