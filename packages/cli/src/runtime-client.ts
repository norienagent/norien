import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

import axios, { type AxiosInstance } from 'axios';

import {
  DEFAULT_DAEMON_PORT,
  type DaemonRecord,
  clearDaemonRecord,
  isProcessAlive,
  readDaemonRecord,
} from '@norien-live/runtime';
import type { LogRecord, RuntimeInstance, RuntimeStatus } from '@norien-live/runtime';

import { CliError } from './ui.js';

/**
 * Client for the runtime supervisor.
 *
 * The CLI never spawns agents itself: it talks to a supervisor over HTTP, the
 * same way `docker` talks to `dockerd`. That indirection is what makes the
 * agents outlive the terminal, and what makes pointing at a remote runtime a
 * change of URL rather than a change of code.
 */

const require = createRequire(import.meta.url);

export interface RuntimeStatusRow {
  agent: string;
  version: string;
  status: RuntimeStatus;
  health: string;
  pid: number | null;
  uptime_seconds: number;
  restarts: number;
  runtime: string;
  exit: { code: number | null; signal: string | null; reason: string; expected: boolean } | null;
}

export interface RuntimeStatusResponse {
  data: RuntimeStatusRow[];
  summary: Record<RuntimeStatus, number>;
  meta: { total: number };
}

interface RuntimeErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: { field?: string; message: string }[];
    hint?: string | null;
  };
}

export interface RuntimeClientOptions {
  workspace: string;
  /** Explicit runtime URL. Skips discovery and auto-start entirely. */
  host?: string | undefined;
  port?: number | undefined;
  registry?: string | undefined;
  actor?: string | undefined;
  apiKey?: string | undefined;
}

export class RuntimeClient {
  private http: AxiosInstance | null = null;
  private baseUrl: string | null = null;

  constructor(private readonly options: RuntimeClientOptions) {}

  get url(): string | null {
    return this.baseUrl;
  }

  /**
   * Resolves a reachable supervisor, starting one if needed.
   *
   * A recorded daemon whose process has died is cleaned up rather than
   * retried -- a stale lockfile must not make every command hang.
   */
  async connect(options: { autoStart?: boolean } = {}): Promise<string> {
    if (this.baseUrl) return this.baseUrl;

    const explicit = this.options.host ?? process.env.NORIEN_RUNTIME_HOST;
    if (explicit) {
      const url = explicit.startsWith('http') ? explicit : `http://${explicit}`;
      await this.probe(url, { required: true });
      return this.bind(url);
    }

    const record = await readDaemonRecord(this.options.workspace);

    if (record) {
      if (isProcessAlive(record.pid) && (await this.probe(record.url))) {
        return this.bind(record.url);
      }
      await clearDaemonRecord(this.options.workspace);
    }

    if (options.autoStart === false) {
      throw new CliError('The Norien runtime is not running.', {
        exitCode: 6,
        details: ["Start it with: norien runtime start", 'Or run an agent, which starts it automatically.'],
      });
    }

    return this.bind(await this.spawnDaemon());
  }

