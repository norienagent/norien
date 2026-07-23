/**
 * The normalized domain model of the unified API.
 *
 * These shapes are the contract with every consumer (frontend, CLI, SDK). They
 * deliberately carry no provider-specific vocabulary: a caller cannot tell that
 * price came from Codex, the logo from CoinGecko, or TVL from DeFiLlama.
 *
 * Field naming here is camelCase, matching the Token shape specified for this
 * API surface. (The registry API at `/agents` and `/tools` remains snake_case.)
 */

/** Which providers answered, and which did not, for a given response. */
export type SourceStatus = 'ok' | 'unavailable' | 'not_configured' | 'skipped';

export interface SourceReport {
  provider: string;
  status: SourceStatus;
  /** Why a non-ok source did not contribute. */
  reason?: string;
  ms?: number;
}

/**
 * Every aggregated response carries its provenance. `degraded` is true when at
 * least one source failed, so a caller can surface partial data honestly rather
 * than presenting it as complete.
 */
export interface Aggregated<T> {
  data: T;
  sources: SourceReport[];
  degraded: boolean;
}

export interface ChainRef {
  id: number;
  name: string;
}

/** The normalized token, as specified for this phase. */
export interface Token {
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
  /** Present on detail responses; absent from list rows. */
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

export interface TokenLinks {
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  explorer: string | null;
}

/** A DeFi protocol / ecosystem project. */
export interface Project {
  slug: string;
  name: string;
  symbol: string | null;
  description: string | null;
  logo: string | null;
  category: string | null;
  url: string | null;
  chains: string[];
  tvl: number | null;
  /** TVL broken down by chain, largest first. */
  chainTvl: { chain: string; tvl: number }[];
  twitter: string | null;
  github: string | null;
  repository: Repository | null;
}

/** GitHub repository health, normalized. */
export interface Repository {
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
  latestRelease: Release | null;
  topContributors: Contributor[];
  recentCommits: Commit[];
}

export interface Release {
  name: string | null;
  tag: string;
  url: string;
  publishedAt: string | null;
}

export interface Contributor {
  login: string;
  contributions: number;
  avatar: string | null;
  url: string;
}

export interface Commit {
  sha: string;
  message: string;
  author: string | null;
  date: string | null;
  url: string;
}

/** An on-chain contract, combining explorer and RPC facts. */
export interface Contract {
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
  /** Bytecode size in bytes; 0 for an externally owned account. */
  bytecodeSize: number;
  balance: string | null;
  token: TokenSummary | null;
}

export interface TokenSummary {
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  totalSupply: string | null;
  holders: number | null;
}

/** A wallet address, combining explorer and RPC facts. */
export interface Wallet {
  address: string;
  chain: ChainRef;
  balance: string;
  balanceFormatted: string;
  nonce: number | null;
  isContract: boolean;
  transactionCount: number | null;
  transactions: Transaction[];
  tokenTransfers: TokenTransfer[];
}

export interface Transaction {
  hash: string;
  blockNumber: number;
  timestamp: string | null;
  from: string;
  to: string | null;
  value: string;
  gasUsed: string | null;
  success: boolean;
}

export interface TokenTransfer {
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

/** Chain-level facts read straight from the node. */
export interface ChainStatus {
  chain: ChainRef;
  blockNumber: number;
  gasPrice: string;
  gasPriceGwei: number;
  nativeCurrency: string;
  explorer: string | null;
}

export type SearchResultKind = 'token' | 'project' | 'address';

export interface SearchResult {
  kind: SearchResultKind;
  id: string;
  name: string;
  symbol: string | null;
  logo: string | null;
  chain: ChainRef | null;
  /** Relevance within its own kind, highest first. */
  score: number;
}

export interface PageMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface Paged<T> {
  items: T[];
  meta: PageMeta;
}
