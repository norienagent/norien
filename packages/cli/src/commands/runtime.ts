import inquirer from 'inquirer';

import type { LogRecord, RuntimeInstance, RuntimeStatus } from '@norien-live/runtime';
import {
  clearDaemonRecord,
  isProcessAlive,
  readDaemonRecord,
  startDaemon,
} from '@norien-live/runtime';

import type { CommandContext } from '../context.js';
import { RuntimeClient } from '../runtime-client.js';
import {
  CliError,
  definitions,
  emitJson,
  heading,
  line,
  relativeTime,
  spinner,
  styles,
  success,
  table,
  warn,
} from '../ui.js';

/**
 * Runtime commands.
 *
 * Every one of these is a thin call onto the supervisor's HTTP API; the CLI
 * holds no process state of its own. That is what lets `norien status` in one
 * terminal describe agents started from another.
 */

function clientFor(context: CommandContext, options: { host?: string; port?: number } = {}) {
  return new RuntimeClient({
    workspace: context.cwd,
    ...(options.host ? { host: options.host } : {}),
    ...(options.port ? { port: options.port } : {}),
    registry: context.credentials.registry,
    ...(context.credentials.handle ? { actor: context.credentials.handle } : {}),
    ...(context.credentials.apiKey ? { apiKey: context.credentials.apiKey } : {}),
  });
}

/** `norien run <agent>` */
export async function run(
  context: CommandContext,
  agent: string,
  options: {
    command?: string;
    env?: string[];
    grant?: string[];
    grantAll?: boolean;
    restartPolicy?: 'no' | 'on-failure' | 'always';
    offline?: boolean;
    follow?: boolean;
  },
): Promise<void> {
  const client = clientFor(context);
  const progress = spinner(`Starting ${agent}`).start();

  const env = parseEnvPairs(options.env);

  let instance: RuntimeInstance;
  try {
    instance = await client.run({
      agent,
      ...(options.command ? { command: options.command } : {}),
      ...(Object.keys(env).length > 0 ? { env } : {}),
      ...(options.grant?.length ? { grant: options.grant } : {}),
      ...(options.grantAll ? { grant_all: true } : {}),
      ...(options.restartPolicy ? { restart_policy: options.restartPolicy } : {}),
      ...(options.offline ? { offline: true } : {}),
    });
  } catch (error) {
    progress.fail(`Could not start ${agent}`);
    throw error;
  }

  progress.succeed(`Started ${instance.slug}@${instance.version} (pid ${instance.pid})`);

  if (context.json) {
    emitJson({ ok: true, instance });
    return;
  }

  renderInstanceSummary(instance);

  if (options.follow) {
    line();
    line(styles.dim('Streaming logs — press Ctrl+C to stop (the agent keeps running).'));
    line();
    await streamLogs(client, agent, {});
    return;
  }

  line();
  line(`  ${styles.dim('logs:')}   ${styles.code(`norien logs ${agent} -f`)}`);
  line(`  ${styles.dim('stop:')}   ${styles.code(`norien stop ${agent}`)}`);
  line();
}

/** `norien stop <agent>` */
export async function stop(
  context: CommandContext,
  agent: string,
  options: { timeout?: number; force?: boolean },
): Promise<void> {
  const client = clientFor(context);
  await client.connect({ autoStart: false });

  const progress = spinner(`Stopping ${agent}`).start();

  const instance = await client
    .stop({
      agent,
      ...(options.timeout !== undefined ? { timeout_ms: options.timeout * 1000 } : {}),
      ...(options.force ? { force: true } : {}),
    })
    .catch((error: unknown) => {
      progress.fail(`Could not stop ${agent}`);
      throw error;
    });

  progress.succeed(`Stopped ${agent}`);

  if (context.json) {
    emitJson({ ok: true, instance });
    return;
  }

  if (instance.exit) {
    definitions([
      ['exit', instance.exit.reason],
      ['uptime', formatUptime(instance.uptimeSeconds)],
    ]);
  }
}

