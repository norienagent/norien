import { EventEmitter } from 'node:events';
import { createServer } from 'node:net';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { DependencyResolver } from './dependency-resolver.js';
import { EnvironmentLoader } from './environment-loader.js';
import { RuntimeError } from './errors.js';
import { ExecutionPlanner } from './execution-planner.js';
import { HealthManager } from './health-manager.js';
import { LogManager } from './log-manager.js';
import { PermissionValidator } from './permission-validator.js';
import { ProcessManager } from './process-manager.js';
import type {
  ExitInfo,
  HealthStatus,
  RestartPolicy,
  RuntimeConfig,
  RuntimeInstance,
  RuntimeStatus,
  StartOptions,
  StopOptions,
} from './types.js';
import {
  type InstalledAgent,
  agentDir,
  listInstalledAgents,
  readInstalledAgent,
  runtimeStateDir,
} from './workspace.js';

/**
 * Runtime Manager.
 *
 * The orchestrator. It owns the lifecycle -- resolve, validate, launch,
 * supervise, recover -- and delegates every mechanism to a focused manager:
 * processes, logs, health, environment, permissions, dependencies, planning.
 *
 * Nothing here spawns, probes, or parses directly; that is what keeps each
 * concern independently testable and lets a remote executor be substituted
 * later by swapping the process manager alone.
 */

const RESTART_BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000];
const MAX_AUTO_RESTARTS = 5;
/** Staying up this long means the next crash is not part of the same loop. */
const CRASH_LOOP_RESET_MS = 60_000;

interface ManagerEvents {
  status: (payload: { slug: string; status: RuntimeStatus; previous: RuntimeStatus }) => void;
  health: (payload: { slug: string; health: HealthStatus }) => void;
  exit: (payload: { slug: string; exit: ExitInfo }) => void;
}

export declare interface RuntimeManager {
  on<E extends keyof ManagerEvents>(event: E, listener: ManagerEvents[E]): this;
  emit<E extends keyof ManagerEvents>(event: E, ...args: Parameters<ManagerEvents[E]>): boolean;
}

/** State persisted per agent so status survives a supervisor restart. */
interface PersistedState {
  slug: string;
  version: string;
  status: RuntimeStatus;
  health: HealthStatus;
  runId: string | null;
  startedAt: number | null;
  stoppedAt: number | null;
  restarts: number;
  exit: ExitInfo | null;
  logFile: string | null;
}

export class RuntimeManager extends EventEmitter {
  readonly logs: LogManager;
  readonly processes: ProcessManager;
  readonly health: HealthManager;
  readonly permissions: PermissionValidator;
  readonly environment: EnvironmentLoader;
  readonly dependencies: DependencyResolver;
  readonly planner: ExecutionPlanner;

  private readonly config: Required<Pick<RuntimeConfig, 'workspace'>> & RuntimeConfig;
  private readonly instances = new Map<string, RuntimeInstance>();
  private readonly restartPolicies = new Map<string, RestartPolicy>();
  private readonly autoRestartCounts = new Map<string, number>();
  private readonly pendingRestarts = new Map<string, NodeJS.Timeout>();
  private readonly startOptions = new Map<string, StartOptions>();

  constructor(config: RuntimeConfig) {
    super();
    this.setMaxListeners(0);
    this.config = { ...config, workspace: path.resolve(config.workspace) };

    this.logs = new LogManager({
      ...(config.logBufferSize !== undefined ? { bufferSize: config.logBufferSize } : {}),
    });
    this.processes = new ProcessManager(this.logs, {
      ...(config.stopTimeoutMs !== undefined ? { stopTimeoutMs: config.stopTimeoutMs } : {}),
    });
    this.health = new HealthManager({
      ...(config.healthIntervalMs !== undefined ? { intervalMs: config.healthIntervalMs } : {}),
    });
    this.permissions = new PermissionValidator(this.config.workspace);
    this.environment = new EnvironmentLoader();
    this.dependencies = new DependencyResolver({
      registry: config.registry,
      actor: config.actor,
      apiKey: config.apiKey,
    });
    this.planner = new ExecutionPlanner();

    this.processes.on('exit', ({ slug, exit }) => void this.handleExit(slug, exit));
    this.health.on('health', ({ slug, status }) => {
      const instance = this.instances.get(slug);
      if (!instance) return;

      instance.health = status;
      instance.lastHealthCheck = this.health.latestResult(slug);
      this.emit('health', { slug, health: status });
      void this.persist(slug);
    });
  }

