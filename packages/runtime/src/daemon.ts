#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { RuntimeManager } from './manager.js';
import { buildRuntimeServer } from './server.js';
import { RUNTIME_STATE_DIRNAME } from './workspace.js';

/**
 * Runtime daemon.
 *
 * A long-lived supervisor for one workspace. Started on demand by the CLI and
 * left running so agents outlive the terminal that launched them -- the same
 * relationship `docker` has with `dockerd`.
 *
 * One daemon per workspace, recorded in a lockfile beside the agents so the
 * CLI can find (or adopt) a running one instead of starting a second.
 */

export const DEFAULT_DAEMON_PORT = 4123;

export interface DaemonRecord {
  pid: number;
  port: number;
  host: string;
  url: string;
  workspace: string;
  startedAt: string;
  version: string;
}

export function daemonRecordPath(workspace: string): string {
  return path.join(workspace, RUNTIME_STATE_DIRNAME, 'daemon.json');
}

export async function readDaemonRecord(workspace: string): Promise<DaemonRecord | null> {
  try {
    return JSON.parse(await readFile(daemonRecordPath(workspace), 'utf8')) as DaemonRecord;
  } catch {
    return null;
  }
}

export async function writeDaemonRecord(record: DaemonRecord): Promise<void> {
  const file = daemonRecordPath(record.workspace);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

export async function clearDaemonRecord(workspace: string): Promise<void> {
  await rm(daemonRecordPath(workspace), { force: true });
}

/** True when a recorded daemon process is still alive. */
export function isProcessAlive(pid: number): boolean {
  try {
    // Signal 0 performs the permission and existence check without delivering.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export interface StartDaemonOptions {
  workspace: string;
  host?: string;
  port?: number;
  registry?: string | undefined;
  actor?: string | undefined;
  apiKey?: string | undefined;
  logger?: boolean;
}

/**
 * Boots the supervisor and its HTTP control plane.
 *
 * Binding to loopback by default is deliberate: this API can execute arbitrary
 * local processes, so it must not be reachable from the network without an
 * explicit, considered choice.
 */
export async function startDaemon(options: StartDaemonOptions): Promise<{
  record: DaemonRecord;
  close: () => Promise<void>;
}> {
  const workspace = path.resolve(options.workspace);
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? DEFAULT_DAEMON_PORT;

  const manager = new RuntimeManager({
    workspace,
    ...(options.registry ? { registry: options.registry } : {}),
    ...(options.actor ? { actor: options.actor } : {}),
    ...(options.apiKey ? { apiKey: options.apiKey } : {}),
  });

  const app = await buildRuntimeServer({
    manager,
    ...(options.logger !== undefined ? { logger: options.logger } : {}),
  });

  await app.listen({ host, port });

  const address = app.server.address();
  const boundPort = address && typeof address !== 'string' ? address.port : port;

  const record: DaemonRecord = {
    pid: process.pid,
    port: boundPort,
    host,
    url: `http://${host}:${boundPort}`,
    workspace,
    startedAt: new Date().toISOString(),
    version: '0.1.0',
  };

  await writeDaemonRecord(record);

  const close = async (): Promise<void> => {
    // Agents are stopped before the API closes, so nothing is orphaned.
    await manager.shutdown();
    await app.close();
    await clearDaemonRecord(workspace);
  };

  return { record, close };
}

// --- Process entrypoint ---------------------------------------------------

const isDirectRun = process.argv[1]?.endsWith('daemon.js') === true;

if (isDirectRun) {
  const workspace = process.env.NORIEN_WORKSPACE ?? process.cwd();
  const port = process.env.NORIEN_RUNTIME_PORT
    ? Number.parseInt(process.env.NORIEN_RUNTIME_PORT, 10)
    : DEFAULT_DAEMON_PORT;

  startDaemon({
    workspace,
    port,
    ...(process.env.NORIEN_RUNTIME_HOST ? { host: process.env.NORIEN_RUNTIME_HOST } : {}),
    ...(process.env.NORIEN_REGISTRY ? { registry: process.env.NORIEN_REGISTRY } : {}),
    ...(process.env.NORIEN_ACTOR ? { actor: process.env.NORIEN_ACTOR } : {}),
    ...(process.env.NORIEN_API_KEY ? { apiKey: process.env.NORIEN_API_KEY } : {}),
    logger: process.env.NORIEN_RUNTIME_LOG === 'true',
  })
    .then(({ record, close }) => {
      process.stdout.write(`norien runtime listening on ${record.url} (pid ${record.pid})\n`);

      const shutdown = (signal: string) => {
        process.stdout.write(`\nshutting down (${signal})\n`);
        void close().then(
          () => process.exit(0),
          () => process.exit(1),
        );
      };

      for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, () => shutdown(signal));
      }
    })
    .catch((error: unknown) => {
      process.stderr.write(`runtime failed to start: ${String(error)}\n`);
      process.exit(1);
    });
}