/** `norien restart <agent>` */
export async function restart(
  context: CommandContext,
  agent: string,
  options: { grant?: string[]; grantAll?: boolean; offline?: boolean },
): Promise<void> {
  const client = clientFor(context);
  const progress = spinner(`Restarting ${agent}`).start();

  const instance = await client
    .restart({
      agent,
      ...(options.grant?.length ? { grant: options.grant } : {}),
      ...(options.grantAll ? { grant_all: true } : {}),
      ...(options.offline ? { offline: true } : {}),
    })
    .catch((error: unknown) => {
      progress.fail(`Could not restart ${agent}`);
      throw error;
    });

  progress.succeed(
    `Restarted ${instance.slug}@${instance.version} (pid ${instance.pid}, restart #${instance.restarts})`,
  );

  if (context.json) {
    emitJson({ ok: true, instance });
    return;
  }

  renderInstanceSummary(instance);
  line();
}

/** `norien status [agent]` */
export async function status(
  context: CommandContext,
  agent: string | undefined,
  options: { host?: string },
): Promise<void> {
  const client = clientFor(context, options.host ? { host: options.host } : {});

  // Reporting must never start a supervisor: `status` on a quiet workspace
  // should say "nothing running", not boot a daemon as a side effect.
  const reachable = await client
    .connect({ autoStart: false })
    .then(() => true)
    .catch(() => false);

  if (!reachable) {
    if (context.json) {
      emitJson({ ok: true, runtime_running: false, data: [], summary: {}, meta: { total: 0 } });
      return;
    }

    warn('The Norien runtime is not running.');
    line(`  Nothing is executing. Start an agent with ${styles.code('norien run <agent>')}`);
    return;
  }

  if (agent) {
    const instance = await client.describe(agent);

    if (context.json) {
      emitJson({ ok: true, instance });
      return;
    }

    renderInstanceDetail(instance);
    return;
  }

  const report = await client.status();

  if (context.json) {
    emitJson({ ok: true, runtime_running: true, ...report });
    return;
  }

  if (report.data.length === 0) {
    warn('No agents installed in this workspace.');
    line(`  Install one with ${styles.code('norien install <agent>')}`);
    return;
  }

  heading(`${report.meta.total} agent${report.meta.total === 1 ? '' : 's'}`);
  line();

  table(report.data, [
    { header: 'agent', value: (row) => styles.title(row.agent) },
    { header: 'version', value: (row) => row.version },
    { header: 'status', value: (row) => colourStatus(row.status) },
    { header: 'health', value: (row) => colourHealth(row.health) },
    { header: 'runtime', value: (row) => row.runtime },
    { header: 'pid', value: (row) => (row.pid === null ? '' : String(row.pid)), align: 'right' },
    { header: 'uptime', value: (row) => formatUptime(row.uptime_seconds) },
    { header: 'restarts', value: (row) => (row.restarts > 0 ? String(row.restarts) : ''), align: 'right' },
  ]);

  const failed = report.data.filter((row) => row.status === 'failed');
  if (failed.length > 0) {
    heading('Failures');
    for (const row of failed) {
      line(`  ${styles.error('✗')} ${styles.title(row.agent)}  ${row.exit?.reason ?? 'unknown'}`);
      line(`    ${styles.dim(`norien logs ${row.agent}`)}`);
    }
  }

  line();
  const parts = Object.entries(report.summary)
    .filter(([, count]) => count > 0)
    .map(([state, count]) => `${count} ${state}`);
  line(styles.dim(parts.join(' · ')));
  line();
}

/** `norien logs <agent>` */
export async function logs(
  context: CommandContext,
  agent: string,
  options: { follow?: boolean; lines?: number; stream?: 'stdout' | 'stderr' | 'system'; history?: boolean },
): Promise<void> {
  const client = clientFor(context);
  await client.connect({ autoStart: false });

  if (options.follow) {
    if (context.json) {
      throw new CliError('--follow cannot be combined with --json.', {
        exitCode: 2,
        details: ['Use --json without --follow for a one-shot snapshot.'],
      });
    }

    await streamLogs(client, agent, {
      ...(options.lines !== undefined ? { limit: options.lines } : {}),
      ...(options.stream ? { stream: options.stream } : {}),
    });
    return;
  }

  const result = await client.logs({
    agent,
    ...(options.lines !== undefined ? { limit: options.lines } : {}),
    ...(options.stream ? { stream: options.stream } : {}),
    ...(options.history ? { history: true } : {}),
  });

  if (context.json) {
    emitJson({ ok: true, ...result });
    return;
  }

  if (result.data.length === 0) {
    warn(`No logs for ${agent}.`);
    line(`  Start it with ${styles.code(`norien run ${agent}`)}`);
    return;
  }

  for (const record of result.data) line(formatLogRecord(record));
}