  get workspace(): string {
    return this.config.workspace;
  }

  // --- Inspection ---------------------------------------------------------

  /**
   * Every installed agent, whether running or not.
   *
   * A stopped agent is still a runtime instance -- it has a manifest, a last
   * exit, and logs -- so `status` shows the whole workspace rather than only
   * what happens to be alive.
   */
  async list(): Promise<RuntimeInstance[]> {
    const installed = await listInstalledAgents(this.config.workspace);
    const result: RuntimeInstance[] = [];

    for (const agent of installed) {
      result.push(await this.describe(agent.slug, agent));
    }

    return result;
  }

  async describe(slug: string, preloaded?: InstalledAgent): Promise<RuntimeInstance> {
    const live = this.instances.get(slug);
    if (live) return this.withDerivedFields(live);

    const agent = preloaded ?? (await readInstalledAgent(this.config.workspace, slug));
    const persisted = await this.readPersisted(slug);

    // Rebuilt from disk rather than invented: an agent this supervisor has
    // never run still reports its real last-known state.
    const instance: RuntimeInstance = {
      slug: agent.slug,
      version: agent.version,
      directory: agent.directory,
      status: persisted?.status === 'running' ? 'stopped' : (persisted?.status ?? 'stopped'),
      health: persisted?.status === 'running' ? 'stopped' : (persisted?.health ?? 'stopped'),
      pid: null,
      runId: persisted?.runId ?? null,
      startedAt: null,
      stoppedAt: persisted?.stoppedAt ?? null,
      uptimeSeconds: 0,
      restarts: persisted?.restarts ?? 0,
      manifest: agent.manifest,
      plan: null,
      environment: null,
      permissions: await this.permissions.resolve(slug, agent.manifest.permissions ?? []),
      dependencies: null,
      port: null,
      exit: persisted?.exit ?? null,
      lastHealthCheck: null,
      logFile: persisted?.logFile ?? null,
    };

    return instance;
  }

  private withDerivedFields(instance: RuntimeInstance): RuntimeInstance {
    return {
      ...instance,
      uptimeSeconds:
        instance.startedAt && instance.status === 'running'
          ? Math.round((Date.now() - instance.startedAt) / 1000)
          : 0,
    };
  }

  // --- Lifecycle ----------------------------------------------------------

  /**
   * Starts an agent.
   *
   * The order is deliberate and every step can refuse the launch: resolve the
   * manifest, grant and check permissions, resolve tools, plan the command,
   * build and validate the environment. Only then is a process spawned, so a
   * misconfigured agent fails before anything runs rather than half-starting.
   */
  async start(slug: string, options: StartOptions = {}): Promise<RuntimeInstance> {
    // An operator-initiated start clears the crash-loop counter; an automatic
    // restart must not, or the attempt cap could never be reached.
    return this.startInternal(slug, options, { auto: false });
  }

