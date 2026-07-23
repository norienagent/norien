/**
 * Wire types.
 *
 * These mirror the registry's REST contract exactly -- snake_case included --
 * so a response can be handed straight to a caller without a translation layer
 * that would have to be kept in sync with the API.
 */

export type Visibility = 'public' | 'private';
export type RuntimeName = 'node' | 'python';

export interface PageMeta {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
  next_offset: number | null;
}

export interface Page<T> {
  data: T[];
  meta: PageMeta;
}

export interface EnvironmentVariable {
  name: string;
  description?: string;
  required: boolean;
  secret: boolean;
  default?: string;
}

export interface AgentCommands {
  start?: string;
  health?: string;
  [key: string]: string | undefined;
}

/**
 * Where an agent or tool's code lives.
 *
 * The registry distributes manifests, not code bundles; a manifest that
 * declares a source lets the CLI fetch the code at install time. Optional —
 * `http` tools and manifest-only installs carry none.
 */
export interface AgentSource {
  type: 'git';
  url: string;
  /** Tag, branch, or commit. Defaults to the repository's default branch. */
  ref?: string;
  /** Subpath within the repository, when the code is not at the root. */
  directory?: string;
}

export interface AgentManifest {
  name: string;
  version: string;
  description: string;
  runtime: RuntimeName;
  entrypoint: string;
  tools: string[];
  permissions: string[];
  environment: EnvironmentVariable[];
  commands: AgentCommands;
  source?: AgentSource;
  [key: string]: unknown;
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
  entrypoint: string | null;
  runtime: RuntimeName | null;
  commands: Record<string, string>;
  install_command: string;
  api_endpoint: string | null;
  visibility: Visibility;
  manifest: AgentManifest;
  created_at: string;
  updated_at: string;
  /**
   * Not served by the registry today. Declared so clients can render it the
   * moment install counts are exposed, without an SDK release.
   */
  downloads?: number;
}

export interface AgentVersion {
  version: string;
  description: string;
  required_tools: string[];
  permissions: string[];
  entrypoint: string | null;
  runtime: RuntimeName | null;
  commands: Record<string, string>;
  created_at: string;
}

export interface ToolAuthentication {
  type: 'none' | 'api_key' | 'oauth2' | 'bearer' | 'basic' | 'custom';
  location?: 'header' | 'query' | 'body';
  name?: string;
  scopes?: string[];
  description?: string;
  [key: string]: unknown;
}

export type ToolRuntimeName = 'node' | 'python' | 'http';

export interface Tool {
  id: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  category: string;
  author: string;
  tags: string[];
  runtime: ToolRuntimeName | null;
  entrypoint: string | null;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  authentication: ToolAuthentication;
  environment: EnvironmentVariable[];
  permissions: string[];
  dependencies: string[];
  license: string | null;
  homepage: string | null;
  repository: string | null;
  documentation: string | null;
  visibility: Visibility;
  install_command: string;
  created_at: string;
  updated_at: string;
  downloads?: number;
}

export interface ToolVersion {
  version: string;
  description: string;
  runtime: ToolRuntimeName | null;
  entrypoint: string | null;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  authentication: ToolAuthentication;
  environment: EnvironmentVariable[];
  permissions: string[];
  dependencies: string[];
  documentation: string | null;
  created_at: string;
}

export interface ToolInstallResult {
  tool: Tool;
  resolved_version: string;
  dependencies: Tool[];
  install_command: string;
}

export interface ResolvedTool {
  id: string;
  slug: string;
  name: string;
  version: string;
  category: string;
  description: string;
  runtime: ToolRuntimeName | null;
  entrypoint: string | null;
  authentication: ToolAuthentication;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  permissions: string[];
  environment: EnvironmentVariable[];
}

export interface ToolResolution {
  requested: string[];
  resolved: ResolvedTool[];
  missing: string[];
  satisfied: boolean;
}

export interface RuntimeDescriptor {
  name: RuntimeName;
  source: 'declared' | 'inferred';
  entrypoint: string;
  interpreter: string;
  manifest_file: string;
  commands: { start: string; health: string | null };
}

export interface EnvironmentReport {
  variables: EnvironmentVariable[];
  required: string[];
  optional: string[];
  secrets: string[];
  provided: string[];
  missing: string[];
  satisfied: boolean;
}