/** `norien runtime start|stop|status` — manage the supervisor itself. */
export async function runtimeDaemon(
  context: CommandContext,
  action: 'start' | 'stop' | 'status',
  options: { foreground?: boolean; port?: number },
): Promise<void> {
  const workspace = context.cwd;

  if (action === 'status') {
    const record = await readDaemonRecord(workspace);
    const alive = record ? isProcessAlive(record.pid) : false;

    if (context.json) {
      emitJson({ ok: true, running: alive, daemon: alive ? record : null });
      return;
    }

    if (!alive) {
      warn('The Norien runtime is not running.');
      return;
    }

    heading('Norien runtime');
    definitions([
      ['url', record?.url],
      ['pid', String(record?.pid)],
      ['workspace', record?.workspace],
      ['started', record ? relativeTime(record.startedAt) : null],
    ]);
    line();
    return;
  }

  if (action === 'stop') {
    const record = await readDaemonRecord(workspace);

    if (!record || !isProcessAlive(record.pid)) {
      await clearDaemonRecord(workspace);
      if (context.json) return emitJson({ ok: true, stopped: false });
      warn('The Norien runtime is not running.');
      return;
    }

    if (!context.yes && !context.json && process.stdin.isTTY) {
      const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
        {
          type: 'confirm',
          name: 'confirmed',
          message: 'Stopping the runtime also stops every running agent. Continue?',
          default: true,
        },
      ]);
      if (!confirmed) {
        warn('Cancelled.');
        return;
      }
    }

    // SIGTERM lets the daemon stop agents cleanly and clear its own record.
    process.kill(record.pid, 'SIGTERM');

    if (context.json) return emitJson({ ok: true, stopped: true, pid: record.pid });
    success(`Stopped the runtime (pid ${record.pid}).`);
    return;
  }

  // action === 'start'
  const existing = await readDaemonRecord(workspace);
  if (existing && isProcessAlive(existing.pid)) {
    if (context.json) return emitJson({ ok: true, already_running: true, daemon: existing });
    warn(`Already running at ${existing.url} (pid ${existing.pid}).`);
    return;
  }

  if (options.foreground) {
    const { record, close } = await startDaemon({
      workspace,
      ...(options.port ? { port: options.port } : {}),
      registry: context.credentials.registry,
      ...(context.credentials.handle ? { actor: context.credentials.handle } : {}),
      logger: false,
    });

    line(`${styles.ok('✓')} Runtime listening on ${record.url} (pid ${record.pid})`);
    line(styles.dim('Press Ctrl+C to stop.'));

    await new Promise<void>((resolve) => {
      const shutdown = () => void close().then(resolve, resolve);
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    });
    return;
  }

  const client = clientFor(context, options.port ? { port: options.port } : {});
  const url = await client.connect();
  const record = await readDaemonRecord(workspace);

  if (context.json) {
    emitJson({ ok: true, started: true, daemon: record });
    return;
  }

  success(`Runtime listening on ${url}${record ? ` (pid ${record.pid})` : ''}`);
}

// --- Rendering ------------------------------------------------------------