  private async startInternal(
    slug: string,
    options: StartOptions,
    context: { auto: boolean },
  ): Promise<RuntimeInstance> {
    const existing = this.processes.get(slug);
    if (existing) throw RuntimeError.alreadyRunning(slug, existing.pid);

    this.cancelPendingRestart(slug);
    if (!context.auto) this.autoRestartCounts.delete(slug);

    const agent = await readInstalledAgent(this.config.workspace, slug);
    const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;

    const instance: RuntimeInstance = {
      slug: agent.slug,
      version: agent.version,
      directory: agent.directory,
      status: 'starting',
      health: 'starting',
      pid: null,
      runId,
      startedAt: null,
      stoppedAt: null,
      uptimeSeconds: 0,
      restarts: this.instances.get(slug)?.restarts ?? 0,
      manifest: agent.manifest,
      plan: null,
      environment: null,
      permissions: null,
      dependencies: null,
      port: null,
      exit: null,
      lastHealthCheck: null,
      logFile: null,
    };

    this.instances.set(slug, instance);
    this.startOptions.set(slug, options);
    this.restartPolicies.set(slug, options.restartPolicy ?? 'no');

    const logFile = await this.logs.openRun(slug, agent.directory, runId);
    instance.logFile = logFile;
    this.logs.system(slug, runId, `preparing ${slug}@${agent.version}`);

    try {
      // 1. Permissions -- grants first, so `--grant` takes effect this run.
      const declared = agent.manifest.permissions ?? [];
      if (options.grantAll && declared.length > 0) {
        await this.permissions.grant(slug, declared);
      } else if (options.grant && options.grant.length > 0) {
        await this.permissions.grant(slug, options.grant);
      }

      const permissions = await this.permissions.resolve(slug, declared);
      instance.permissions = permissions;
      this.permissions.assertSatisfied(slug, permissions);
      this.logs.system(
        slug,
        runId,
        `permissions granted: ${permissions.granted.join(', ') || 'none required'}`,
      );

      // 2. Tools.
      const dependencies = await this.dependencies.resolve({
        slug,
        agentDirectory: agent.directory,
        declared: agent.manifest.tools ?? [],
        ...(options.offline !== undefined ? { offline: options.offline } : {}),
      });
      instance.dependencies = dependencies;
      this.dependencies.assertSatisfied(slug, dependencies);
      this.logs.system(
        slug,
        runId,
        `tools resolved from ${dependencies.source}: ${
          dependencies.tools.map((tool) => `${tool.slug}@${tool.version}`).join(', ') || 'none'
        }`,
      );

      // 2b. A tool may not require capabilities the agent itself was not
      // granted -- otherwise a tool could quietly widen an agent's reach.
      this.assertToolPermissions(slug, dependencies, permissions.granted);

      // 3. Execution plan.
      const plan = await this.planner.plan({
        manifest: agent.manifest,
        agentDirectory: agent.directory,
        ...(options.command !== undefined ? { explicitCommand: options.command } : {}),
      });
      instance.plan = plan;
      this.logs.system(
        slug,
        runId,
        `execution plan (${plan.source}): ${plan.command} ${plan.args.join(' ')}`,
      );

      // 4. Port, allocated only when an HTTP health probe needs one.
      const probe = HealthManager.describeProbe(agent.manifest.commands?.health);
      const port =
        probe.kind === 'http' && !/^https?:\/\//i.test(probe.target ?? '')
          ? await allocatePort()
          : null;
      instance.port = port;

      // 5. Environment and tool injection.
      const loaded = await this.environment.load({
        slug,
        version: agent.version,
        agentDirectory: agent.directory,
        workspace: this.config.workspace,
        manifest: agent.manifest,
        tools: dependencies.tools,
        grantedPermissions: permissions.granted,
        registry: this.config.registry,
        ...(port !== null ? { port } : {}),
        ...(options.env ? { overrides: options.env } : {}),
      });

      instance.environment = loaded.resolution;
      this.environment.validate(loaded.resolution, {
        slug,
        agentDirectory: agent.directory,
        declared: agent.manifest.environment ?? [],
      });

      // 6. Spawn. The child inherits PATH etc. from the supervisor, with the
      // agent's resolved values layered on top.
      const running = await this.processes.start({
        slug,
        runId,
        plan,
        env: { ...filterUndefined(process.env), ...loaded.values },
      });

      instance.pid = running.pid;
      instance.startedAt = running.startedAt;
      this.setStatus(instance, 'running');
      instance.health = 'starting';

      this.health.watch({
        slug,
        probe,
        port,
        cwd: plan.cwd,
        env: { ...filterUndefined(process.env), ...loaded.values },
        isAlive: () => this.processes.isRunning(slug),
      });

      await this.persist(slug);
      return this.withDerivedFields(instance);
    } catch (error) {
      // A refused launch is a failure with a reason, not a silent no-op.
      instance.status = 'failed';
      instance.health = 'failed';
      instance.stoppedAt = Date.now();

      const reason = error instanceof RuntimeError ? error.format() : String(error);
      this.logs.system(slug, runId, `failed to start: ${reason}`);

      await this.persist(slug);
      await this.logs.closeRun(slug);

      throw error;
    }
  }

