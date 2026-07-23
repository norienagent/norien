import 'server-only';

import { API_URL, RUNTIME_URL } from './config';

/**
 * The web app's only data source.
 *
 * Every read goes through Norien's unified `/api/*` surface. The app has no
 * knowledge of Codex, CoinGecko, DeFiLlama, GitHub, Blockscout, or the RPC
 * node — that aggregation already happened server-side, which is what makes
 * Norien the single source of truth.
 *
 * Fetches run in server components with Next's own cache, so a page render
 * costs at most one request per resource and repeat renders cost none.
 */

/** Mirrors the server's aggregation envelope. */
export interface SourceReport {
  provider: string;
  status: 'ok' | 'unavailable' | 'not_configured' | 'skipped';
  reason?: string;
  ms?: number;
}

export interface Aggregated<T> {
  data: T;
  sources: SourceReport[];
  degraded: boolean;
}

export interface Page<T> {
  items: T[];
  meta: { total: number; limit: number; offset: number; hasMore: boolean };
}

export interface ChainRef {
  id: number;
  name: string;
}

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
  decimals?: number | null;
  totalSupply?: number | null;
  circulatingSupply?: number | null;
  maxSupply?: number | null;
  description?: string | null;
  categories?: string[];
  links?: {
    website: string | null;
    twitter: string | null;
    telegram: string | null;
    explorer: string | null;
  };
  fdv?: number | null;
  txns24h?: number | null;
}

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
  latestRelease: { name: string | null; tag: string; url: string; publishedAt: string | null } | null;
  topContributors: { login: string; contributions: number; avatar: string | null; url: string }[];
  recentCommits: { sha: string; message: string; author: string | null; date: string | null; url: string }[];
}

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
  chainTvl: { chain: string; tvl: number }[];
  twitter: string | null;
  github: string | null;
  repository: Repository | null;
}

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
  bytecodeSize: number;
  balance: string | null;
  token: {
    name: string | null;
    symbol: string | null;
    decimals: number | null;
    totalSupply: string | null;
    holders: number | null;
  } | null;
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

export interface ChainStatus {
  chain: ChainRef;
  blockNumber: number;
  gasPrice: string;
  gasPriceGwei: number;
  nativeCurrency: string;
  explorer: string | null;
}

export interface SearchResult {
  kind: 'token' | 'project' | 'address';
  id: string;
  name: string;
  symbol: string | null;
  logo: string | null;
  chain: ChainRef | null;
  score: number;
}

/* -------------------------------------------------------------------------
 * Registry
 *
 * The agent and tool catalogue. Unlike the market endpoints these are Norien's
 * own records rather than aggregated third-party data, so there is no
 * `sources`/`degraded` envelope — a list is `{ data, meta }` and a detail
 * response is the record itself.
 * ---------------------------------------------------------------------- */

export interface RegistryPage<T> {
  data: T[];
  meta: { total: number; limit: number; offset: number; has_more: boolean; next_offset: number | null };
}

export interface EnvironmentVariable {
  name: string;
  required: boolean;
  secret: boolean;
  default?: string;
  description?: string;
}

export interface AgentCommands {
  start: string;
  health: string | null;
}

