import { HttpTransport, type NorienClientOptions } from './http.js';
import {
  AgentsResource,
  InstallationsResource,
  RuntimeResource,
  ToolsResource,
} from './resources.js';
import {
  ChainResource,
  ContractsResource,
  MarketSearchResource,
  ProjectsResource,
  TokensResource,
  WalletsResource,
} from './data-resources.js';
import type {
  Agent,
  HealthStatus,
  InstallParams,
  InstallResult,
  Page,
  PublishAgentInput,
  PublishResult,
  PublishToolInput,
  SearchHit,
  SearchParams,
} from './types.js';

/**
 * The Norien registry client.
 *
 * ```ts
 * const client = new Norien(API_KEY);
 *
 * await client.search('trading');
 * await client.info('trading-agent');
 * await client.install({ agent: 'trading-agent' });
 * await client.publish({ manifest });
 * ```
 *
 * Grouped resources (`client.agents`, `client.tools`, …) expose the full REST
 * surface; the top-level methods are the shorthands for the common workflow.
 */
export class NorienClient {
  readonly agents: AgentsResource;
  readonly tools: ToolsResource;
  readonly runtime: RuntimeResource;
  readonly installations: InstallationsResource;

  // Market-data resources, backed by the unified `/api/*` surface.
  readonly tokens: TokensResource;
  readonly projects: ProjectsResource;
  readonly contracts: ContractsResource;
  readonly wallets: WalletsResource;
  readonly chain: ChainResource;
  /** Global product search. `client.search()` searches the registry instead. */
  readonly market: MarketSearchResource;

  private readonly http: HttpTransport;

  /** Accepts a bare API key or a full options object. */
  constructor(options: string | NorienClientOptions = {}) {
    const resolved: NorienClientOptions =
      typeof options === 'string' ? { apiKey: options } : options;

    this.http = new HttpTransport(resolved);
    this.agents = new AgentsResource(this.http);
    this.tools = new ToolsResource(this.http);
    this.runtime = new RuntimeResource(this.http);
    this.installations = new InstallationsResource(this.http);

    this.tokens = new TokensResource(this.http);
    this.projects = new ProjectsResource(this.http);
    this.contracts = new ContractsResource(this.http);
    this.wallets = new WalletsResource(this.http);
    this.chain = new ChainResource(this.http);
    this.market = new MarketSearchResource(this.http);
  }

  get baseUrl(): string {
    return this.http.baseUrl;
  }

  get actor(): string | undefined {
    return this.http.actor;
  }

  health(): Promise<HealthStatus> {
    return this.http.get<HealthStatus>('/health');
  }

  /**
   * Ranked search across agents and tools. Accepts a bare term for the common
   * case, or a params object for filtering.
   */
  search(query: string | SearchParams): Promise<Page<SearchHit>> {
    const params: SearchParams = typeof query === 'string' ? { q: query } : query;
    return this.http.get<Page<SearchHit>>('/search', params);
  }

  /** Full detail for one agent. `version` accepts an exact version or a range. */
  info(slug: string, options: { version?: string } = {}): Promise<Agent> {
    return this.agents.get(slug, options);
  }

  /**
   * Installs an agent and returns everything needed to run it: install command,
   * manifest, runtime, resolved tools, and environment readiness.
   */
  install(params: InstallParams | string): Promise<InstallResult> {
    const body = typeof params === 'string' ? { agent: params } : params;
    return this.http.post<InstallResult>('/install', body);
  }

  uninstall(agent: string): Promise<void> {
    return this.installations.uninstall(agent);
  }

  /**
   * Publishes an agent or a tool. Creates on first publish and appends an
   * immutable version thereafter. The `type` is inferred when the payload is
   * unambiguous (a `manifest` implies an agent; `input_schema` implies a tool).
   */
  publish(input: PublishAgentInput | PublishToolInput | Record<string, unknown>): Promise<PublishResult> {
    return this.http.post<PublishResult>('/publish', input);
  }

  /**
   * Walks every page of a paginated endpoint.
   *
   * ```ts
   * for await (const agent of client.paginate((p) => client.agents.list(p))) { … }
   * ```
   */
  async *paginate<T>(
    fetchPage: (params: { limit: number; offset: number }) => Promise<Page<T>>,
    options: { pageSize?: number } = {},
  ): AsyncGenerator<T, void, undefined> {
    const limit = options.pageSize ?? 50;
    let offset = 0;

    for (;;) {
      const page = await fetchPage({ limit, offset });
      for (const item of page.data) yield item;

      if (!page.meta.has_more || page.meta.next_offset === null) return;
      // Trust the server's cursor rather than recomputing it here.
      offset = page.meta.next_offset;
    }
  }
}

/** Ergonomic alias: `new Norien(API_KEY)`. */
export const Norien = NorienClient;
export type Norien = NorienClient;
