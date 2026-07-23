import type { HttpTransport } from './http.js';
import type {
  Agent,
  AgentManifest,
  AgentVersion,
  Installation,
  ListAgentsParams,
  ListToolsParams,
  NormalizedAgent,
  Page,
  PaginationParams,
  ProvidedEnvironment,
  PublishToolInput,
  SearchToolsParams,
  Tool,
  ToolInstallResult,
  ToolVersion,
  UpdateAgentInput,
  UpdateToolInput,
} from './types.js';

/**
 * Resource groups.
 *
 * Each method is a thin, faithful mapping onto one REST endpoint -- no
 * client-side aggregation, no invented behaviour. Anything more elaborate
 * belongs in the CLI, where it can be seen and tested as a workflow.
 */

export class AgentsResource {
  constructor(private readonly http: HttpTransport) {}

  list(params: ListAgentsParams = {}): Promise<Page<Agent>> {
    return this.http.get<Page<Agent>>('/agents', params);
  }

  /** `version` accepts an exact version or a semver range. */
  get(slug: string, options: { version?: string } = {}): Promise<Agent> {
    return this.http.get<Agent>(`/agents/${encodeURIComponent(slug)}`, options);
  }

  versions(slug: string, params: PaginationParams = {}): Promise<Page<AgentVersion>> {
    return this.http.get<Page<AgentVersion>>(
      `/agents/${encodeURIComponent(slug)}/versions`,
      params,
    );
  }

  /**
   * The normalized runtime object: detected runtime, resolved tools, and
   * environment readiness. `environment` asks "could this run with these
   * variables set?" -- only names are transmitted.
   */
  runtime(
    slug: string,
    options: { environment?: string[] } = {},
  ): Promise<NormalizedAgent> {
    return this.http.get<NormalizedAgent>(`/agents/${encodeURIComponent(slug)}/runtime`, {
      ...(options.environment ? { environment: options.environment.join(',') } : {}),
    });
  }

  update(slug: string, input: UpdateAgentInput): Promise<Agent> {
    return this.http.patch<Agent>(`/agents/${encodeURIComponent(slug)}`, input);
  }

  delete(slug: string): Promise<void> {
    return this.http.delete<void>(`/agents/${encodeURIComponent(slug)}`);
  }
}

export class ToolsResource {
  constructor(private readonly http: HttpTransport) {}

  list(params: ListToolsParams = {}): Promise<Page<Tool>> {
    return this.http.get<Page<Tool>>('/tools', params);
  }

  /** Ranked marketplace search restricted to tools. */
  search(query: string | SearchToolsParams): Promise<Page<Tool>> {
    const params: SearchToolsParams = typeof query === 'string' ? { q: query } : query;
    return this.http.get<Page<Tool>>('/tools/search', params);
  }

  /** Full detail for one tool. */
  info(slug: string): Promise<Tool> {
    return this.http.get<Tool>(`/tools/${encodeURIComponent(slug)}`);
  }

  /** Alias of `info`, matching the agents resource. */
  get(slug: string): Promise<Tool> {
    return this.info(slug);
  }

  versions(slug: string, params: PaginationParams = {}): Promise<Page<ToolVersion>> {
    return this.http.get<Page<ToolVersion>>(
      `/tools/${encodeURIComponent(slug)}/versions`,
      params,
    );
  }

  /**
   * Publishes or versions a tool from a tool.json manifest. Creates on first
   * publish and appends an immutable version thereafter.
   */
  publish(input: PublishToolInput): Promise<Tool> {
    return this.http.post<Tool>('/tools/publish', input);
  }

  /**
   * Resolves a tool for installation: the full manifest at a concrete version,
   * plus its dependency tools, in one round trip.
   */
  install(slug: string, options: { version?: string } = {}): Promise<ToolInstallResult> {
    return this.http.post<ToolInstallResult>('/tools/install', {
      tool: slug,
      ...(options.version ? { version: options.version } : {}),
    });
  }

  create(input: PublishToolInput): Promise<Tool> {
    return this.http.post<Tool>('/tools', input);
  }

  update(slug: string, input: UpdateToolInput): Promise<Tool> {
    return this.http.patch<Tool>(`/tools/${encodeURIComponent(slug)}`, input);
  }

  delete(slug: string): Promise<void> {
    return this.http.delete<void>(`/tools/${encodeURIComponent(slug)}`);
  }
}

export class RuntimeResource {
  constructor(private readonly http: HttpTransport) {}

  /**
   * Validates an `agent.json` without publishing it -- the pre-flight the CLI
   * runs before upload. Structural problems throw; an unsatisfiable manifest
   * resolves with `ready: false` and the reasons in `diagnostics`.
   */
  inspect(
    manifest: Partial<AgentManifest> | Record<string, unknown>,
    options: { environment?: ProvidedEnvironment; slug?: string } = {},
  ): Promise<NormalizedAgent> {
    return this.http.post<NormalizedAgent>('/runtime/inspect', {
      manifest,
      ...(options.environment ? { environment: options.environment } : {}),
      ...(options.slug ? { slug: options.slug } : {}),
    });
  }
}

export class InstallationsResource {
  constructor(private readonly http: HttpTransport) {}

  list(
    params: PaginationParams & { include_uninstalled?: boolean } = {},
  ): Promise<Page<Installation>> {
    return this.http.get<Page<Installation>>(
      '/installations',
      params,
    );
  }

  uninstall(agent: string): Promise<void> {
    return this.http.post<void>('/uninstall', { agent });
  }
}