async function streamLogs(
  client: RuntimeClient,
  agent: string,
  query: { limit?: number; stream?: string },
): Promise<void> {
  const controller = new AbortController();

  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  try {
    await client.follow({ agent, ...query }, (record) => line(formatLogRecord(record)), controller.signal);
  } catch (error) {
    // An aborted stream is the user pressing Ctrl+C, not a failure.
    if (!controller.signal.aborted) throw error;
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}

function formatLogRecord(record: LogRecord): string {
  const timestamp = new Date(record.ts).toISOString().slice(11, 23);

  const prefix =
    record.stream === 'stderr'
      ? styles.error('err')
      : record.stream === 'system'
        ? styles.key('sys')
        : styles.dim('out');

  const body = record.stream === 'stderr' ? styles.error(record.line) : record.line;

  return `${styles.dim(timestamp)} ${prefix} ${body}`;
}

function renderInstanceSummary(instance: RuntimeInstance): void {
  definitions([
    ['status', colourStatus(instance.status)],
    ['runtime', instance.plan ? `${instance.plan.runtime} (${instance.plan.packageManager})` : null],
    ['command', instance.plan ? `${instance.plan.command} ${instance.plan.args.join(' ')}` : null],
    ['plan', instance.plan?.source ?? null],
    ['pid', instance.pid === null ? null : String(instance.pid)],
    ['port', instance.port === null ? null : String(instance.port)],
    ['tools', instance.dependencies?.tools.map((tool) => tool.slug).join(', ') || 'none'],
    ['permissions', instance.permissions?.granted.join(', ') || 'none'],
    ['logs', instance.logFile],
  ]);
}

function renderInstanceDetail(instance: RuntimeInstance): void {
  heading(`${instance.slug} ${styles.dim(`@${instance.version}`)}`);

  definitions([
    ['status', colourStatus(instance.status)],
    ['health', colourHealth(instance.health)],
    ['pid', instance.pid === null ? null : String(instance.pid)],
    ['uptime', instance.status === 'running' ? formatUptime(instance.uptimeSeconds) : null],
    ['restarts', instance.restarts > 0 ? String(instance.restarts) : null],
    ['runtime', instance.manifest.runtime],
    ['command', instance.plan ? `${instance.plan.command} ${instance.plan.args.join(' ')}` : null],
    ['port', instance.port === null ? null : String(instance.port)],
    ['directory', instance.directory],
    ['logs', instance.logFile],
  ]);

  if (instance.exit) {
    heading('Last exit');
    definitions([
      ['reason', instance.exit.reason],
      ['code', instance.exit.code === null ? null : String(instance.exit.code)],
      ['signal', instance.exit.signal],
      ['expected', instance.exit.expected ? 'yes' : 'no'],
      ['at', new Date(instance.exit.at).toISOString()],
    ]);
  }

  if (instance.lastHealthCheck) {
    heading('Last health check');
    definitions([
      ['result', instance.lastHealthCheck.ok ? styles.ok('ok') : styles.error('failed')],
      ['detail', instance.lastHealthCheck.detail],
      ['at', new Date(instance.lastHealthCheck.at).toISOString()],
    ]);
  }

  if (instance.permissions) {
    heading('Permissions');
    if (instance.permissions.declared.length === 0) {
      line(styles.dim('  none declared'));
    } else {
      for (const permission of instance.permissions.declared) {
        const granted = !instance.permissions.missing.includes(permission);
        line(`  ${granted ? styles.ok('✓') : styles.error('✗')} ${permission}`);
      }
    }
  }

  if (instance.environment) {
    heading('Environment');
    definitions([
      ['satisfied', instance.environment.satisfied.join(', ') || 'none required'],
      ['missing', instance.environment.missing.join(', ') || 'none'],
      ['injected', instance.environment.injected.length > 0 ? `${instance.environment.injected.length} variables` : null],
      ['sources', instance.environment.sources.join(', ') || 'none'],
    ]);
  }

  line();
}

function colourStatus(status: RuntimeStatus | string): string {
  if (status === 'running') return styles.ok(status);
  if (status === 'failed') return styles.error(status);
  if (status === 'restarting' || status === 'starting' || status === 'installing') {
    return styles.warn(status);
  }
  return styles.dim(status);
}

function colourHealth(health: string): string {
  if (health === 'healthy') return styles.ok(health);
  if (health === 'unhealthy' || health === 'failed') return styles.error(health);
  if (health === 'starting') return styles.warn(health);
  return styles.dim(health);
}

function formatUptime(seconds: number): string {
  if (seconds <= 0) return '';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86_400)}d ${Math.floor((seconds % 86_400) / 3600)}h`;
}

/** Parses `--env KEY=value` pairs. */
function parseEnvPairs(pairs: string[] | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!pairs) return result;

  for (const pair of pairs) {
    const separator = pair.indexOf('=');
    if (separator <= 0) {
      throw new CliError(`Invalid --env value '${pair}'.`, {
        exitCode: 2,
        details: ['Expected KEY=value.'],
      });
    }
    result[pair.slice(0, separator)] = pair.slice(separator + 1);
  }

  return result;
}
