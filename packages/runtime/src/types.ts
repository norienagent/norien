import type { AgentManifest, ResolvedTool, RuntimeName } from '@norien-live/sdk';

/**
 * Runtime domain types.
 *
 * Status and health are deliberately separate axes. Status is what the
 * supervisor is doing with the process; health is what the agent reports about
 * itself. A process can be `running` but `unhealthy`, and conflating the two
 * would make that state impossible to express.
 */

/** What the supervisor is doing with the process. */
export type RuntimeStatus =
  | 'installing'
  | 'starting'
  | 'running'
  | 'restarting'
  | 'stopping'
  | 'stopped'
  | 'failed';

/** What the agent reports about itself. */
export type HealthStatus = 'starting' | 'healthy' | 'unhealthy' | 'stopped' | 'failed';

export type LogStream = 'stdout' | 'stderr' | 'system';

export interface LogRecord {
  /** Milliseconds since the epoch; ordering key for merged streams. */
  ts: number;
  stream: LogStream;
  line: string;
  /** Run this line belongs to, so restarts stay distinguishable. */
  runId: string;
}

/** Why a process ended. Kept for crash reporting after the fact. */
export interface ExitInfo {
  code: number | null;
  signal: NodeJS.Signals | null;
  /** Human-readable cause, e.g. "exited with code 1" or "killed by SIGTERM". */
  reason: string;
  at: number;
  /** True when the supervisor asked it to stop. */
  expected: boolean;
}

/** Package managers the executor knows how to launch through. */
export type PackageManager = 'bun' | 'pnpm' | 'yarn' | 'npm' | 'uv' | 'pip' | 'none';

/** The fully resolved launch plan. Recorded so a run is never a mystery. */
export interface ExecutionPlan {
  runtime: RuntimeName;
  /** Binary actually invoked. */
  command: string;
  args: string[];
  cwd: string;
  packageManager: PackageManager;
  /** Where the plan came from, surfaced in `status` and the API. */
  source:
    | 'explicit-command'
    | 'package-script'
    | 'manifest-command'
    | 'interpreter-entrypoint';
  /** Interpreter version detected on this machine, when resolvable. */
  interpreterVersion: string | null;
}

export interface EnvironmentResolution {
  /** Variable names the agent will receive. Values are never exposed. */
  names: string[];
  /** Declared, required, and present. */
  satisfied: string[];
  /** Declared, required, and absent. */
  missing: string[];
  /** Names supplied by the supervisor rather than the developer. */
  injected: string[];
  /** Files the values were read from, in precedence order. */
  sources: string[];
}

export interface PermissionResolution {
  declared: string[];
  granted: string[];
  /** Declared but not granted. Non-empty means execution is refused. */
  missing: string[];
}

export interface DependencyResolution {
  tools: ResolvedTool[];
  missing: string[];
  satisfied: boolean;
  /** Whether the registry was consulted or install metadata was reused. */
  source: 'registry' | 'install-metadata';
}

/** Everything known about one agent's runtime instance. */
export interface RuntimeInstance {
  slug: string;
  version: string;
  directory: string;

  status: RuntimeStatus;
  health: HealthStatus;

  pid: number | null;
  /** Identifier for the current (or most recent) run. */
  runId: string | null;
  startedAt: number | null;
  stoppedAt: number | null;
  uptimeSeconds: number;
  restarts: number;

  manifest: AgentManifest;
  plan: ExecutionPlan | null;
  environment: EnvironmentResolution | null;
  permissions: PermissionResolution | null;
  dependencies: DependencyResolution | null;

  /** Port allocated for HTTP health probing, when the agent needs one. */
  port: number | null;
  exit: ExitInfo | null;
  /** Last health probe outcome, for diagnosis. */
  lastHealthCheck: { at: number; ok: boolean; detail: string } | null;

  logFile: string | null;
}

export interface StartOptions {
  /** Override the resolved command entirely. */
  command?: string;
  /** Extra environment applied on top of the resolved set. */
  env?: Record<string, string>;
  /** Permissions to grant for this run, persisted to the policy file. */
  grant?: string[];
  grantAll?: boolean;
  /** Restart automatically when the process exits non-zero. */
  restartPolicy?: RestartPolicy;
  /** Skip the registry and use install metadata for tool resolution. */
  offline?: boolean;
}

export type RestartPolicy = 'no' | 'on-failure' | 'always';

export interface StopOptions {
  /** Milliseconds to wait after SIGTERM before SIGKILL. */
  timeoutMs?: number;
  /** Skip the graceful signal entirely. */
  force?: boolean;
}

export interface RuntimeConfig {
  /** Directory containing `norien_agents/` and the lockfile. */
  workspace: string;
  /** Registry base URL, used for online dependency resolution. */
  registry?: string;
  /** Handle sent to the registry. */
  actor?: string;
  apiKey?: string;
  /** Seconds between health probes. */
  healthIntervalMs?: number;
  /** Grace period before SIGKILL. */
  stopTimeoutMs?: number;
  /** Log lines retained in memory per agent. */
  logBufferSize?: number;
}