export interface Agent {
  id: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  icon: string | null;
  readme: string | null;
  permissions: string[];
  required_tools: string[];
  environment_variables: EnvironmentVariable[];
  entrypoint: string;
  runtime: 'node' | 'python';
  commands: AgentCommands;
  install_command: string;
  api_endpoint: string;
  visibility: string;
  manifest: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AgentVersion {
  version: string;
  description: string;
  required_tools: string[];
  permissions: string[];
  entrypoint: string;
  runtime: string;
  commands: AgentCommands;
  created_at: string;
}

export interface ToolAuthentication {
  type: string;
  name?: string;
  description?: string;
}

export interface Tool {
  id: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  category: string;
  author: string;
  tags: string[];
  runtime: 'node' | 'python' | 'http' | null;
  entrypoint: string | null;
  input_schema: Record<string, unknown> | null;
  output_schema: Record<string, unknown> | null;
  authentication: ToolAuthentication | null;
  environment: EnvironmentVariable[];
  permissions: string[];
  dependencies: string[];
  license: string | null;
  homepage: string | null;
  repository: string | null;
  documentation: string | null;
  visibility: string;
  install_command: string;
  created_at: string;
  updated_at: string;
}

export interface ToolVersion {
  version: string;
  description: string;
  runtime: string | null;
  entrypoint: string | null;
  input_schema: Record<string, unknown> | null;
  output_schema: Record<string, unknown> | null;
  created_at: string;
}

/** A `/search` hit. The registry tags each result with its catalogue. */
export type RegistryHit =
  | { type: 'agent'; score: number; item: Agent }
  | { type: 'tool'; score: number; item: Tool };

/** The normalized runtime view of a published agent — parse, detect, resolve. */
export interface NormalizedAgent {
  slug: string;
  name: string;
  version: string;
  description: string;
  runtime: {
    name: string;
    source: string;
    entrypoint: string;
    interpreter: string;
    manifest_file: string;
    commands: AgentCommands;
  };
  permissions: string[];
  dependencies: {
    requested: string[];
    resolved: Tool[];
    missing: string[];
  };
  environment: {
    required: string[];
    optional: string[];
    provided: string[];
    missing: string[];
  };
  diagnostics: { code: string; level: string; message: string }[];
  ready: boolean;
  install_command: string;
  version_check?: { action: string; latest: string | null };
}

export interface Health {
  status: string;
  version: string;
  environment: string;
  uptime_seconds: number;
  checks: { database: { ok: boolean; driver: string; latency_ms: number } };
}

export interface ProviderHealth {
  data: { provider: string; configured: boolean; reachable: boolean; ms?: number; reason?: string }[];
  cache: {
    hits: number;
    misses: number;
    staleServed: number;
    sets: number;
    evictions: number;
    size: number;
  };
}

/* -------------------------------------------------------------------------
 * Runtime supervisor
 *
 * A separate local daemon from the registry: the registry is a shared
 * catalogue and never executes anything. It is optional, so every read below
 * resolves to null when it is not running rather than failing the page.
 * ---------------------------------------------------------------------- */

export type RuntimeState =
  | 'running'
  | 'stopped'
  | 'failed'
  | 'restarting'
  | 'starting'
  | 'stopping'
  | 'installing';

export type HealthStatus = 'starting' | 'healthy' | 'unhealthy' | 'stopped' | 'failed';

export interface RuntimeInstance {
  agent: string;
  version: string;
  status: RuntimeState;
  health: HealthStatus;
  pid: number | null;
  uptime_seconds: number | null;
  restarts: number;
  runtime: string;
  exit: { code: number | null; signal: string | null; at: string | null } | null;
}

export interface RuntimeSummary {
  data: RuntimeInstance[];
  summary: Record<RuntimeState, number>;
  meta: { total: number };
}

/** Thrown for a genuine failure; a 404 resolves to null instead. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface FetchOptions {
  /** Seconds Next may serve this response from its cache. */
  revalidate?: number;
  /** Return null on 404 rather than throwing. */
  nullOn404?: boolean;
}

async function request<T>(path: string, options: FetchOptions = {}): Promise<T | null> {
  const response = await fetch(`${API_URL}${path}`, {
    // Norien already caches provider responses; this second layer keeps a page
    // render from re-requesting the same resource across components.
    next: { revalidate: options.revalidate ?? 30 },
    headers: { accept: 'application/json' },
  });

  if (response.status === 404 && options.nullOn404) return null;

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    let message = `Request failed (${response.status})`;
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      // A non-JSON body leaves the default message in place.
    }
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