export interface VersionReport {
  requested: string;
  latest_published: string | null;
  action: 'create' | 'new_version' | 'conflict';
  conflict_reason: string | null;
  acceptable: boolean;
}

export interface Diagnostic {
  level: 'error' | 'warning';
  code: string;
  message: string;
  field?: string;
}

export interface NormalizedAgent {
  slug: string;
  name: string;
  version: string;
  description: string;
  runtime: RuntimeDescriptor;
  permissions: string[];
  dependencies: ToolResolution;
  environment: EnvironmentReport;
  version_check: VersionReport;
  install: { command: string; api_endpoint: string };
  manifest: AgentManifest;
  ready: boolean;
  diagnostics: Diagnostic[];
}

export interface Installation {
  id: string;
  user: string;
  agent: string;
  installed_version: string;
  installed_at: string;
  uninstalled_at: string | null;
}

export interface InstallResult {
  installation: Installation;
  agent: Agent;
  install_command: string;
  manifest: AgentManifest;
  runtime: RuntimeDescriptor;
  dependencies: ToolResolution;
  environment: EnvironmentReport;
  permissions: string[];
  ready: boolean;
  diagnostics: Diagnostic[];
}

export type SearchHit =
  | { type: 'agent'; score: number; item: Agent }
  | { type: 'tool'; score: number; item: Tool };

export interface HealthStatus {
  status: 'ok' | 'degraded';
  version: string;
  environment: string;
  uptime_seconds: number;
  checks: {
    database: { ok: boolean; driver?: string; latency_ms?: number; error?: string };
  };
}

export type PublishResult =
  | { type: 'agent'; agent: Agent }
  | { type: 'tool'; tool: Tool };

// --- Request parameters ---------------------------------------------------

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface ListAgentsParams extends PaginationParams {
  q?: string;
  tag?: string | string[];
  author?: string;
  tool?: string;
  runtime?: RuntimeName;
  visibility?: Visibility;
  sort?: 'created_at' | 'updated_at' | 'name' | 'slug';
  order?: 'asc' | 'desc';
}

export interface ListToolsParams extends PaginationParams {
  q?: string;
  category?: string;
  runtime?: ToolRuntimeName;
  tag?: string | string[];
  author?: string;
  visibility?: Visibility;
  sort?: 'created_at' | 'updated_at' | 'name' | 'slug';
  order?: 'asc' | 'desc';
}

export interface SearchToolsParams extends PaginationParams {
  q: string;
  category?: string;
  runtime?: ToolRuntimeName;
  tag?: string | string[];
  author?: string;
}

export interface SearchParams extends PaginationParams {
  q: string;
  type?: 'all' | 'agent' | 'tool';
  tag?: string | string[];
  category?: string;
  author?: string;
  strategy?: string;
}

/** Environment available to an agent: names, or a name/value map. */
export type ProvidedEnvironment = string[] | Record<string, string>;

export interface InstallParams {
  agent: string;
  version?: string;
  environment?: ProvidedEnvironment;
}

export interface PublishAgentInput {
  slug?: string;
  name?: string;
  description?: string;
  version?: string;
  tags?: string[];
  icon?: string;
  readme?: string;
  permissions?: string[];
  required_tools?: string[];
  environment_variables?: (string | EnvironmentVariable)[];
  entrypoint?: string;
  runtime?: RuntimeName;
  commands?: AgentCommands;
  install_command?: string;
  api_endpoint?: string;
  visibility?: Visibility;
  manifest?: Partial<AgentManifest>;
}

export interface PublishToolInput {
  slug?: string;
  name: string;
  description: string;
  version?: string;
  category?: string;
  tags?: string[];
  runtime?: ToolRuntimeName;
  entrypoint?: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  authentication?: ToolAuthentication;
  environment?: (string | EnvironmentVariable)[];
  permissions?: string[];
  dependencies?: string[];
  license?: string;
  homepage?: string;
  repository?: string;
  documentation?: string;
  visibility?: Visibility;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  tags?: string[];
  icon?: string | null;
  readme?: string | null;
  install_command?: string | null;
  api_endpoint?: string | null;
  visibility?: Visibility;
}

export interface UpdateToolInput {
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  documentation?: string | null;
  visibility?: Visibility;
}
