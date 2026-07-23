/**
 * The normalized market-data model served by Norien's unified `/api/*`
 * surface.
 *
 * These mirror the server's normalized types exactly. Naming is camelCase,
 * matching that API; the registry types in `types.ts` remain snake_case. The
 * two are separate contracts and neither is renamed under existing clients.
 */

export type SourceStatus = 'ok' | 'unavailable' | 'not_configured' | 'skipped';

export interface SourceReport {
  provider: string;
  status: SourceStatus;
  reason?: string;
  ms?: number;
}

/**
 * Every `/api/*` response carries its provenance. `degraded` is true when a
 * provider failed, so a partial answer can be shown as partial rather than
 * presented as complete.
 */
export interface Aggregated<T> {
  data: T;
  sources: SourceReport[];
  degraded: boolean;
}

export interface DataPageMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface DataPage<T> {
  items: T[];
  meta: DataPageMeta;
}

export interface ChainRef {
  id: number;
  name: string;
}

export interface TokenLinks {
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  explorer: string | null;
}

export interface MarketToken {
  address: string;
  name: string;
  symbol: string;
  logo: string | null;
  price: number | null;
  marketCap: number | null;
  liquidity: number | null;
  holders: number | null;
  volume24h: number | null;
  change24h: number | null;
  chain: ChainRef;
  decimals?: number | null;
  totalSupply?: number | null;
  circulatingSupply?: number | null;
  maxSupply?: number | null;
  description?: string | null;
  categories?: string[];
  links?: TokenLinks;
  fdv?: number | null;
  txns24h?: number | null;
}

export interface RepositoryStats {
  fullName: string;
  url: string;
  description: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  watchers: number;
  license: string | null;
  defaultBranch: string;
  pushedAt: string | null;
  languages: { name: string; bytes: number; share: number }[];
  latestRelease: {
    name: string | null;
    tag: string;
    url: string;
    publishedAt: string | null;
  } | null;
  topContributors: { login: string; contributions: number; avatar: string | null; url: string }[];
  recentCommits: {
    sha: string;
    message: string;
    author: string | null;
    date: string | null;
    url: string;
  }[];
}

export interface MarketProject {
  slug: string;
  name: string;
  symbol: string | null;
  description: string | null;
  logo: string | null;
  category: string | null;
  url: string | null;
  chains: string[];
  tvl: number | null;
  chainTvl: { chain: string; tvl: number }[];
  twitter: string | null;
  github: string | null;
  repository: RepositoryStats | null;
}

export interface ContractTokenSummary {
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  totalSupply: string | null;
  holders: number | null;
}

export interface ChainContract {
  address: string;
  chain: ChainRef;
  isContract: boolean;
  verified: boolean;
  name: string | null;
  compilerVersion: string | null;
  optimizationEnabled: boolean | null;
  license: string | null;
  abi: unknown[] | null;
  sourceCode: string | null;
  creator: string | null;
  creationTxHash: string | null;
  bytecodeSize: number;
  balance: string | null;
  token: ContractTokenSummary | null;
}

export interface ChainTransaction {
  hash: string;
  blockNumber: number;
  timestamp: string | null;
  from: string;
  to: string | null;
  value: string;
  gasUsed: string | null;
  success: boolean;
}

export interface ChainTokenTransfer {
  hash: string;
  blockNumber: number;
  timestamp: string | null;
  from: string;
  to: string;
  value: string;
  tokenAddress: string;
  tokenSymbol: string | null;
  tokenDecimals: number | null;
}

export interface ChainWallet {
  address: string;
  chain: ChainRef;
  balance: string;
  balanceFormatted: string;
  nonce: number | null;
  isContract: boolean;
  transactionCount: number | null;
  transactions: ChainTransaction[];
  tokenTransfers: ChainTokenTransfer[];
}

export interface ChainStatus {
  chain: ChainRef;
  blockNumber: number;
  gasPrice: string;
  gasPriceGwei: number;
  nativeCurrency: string;
  explorer: string | null;
}

export type MarketSearchKind = 'token' | 'project' | 'address';

export interface MarketSearchResult {
  kind: MarketSearchKind;
  id: string;
  name: string;
  symbol: string | null;
  logo: string | null;
  chain: ChainRef | null;
  score: number;
}

export interface ProviderStatus {
  provider: string;
  configured: boolean;
  reachable: boolean | null;
  reason?: string;
  ms?: number;
}

export interface ProvidersResponse {
  data: ProviderStatus[];
  cache: {
    hits: number;
    misses: number;
    staleServed: number;
    sets: number;
    evictions: number;
    size: number;
  };
}

// --- Request parameters ----------------------------------------------------

export type TokenSort =
  | 'volume24'
  | 'liquidity'
  | 'marketCap'
  | 'change24'
  | 'trendingScore24';

export interface ListMarketTokensParams {
  chainId?: number;
  limit?: number;
  offset?: number;
  q?: string;
  sort?: TokenSort;
}

export interface ListMarketProjectsParams {
  chain?: string;
  category?: string;
  q?: string;
  limit?: number;
  offset?: number;
}
