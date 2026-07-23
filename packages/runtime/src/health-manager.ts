import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { promisify } from 'node:util';

import { tokenize } from './execution-planner.js';
import type { HealthStatus } from './types.js';

const run = promisify(execFile);

/**
 * Health Manager.
 *
 * `commands.health` in agent.json is either an HTTP path (`/health`) or a
 * shell command (`python -m trader.health`). Both are supported because both
 * are idiomatic: long-running HTTP agents expose an endpoint, while worker
 * agents expose a check script.
 *
 * An agent that declares no health command is reported `healthy` while its
 * process is alive -- that is genuinely all the supervisor knows, and claiming
 * more would be a fabrication.
 */

const DEFAULT_INTERVAL_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 5_000;
/** Consecutive failures tolerated before an agent is marked unhealthy. */
const DEFAULT_FAILURE_THRESHOLD = 3;
/** Probing starts only after this grace period, so slow boots are not failures. */
const DEFAULT_START_GRACE_MS = 3_000;

export type HealthProbeKind = 'http' | 'command' | 'process';

export interface HealthProbe {
  kind: HealthProbeKind;
  /** The path or command being probed; null for a bare liveness check. */
  target: string | null;
}

export interface HealthResult {
  ok: boolean;
  detail: string;
  at: number;
}

export interface HealthWatchInput {
  slug: string;
  probe: HealthProbe;
  port: number | null;
  cwd: string;
  env: Record<string, string>;
  /** Reports whether the process is still alive. */
  isAlive: () => boolean;
}

interface HealthManagerEvents {
  health: (payload: { slug: string; status: HealthStatus; result: HealthResult }) => void;
}

export declare interface HealthManager {
  on<E extends keyof HealthManagerEvents>(event: E, listener: HealthManagerEvents[E]): this;
  emit<E extends keyof HealthManagerEvents>(
    event: E,
    ...args: Parameters<HealthManagerEvents[E]>
  ): boolean;
}

export class HealthManager extends EventEmitter {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly failures = new Map<string, number>();
  private readonly latest = new Map<string, HealthResult>();

  constructor(
    private readonly options: {
      intervalMs?: number;
      timeoutMs?: number;
      failureThreshold?: number;
      startGraceMs?: number;
    } = {},
  ) {
    super();
    this.setMaxListeners(0);
  }

  /** Classifies a manifest health command into a probe. */
  static describeProbe(healthCommand: string | null | undefined): HealthProbe {
    const command = healthCommand?.trim();
    if (!command) return { kind: 'process', target: null };

    // A path or URL means HTTP; anything else is a command to execute.
    if (command.startsWith('/') || /^https?:\/\//i.test(command)) {
      return { kind: 'http', target: command };
    }

    return { kind: 'command', target: command };
  }

  latestResult(slug: string): HealthResult | null {
    return this.latest.get(slug) ?? null;
  }

  /**
   * Begins periodic probing. Emits only on transitions plus the first result,
   * so a stable agent does not flood the event stream.
   */
  watch(input: HealthWatchInput): void {
    this.stop(input.slug);
    this.failures.set(input.slug, 0);

    const interval = this.options.intervalMs ?? DEFAULT_INTERVAL_MS;
    const grace = this.options.startGraceMs ?? DEFAULT_START_GRACE_MS;
    const threshold = this.options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;

    let previous: HealthStatus | null = null;

    const tick = async (): Promise<void> => {
      if (!input.isAlive()) {
        this.stop(input.slug);
        return;
      }

      const result = await this.probe(input);
      this.latest.set(input.slug, result);

      const failures = result.ok ? 0 : (this.failures.get(input.slug) ?? 0) + 1;
      this.failures.set(input.slug, failures);

      // Transient blips must not flap the status, so a run of failures is
      // required before an agent is declared unhealthy.
      const status: HealthStatus = result.ok
        ? 'healthy'
        : failures >= threshold
          ? 'unhealthy'
          : (previous ?? 'starting');

      if (status !== previous) {
        previous = status;
        this.emit('health', { slug: input.slug, status, result });
      }
    };

    const timer = setTimeout(() => {
      void tick();

      const repeating = setInterval(() => void tick(), interval);
      // Never hold the event loop open for a health timer.
      repeating.unref?.();
      this.timers.set(input.slug, repeating);
    }, grace);

    timer.unref?.();
    this.timers.set(input.slug, timer);
  }

  stop(slug: string): void {
    const timer = this.timers.get(slug);
    if (timer) {
      clearTimeout(timer);
      clearInterval(timer);
      this.timers.delete(slug);
    }
    this.failures.delete(slug);
  }

  stopAll(): void {
    for (const slug of [...this.timers.keys()]) this.stop(slug);
  }

  /** Runs one probe. Never throws: a failed probe is a result, not an error. */
  async probe(input: HealthWatchInput): Promise<HealthResult> {
    const at = Date.now();
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (!input.isAlive()) {
      return { ok: false, detail: 'process is not running', at };
    }

    if (input.probe.kind === 'process') {
      return { ok: true, detail: 'process is alive (no health command declared)', at };
    }

    if (input.probe.kind === 'http') {
      return this.probeHttp(input, timeoutMs, at);
    }

    return this.probeCommand(input, timeoutMs, at);
  }

  private async probeHttp(
    input: HealthWatchInput,
    timeoutMs: number,
    at: number,
  ): Promise<HealthResult> {
    const target = input.probe.target as string;

    const url = /^https?:\/\//i.test(target)
      ? target
      : input.port
        ? `http://127.0.0.1:${input.port}${target}`
        : null;

    if (!url) {
      return {
        ok: false,
        detail: `cannot probe '${target}': no port was allocated for this agent`,
        at,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });
      return {
        ok: response.ok,
        detail: `GET ${url} -> ${response.status}`,
        at,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { ok: false, detail: `GET ${url} failed: ${reason}`, at };
    } finally {
      clearTimeout(timer);
    }
  }

  private async probeCommand(
    input: HealthWatchInput,
    timeoutMs: number,
    at: number,
  ): Promise<HealthResult> {
    const [command, ...args] = tokenize(input.probe.target as string);

    try {
      await run(command as string, args, {
        cwd: input.cwd,
        env: input.env,
        timeout: timeoutMs,
        windowsHide: true,
      });

      return { ok: true, detail: `${input.probe.target} -> exit 0`, at };
    } catch (error) {
      const failure = error as { code?: number | string; killed?: boolean; message?: string };
      const detail = failure.killed
        ? `${input.probe.target} timed out after ${timeoutMs}ms`
        : `${input.probe.target} -> exit ${failure.code ?? 'unknown'}`;

      return { ok: false, detail, at };
    }
  }
}