const query = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const api = {
  tokens(params: { limit?: number; offset?: number; sort?: string; q?: string; chainId?: number } = {}) {
    return request<Aggregated<Page<Token>>>(`/api/tokens${query(params)}`);
  },

  trending(params: { limit?: number; chainId?: number } = {}) {
    return request<Aggregated<Page<Token>>>(`/api/trending${query(params)}`, { revalidate: 20 });
  },

  token(address: string, chainId?: number) {
    return request<Aggregated<Token>>(`/api/token/${address}${query({ chainId })}`, {
      nullOn404: true,
    });
  },

  projects(params: { limit?: number; offset?: number; q?: string; chain?: string; category?: string } = {}) {
    return request<Aggregated<Page<Project>>>(`/api/projects${query(params)}`, {
      revalidate: 120,
    });
  },

  project(slug: string) {
    return request<Aggregated<Project>>(`/api/project/${encodeURIComponent(slug)}`, {
      revalidate: 120,
      nullOn404: true,
    });
  },

  contract(address: string) {
    return request<Aggregated<Contract>>(`/api/contracts/${address}`, {
      revalidate: 300,
      nullOn404: true,
    });
  },

  wallet(address: string, limit = 15) {
    return request<Aggregated<Wallet>>(`/api/wallets/${address}${query({ limit })}`, {
      revalidate: 15,
    });
  },

  search(q: string, limit = 20) {
    return request<Aggregated<Page<SearchResult>>>(`/api/search${query({ q, limit })}`, {
      revalidate: 30,
    });
  },

  chain() {
    return request<Aggregated<ChainStatus>>('/api/chain', { revalidate: 10 });
  },

  /* --- Registry --------------------------------------------------------- */

  agents(params: { limit?: number; offset?: number; runtime?: string; tag?: string; author?: string } = {}) {
    return request<RegistryPage<Agent>>(`/agents${query(params)}`, { revalidate: 30 });
  },

  agent(slug: string) {
    return request<Agent>(`/agents/${encodeURIComponent(slug)}`, {
      revalidate: 30,
      nullOn404: true,
    });
  },

  agentVersions(slug: string) {
    return request<{ data: AgentVersion[] }>(`/agents/${encodeURIComponent(slug)}/versions`, {
      revalidate: 30,
      nullOn404: true,
    });
  },

  agentRuntime(slug: string) {
    return request<NormalizedAgent>(`/agents/${encodeURIComponent(slug)}/runtime`, {
      revalidate: 30,
      nullOn404: true,
    });
  },

  tools(params: { limit?: number; offset?: number; category?: string; runtime?: string; tag?: string } = {}) {
    return request<RegistryPage<Tool>>(`/tools${query(params)}`, { revalidate: 30 });
  },

  tool(slug: string) {
    return request<Tool>(`/tools/${encodeURIComponent(slug)}`, { revalidate: 30, nullOn404: true });
  },

  toolVersions(slug: string) {
    return request<{ data: ToolVersion[] }>(`/tools/${encodeURIComponent(slug)}/versions`, {
      revalidate: 30,
      nullOn404: true,
    });
  },

  /** Registry search — agents and tools. Distinct from `search()`, which is market-wide. */
  registrySearch(params: { q: string; type?: string; limit?: number; offset?: number }) {
    return request<RegistryPage<RegistryHit>>(`/search${query(params)}`, { revalidate: 30 });
  },

  health() {
    return request<Health>('/health', { revalidate: 5 });
  },

  /** Provider connectivity and cache statistics — the data layer's own health. */
  providers() {
    return request<ProviderHealth>('/api/providers', { revalidate: 30 });
  },
};

/**
 * The runtime supervisor, which runs as its own process and is frequently not
 * running at all. Every call resolves to null on any failure so the Runtime
 * page can render an honest "supervisor offline" state instead of erroring.
 */

export const runtimeApi = {
  async status(): Promise<RuntimeSummary | null> {
    try {
      const response = await fetch(`${RUNTIME_URL}/runtime/status`, {
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) return null;
      return (await response.json()) as RuntimeSummary;
    } catch {
      // Not running, or not reachable. Both are a legitimate local state.
      return null;
    }
  },

  get url(): string {
    return RUNTIME_URL;
  },
};