  async stop(slug: string, options: StopOptions = {}): Promise<RuntimeInstance> {
    this.cancelPendingRestart(slug);

    const instance = this.instances.get(slug);
    const running = this.processes.get(slug);

    if (!running) {
      // Stopping something already stopped is not an error worth failing on,
      // but a caller that never started it deserves to be told.
      if (!instance) throw RuntimeError.notRunning(slug);

      instance.status = 'stopped';
      instance.health = 'stopped';
      await this.persist(slug);
      return this.withDerivedFields(instance);
    }

    if (instance) this.setStatus(instance, 'stopping');
    // Suppress auto-restart for a stop the operator asked for.
    this.restartPolicies.set(slug, 'no');
    this.health.stop(slug);

    await this.processes.stop(slug, options);

    const settled = this.instances.get(slug);
    if (!settled) throw RuntimeError.notRunning(slug);

    return this.withDerivedFields(settled);
  }

  /**
   * Restarts an agent, reusing the options it was started with so a restart
   * reproduces the original run rather than a default one.
   */
  async restart(slug: string, options: StartOptions = {}): Promise<RuntimeInstance> {
    const previous = this.startOptions.get(slug) ?? {};
    const instance = this.instances.get(slug);

    if (this.processes.isRunning(slug)) {
      if (instance) this.setStatus(instance, 'restarting');
      await this.stop(slug);
    }

    const merged: StartOptions = { ...previous, ...options };
    const restarted = await this.startInternal(slug, merged, { auto: false });

    restarted.restarts += 1;
    const live = this.instances.get(slug);
    if (live) live.restarts = restarted.restarts;

    await this.persist(slug);
    return restarted;
  }

  /** Stops everything and releases timers. Used on supervisor shutdown. */
  async shutdown(): Promise<void> {
    for (const timer of this.pendingRestarts.values()) clearTimeout(timer);
    this.pendingRestarts.clear();

    this.health.stopAll();
    await this.processes.stopAll();
    await this.logs.closeAll();
  }

  // --- Crash handling -----------------------------------------------------

  /**
   * Reacts to a process ending.
   *
   * An expected stop settles quietly. An unexpected exit is a crash: the code,
   * signal, and reason are recorded and the logs are kept, so `norien status`
   * and `norien logs` can explain what happened after the fact.
   */
  private async handleExit(slug: string, exit: ExitInfo): Promise<void> {
    const instance = this.instances.get(slug);
    this.health.stop(slug);

    if (instance) {
      instance.pid = null;
      instance.exit = exit;
      instance.stoppedAt = exit.at;
      instance.uptimeSeconds = instance.startedAt
        ? Math.round((exit.at - instance.startedAt) / 1000)
        : 0;

      const crashed = !exit.expected && exit.code !== 0;
      this.setStatus(instance, crashed ? 'failed' : 'stopped');
      instance.health = crashed ? 'failed' : 'stopped';

      await this.persist(slug);
    }

    this.emit('exit', { slug, exit });
    await this.logs.closeRun(slug);

    if (!exit.expected && exit.code !== 0) {
      // A process that stayed up past the stability window crashed on its own
      // terms rather than failing to start, so the counter starts fresh.
      const uptimeMs = instance?.startedAt ? exit.at - instance.startedAt : 0;
      if (uptimeMs >= CRASH_LOOP_RESET_MS) this.autoRestartCounts.delete(slug);

      await this.considerAutoRestart(slug, exit);
    } else {
      this.autoRestartCounts.delete(slug);
    }
  }

