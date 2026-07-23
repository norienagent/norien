import { type ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

import { RuntimeError } from './errors.js';
import { LogManager } from './log-manager.js';
import type { ExecutionPlan, ExitInfo } from './types.js';

/**
 * Process Manager.
 *
 * Owns child processes and nothing else: spawning, signalling, and reporting
 * how they ended. It knows nothing about manifests, permissions, or health --
 * that separation is what lets the same primitive supervise a remote worker
 * later without dragging local concerns along.
 *
 * Processes are started in their own group so that stopping an agent stops the
 * whole tree. A `pnpm start` that spawns node would otherwise leave the real
 * agent orphaned when the launcher exits.
 */

const DEFAULT_STOP_TIMEOUT_MS = 10_000;

export interface SpawnRequest {
  slug: string;
  runId: string;
  plan: ExecutionPlan;
  env: Record<string, string>;
}

export interface RunningProcess {
  slug: string;
  runId: string;
  pid: number;
  child: ChildProcess;
  startedAt: number;
}

interface ProcessManagerEvents {
  exit: (payload: { slug: string; runId: string; exit: ExitInfo }) => void;
  spawnError: (payload: { slug: string; runId: string; error: Error }) => void;
}

export declare interface ProcessManager {
  on<E extends keyof ProcessManagerEvents>(event: E, listener: ProcessManagerEvents[E]): this;
  emit<E extends keyof ProcessManagerEvents>(
    event: E,
    ...args: Parameters<ProcessManagerEvents[E]>
  ): boolean;
}

export class ProcessManager extends EventEmitter {
  private readonly processes = new Map<string, RunningProcess>();
  /** Slugs the supervisor asked to stop, so an exit can be classed expected. */
  private readonly stopping = new Set<string>();

  constructor(
    private readonly logs: LogManager,
    private readonly options: { stopTimeoutMs?: number } = {},
  ) {
    super();
  }

  get(slug: string): RunningProcess | undefined {
    return this.processes.get(slug);
  }

  isRunning(slug: string): boolean {
    return this.processes.has(slug);
  }

  list(): RunningProcess[] {
    return [...this.processes.values()];
  }

  /**
   * Starts a process and wires its output into the log manager.
   *
   * Resolves as soon as the process is spawned; it does not wait for the agent
   * to become healthy -- that is the health manager's job, and blocking here
   * would make a slow-starting agent look like a failed launch.
   */
  async start(request: SpawnRequest): Promise<RunningProcess> {
    const existing = this.processes.get(request.slug);
    if (existing) throw RuntimeError.alreadyRunning(request.slug, existing.pid);

    const { plan, env, slug, runId } = request;

    // Node refuses to spawn a Windows batch shim (.cmd/.bat) without a shell,
    // and npm/pnpm/yarn/bun all ship as .cmd. Only those need it -- everything
    // else is launched directly, with no shell interpretation of arguments.
    const needsShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(plan.command);

    const child = spawn(plan.command, plan.args, {
      cwd: plan.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      // Own process group, so signals reach the whole tree.
      detached: process.platform !== 'win32',
      windowsHide: true,
      shell: needsShell,
    });

    const startedAt = Date.now();

    // `spawn` reports a missing binary asynchronously, so a failure here is
    // surfaced through the error event rather than a throw.
    const spawned = await new Promise<RunningProcess>((resolve, reject) => {
      const onError = (error: Error) => {
        child.off('spawn', onSpawn);
        this.processes.delete(slug);
        this.emit('spawnError', { slug, runId, error });

        reject(
          new RuntimeError('START_FAILED', `Could not start '${slug}': ${error.message}`, {
            details: [{ field: 'command', message: `${plan.command} ${plan.args.join(' ')}` }],
            hint:
              (error as NodeJS.ErrnoException).code === 'ENOENT'
                ? `'${plan.command}' was not found on PATH.`
                : undefined,
            cause: error,
          }),
        );
      };

      const onSpawn = () => {
        child.off('error', onError);
        resolve({ slug, runId, pid: child.pid as number, child, startedAt });
      };

      child.once('error', onError);
      child.once('spawn', onSpawn);
    });

    this.processes.set(slug, spawned);
    this.attachStreams(spawned);
    this.attachExit(spawned);

    this.logs.system(
      slug,
      runId,
      `started: ${plan.command} ${plan.args.join(' ')} (pid ${spawned.pid})`,
    );

    return spawned;
  }

  /** Pipes stdout/stderr into the log manager, line by line. */
  private attachStreams(running: RunningProcess): void {
    for (const stream of ['stdout', 'stderr'] as const) {
      const source = running.child[stream];
      if (!source) continue;

      let carry = '';
      source.setEncoding('utf8');

      source.on('data', (chunk: string) => {
        const split = LogManager.splitChunk(carry, chunk);
        carry = split.carry;

        for (const line of split.lines) {
          this.logs.append(running.slug, {
            ts: Date.now(),
            stream,
            line,
            runId: running.runId,
          });
        }
      });

      // Flush whatever the process wrote without a trailing newline.
      source.on('end', () => {
        if (carry.trim() !== '') {
          this.logs.append(running.slug, {
            ts: Date.now(),
            stream,
            line: carry,
            runId: running.runId,
          });
          carry = '';
        }
      });
    }
  }

  private attachExit(running: RunningProcess): void {
    running.child.once('exit', (code, signal) => {
      const expected = this.stopping.delete(running.slug);
      this.processes.delete(running.slug);

      const exit: ExitInfo = {
        code,
        signal,
        reason: describeExit(code, signal, expected),
        at: Date.now(),
        expected,
      };

      this.logs.system(running.slug, running.runId, `exited: ${exit.reason}`);
      this.emit('exit', { slug: running.slug, runId: running.runId, exit });
    });
  }

  /**
   * Stops a process: SIGTERM, then SIGKILL if it has not gone within the grace
   * period. Waiting for the actual exit event -- rather than assuming the
   * signal worked -- is what makes `restart` safe to run immediately after.
   */
  async stop(
    slug: string,
    options: { timeoutMs?: number; force?: boolean } = {},
  ): Promise<ExitInfo | null> {
    const running = this.processes.get(slug);
    if (!running) return null;

    const timeoutMs = options.timeoutMs ?? this.options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS;
    this.stopping.add(slug);

    const exited = new Promise<ExitInfo>((resolve) => {
      const handler = (payload: { slug: string; exit: ExitInfo }) => {
        if (payload.slug !== slug) return;
        this.off('exit', handler);
        resolve(payload.exit);
      };
      this.on('exit', handler);
    });

    this.signal(running, options.force ? 'SIGKILL' : 'SIGTERM');

    if (options.force) return exited;

    const escalation = setTimeout(() => {
      if (!this.processes.has(slug)) return;

      this.logs.system(
        slug,
        running.runId,
        `did not exit within ${timeoutMs}ms; sending SIGKILL`,
      );
      this.signal(running, 'SIGKILL');
    }, timeoutMs);

    try {
      return await exited;
    } finally {
      clearTimeout(escalation);
    }
  }

  /**
   * Signals the process group where possible, falling back to the process.
   * Windows has no process groups, so the child is signalled directly.
   */
  private signal(running: RunningProcess, signal: NodeJS.Signals): void {
    try {
      if (process.platform !== 'win32') {
        // Negative pid targets the whole group.
        process.kill(-running.pid, signal);
        return;
      }
    } catch {
      // The group may already be gone; fall through to the direct signal.
    }

    try {
      running.child.kill(signal);
    } catch {
      // Already exited between the check and the signal.
    }
  }

  /** Stops everything. Used on supervisor shutdown. */
  async stopAll(options: { timeoutMs?: number } = {}): Promise<void> {
    await Promise.all(
      [...this.processes.keys()].map((slug) =>
        this.stop(slug, options).catch(() => undefined),
      ),
    );
  }
}

function describeExit(
  code: number | null,
  signal: NodeJS.Signals | null,
  expected: boolean,
): string {
  if (signal) {
    return expected ? `stopped by ${signal}` : `killed by ${signal}`;
  }

  if (code === 0) return 'exited cleanly (code 0)';
  if (code === null) return 'exited for an unknown reason';

  return `exited with code ${code}`;
}