  private bind(url: string): string {
    this.baseUrl = url.replace(/\/+$/, '');
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 60_000,
      validateStatus: () => true,
      headers: { accept: 'application/json', 'user-agent': '@norien-live/cli' },
    });
    return this.baseUrl;
  }

  private async probe(url: string, options: { required?: boolean } = {}): Promise<boolean> {
    try {
      const response = await axios.get(`${url.replace(/\/+$/, '')}/health`, { timeout: 3000 });
      return response.status === 200;
    } catch (error) {
      if (options.required) {
        throw new CliError(`Could not reach the runtime at ${url}.`, {
          exitCode: 6,
          details: [error instanceof Error ? error.message : String(error)],
        });
      }
      return false;
    }
  }

  /**
   * Starts a detached supervisor and waits for it to answer.
   *
   * Detached and fully unref'd so the CLI can exit while agents keep running;
   * stdio is discarded because the daemon's own logs are the agents' logs.
   */
  private async spawnDaemon(): Promise<string> {
    const entry = require.resolve('@norien-live/runtime/package.json');
    const daemonPath = path.join(path.dirname(entry), 'dist', 'daemon.js');
    const port = this.options.port ?? DEFAULT_DAEMON_PORT;

    const child = spawn(process.execPath, [daemonPath], {
      cwd: this.options.workspace,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: {
        ...process.env,
        NORIEN_WORKSPACE: this.options.workspace,
        NORIEN_RUNTIME_PORT: String(port),
        ...(this.options.registry ? { NORIEN_REGISTRY: this.options.registry } : {}),
        ...(this.options.actor ? { NORIEN_ACTOR: this.options.actor } : {}),
        ...(this.options.apiKey ? { NORIEN_API_KEY: this.options.apiKey } : {}),
      },
    });

    child.unref();

    const deadline = Date.now() + 15_000;
    let record: DaemonRecord | null = null;

    while (Date.now() < deadline) {
      record = await readDaemonRecord(this.options.workspace);
      if (record && (await this.probe(record.url))) return record.url;
      await delay(150);
    }

    throw new CliError('The runtime did not start within 15 seconds.', {
      exitCode: 6,
      details: ['Try starting it in the foreground to see why: norien runtime start --foreground'],
    });
  }

  // --- Requests -----------------------------------------------------------

  private async request<T>(
    method: 'get' | 'post',
    path: string,
    options: { query?: Record<string, unknown>; body?: unknown } = {},
  ): Promise<T> {
    if (!this.http) await this.connect();

    const response = await (this.http as AxiosInstance).request({
      method,
      url: path,
      ...(options.query ? { params: options.query } : {}),
      ...(options.body !== undefined ? { data: options.body } : {}),
    });

    if (response.status >= 200 && response.status < 300) return response.data as T;

    const envelope = response.data as RuntimeErrorEnvelope | undefined;
    const detail = envelope?.error;

    throw new CliError(detail?.message ?? `Runtime request failed (${response.status}).`, {
      exitCode: statusToExitCode(response.status),
      details: [
        ...(detail?.details ?? []).map((entry) =>
          entry.field ? `${entry.field}: ${entry.message}` : entry.message,
        ),
        ...(detail?.hint ? [detail.hint] : []),
      ],
    });
  }

  list(): Promise<{ data: RuntimeInstance[]; meta: { total: number } }> {
    return this.request('get', '/runtime');
  }

  status(): Promise<RuntimeStatusResponse> {
    return this.request('get', '/runtime/status');
  }

  describe(agent: string): Promise<RuntimeInstance> {
    return this.request('get', `/runtime/${encodeURIComponent(agent)}`);
  }

  run(body: Record<string, unknown>): Promise<RuntimeInstance> {
    return this.request('post', '/runtime/run', { body });
  }

  stop(body: Record<string, unknown>): Promise<RuntimeInstance> {
    return this.request('post', '/runtime/stop', { body });
  }

  restart(body: Record<string, unknown>): Promise<RuntimeInstance> {
    return this.request('post', '/runtime/restart', { body });
  }

  logs(query: {
    agent: string;
    limit?: number;
    stream?: string;
    history?: boolean;
  }): Promise<{ data: LogRecord[]; meta: { agent: string; count: number } }> {
    return this.request('get', '/runtime/logs', { query });
  }

  /**
   * Streams logs over server-sent events until the caller aborts.
   *
   * SSE rather than WebSockets: it is plain HTTP, survives proxies, and needs
   * no extra dependency on either side.
   */
  async follow(
    query: { agent: string; limit?: number; stream?: string },
    onRecord: (record: LogRecord) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const base = this.baseUrl ?? (await this.connect());
    const params = new URLSearchParams({
      agent: query.agent,
      follow: 'true',
      limit: String(query.limit ?? 200),
      ...(query.stream ? { stream: query.stream } : {}),
    });

    const response = await fetch(`${base}/runtime/logs?${params}`, { signal });

    if (!response.ok || !response.body) {
      throw new CliError(`Could not stream logs (${response.status}).`, { exitCode: 1 });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) return;

      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line.
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            onRecord(JSON.parse(line.slice(6)) as LogRecord);
          } catch {
            // Keep-alive comments and partial frames are expected.
          }
        }
      }
    }
  }
}

function statusToExitCode(status: number): number {
  if (status === 404) return 4;
  if (status === 403) return 7;
  if (status === 409) return 2;
  if (status === 422) return 5;
  return 1;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