  /**
   * Auto-restart, when a policy asks for it.
   *
   * Backoff is capped and attempts are bounded: an agent that crashes on
   * startup must not become an infinite spawn loop.
   */
  private async considerAutoRestart(slug: string, exit: ExitInfo): Promise<void> {
    const policy = this.restartPolicies.get(slug) ?? 'no';
    if (policy === 'no') return;
    if (policy === 'on-failure' && exit.code === 0) return;

    const attempts = (this.autoRestartCounts.get(slug) ?? 0) + 1;

    if (attempts > MAX_AUTO_RESTARTS) {
      this.logs.system(
        slug,
        this.instances.get(slug)?.runId ?? 'supervisor',
        `giving up after ${MAX_AUTO_RESTARTS} automatic restarts`,
      );
      this.autoRestartCounts.delete(slug);
      return;
    }

    this.autoRestartCounts.set(slug, attempts);

    const delay = RESTART_BACKOFF_MS[Math.min(attempts - 1, RESTART_BACKOFF_MS.length - 1)] as number;
    const instance = this.instances.get(slug);
    if (instance) this.setStatus(instance, 'restarting');

    this.logs.system(
      slug,
      instance?.runId ?? 'supervisor',
      `restarting in ${delay}ms (attempt ${attempts}/${MAX_AUTO_RESTARTS})`,
    );

    const timer = setTimeout(() => {
      this.pendingRestarts.delete(slug);
      const options = this.startOptions.get(slug) ?? {};

      void this.startInternal(slug, options, { auto: true }).catch((error: unknown) => {
        this.logs.system(
          slug,
          'supervisor',
          `automatic restart failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, delay);

    timer.unref?.();
    this.pendingRestarts.set(slug, timer);
  }

  /** Cancels a scheduled restart. Leaves the attempt counter alone. */
  /**
   * Refuses to launch an agent whose tools demand permissions the agent was
   * not granted. A tool's capabilities must sit within its host agent's.
   */
  private assertToolPermissions(
    slug: string,
    dependencies: { tools: { slug: string; permissions?: string[] }[] },
    granted: readonly string[],
  ): void {
    const offenders: { field: string; message: string }[] = [];

    for (const tool of dependencies.tools) {
      for (const permission of tool.permissions ?? []) {
        if (!isCovered(permission, granted)) {
          offenders.push({
            field: 'permissions',
            message: `tool '${tool.slug}' requires '${permission}', which '${slug}' has not been granted`,
          });
        }
      }
    }

    if (offenders.length > 0) {
      throw new RuntimeError(
        'PERMISSION_DENIED',
        `'${slug}' uses tools that require permissions it does not hold.`,
        {
          details: offenders,
          hint: `Grant them to the agent: norien run ${slug} ${[
            ...new Set(offenders.map((o) => o.message.match(/requires '([^']+)'/)?.[1])),
          ]
            .filter(Boolean)
            .map((p) => `--grant ${p}`)
            .join(' ')}`,
        },
      );
    }
  }

  private cancelPendingRestart(slug: string): void {
    const timer = this.pendingRestarts.get(slug);
    if (timer) {
      clearTimeout(timer);
      this.pendingRestarts.delete(slug);
    }
  }

  private setStatus(instance: RuntimeInstance, status: RuntimeStatus): void {
    const previous = instance.status;
    if (previous === status) return;

    instance.status = status;
    this.emit('status', { slug: instance.slug, status, previous });
  }

  // --- Persistence --------------------------------------------------------

  private statePath(slug: string): string {
    return path.join(runtimeStateDir(this.config.workspace, slug), 'state.json');
  }

  private async persist(slug: string): Promise<void> {
    const instance = this.instances.get(slug);
    if (!instance) return;

    const snapshot: PersistedState = {
      slug: instance.slug,
      version: instance.version,
      status: instance.status,
      health: instance.health,
      runId: instance.runId,
      startedAt: instance.startedAt,
      stoppedAt: instance.stoppedAt,
      restarts: instance.restarts,
      exit: instance.exit,
      logFile: instance.logFile,
    };

    try {
      await mkdir(runtimeStateDir(this.config.workspace, slug), { recursive: true });
      await writeFile(this.statePath(slug), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    } catch {
      // State is a convenience for reporting; failing to write it must never
      // take down a running agent.
    }
  }

  private async readPersisted(slug: string): Promise<PersistedState | null> {
    try {
      return JSON.parse(await readFile(this.statePath(slug), 'utf8')) as PersistedState;
    } catch {
      return null;
    }
  }
}

/** Reserves a free ephemeral port by binding and immediately releasing it. */
async function allocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a port.'));
        return;
      }

      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

/** `network:*` covers `network:fetch`; an exact match always covers itself. */
function isCovered(permission: string, granted: readonly string[]): boolean {
  if (granted.includes(permission)) return true;
  return granted.some((entry) => entry.endsWith('*') && permission.startsWith(entry.slice(0, -1)));
}

function filterUndefined(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

export { agentDir };
