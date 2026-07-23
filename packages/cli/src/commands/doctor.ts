import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { promisify } from 'node:util';

import { NorienError } from '@norien-live/sdk';

import { configPath } from '../config.js';
import type { CommandContext } from '../context.js';
import { emitJson, heading, line, styles } from '../ui.js';
import { AGENTS_DIRNAME, MANIFEST_FILENAME, agentDir, detectProject, readLockfile } from '../workspace.js';

const run = promisify(execFile);

/**
 * `norien doctor`
 *
 * Diagnostics, in the spirit of `brew doctor`: every check runs even when an
 * earlier one fails, so a single invocation reports everything wrong rather
 * than making the developer fix and re-run repeatedly.
 */

type Status = 'pass' | 'warn' | 'fail' | 'skip';

interface Check {
  name: string;
  status: Status;
  detail: string;
  hint?: string;
}

const MIN_NODE_MAJOR = 20;

export async function doctor(context: CommandContext): Promise<number> {
  const checks: Check[] = [];

  checks.push(checkNode());
  checks.push(await checkPython());
  checks.push(await checkConfiguration(context));
  checks.push(...(await checkApi(context)));
  checks.push(...(await checkManifest(context)));
  checks.push(...(await checkInstalled(context)));

  const failures = checks.filter((check) => check.status === 'fail').length;
  const warnings = checks.filter((check) => check.status === 'warn').length;

  if (context.json) {
    emitJson({
      ok: failures === 0,
      failures,
      warnings,
      checks: checks.map((check) => ({
        name: check.name,
        status: check.status,
        detail: check.detail,
        ...(check.hint ? { hint: check.hint } : {}),
      })),
    });
    return failures > 0 ? 1 : 0;
  }

  heading('Diagnostics');
  line();

  const width = Math.max(...checks.map((check) => check.name.length));

  for (const check of checks) {
    line(`${symbol(check.status)} ${styles.key(check.name.padEnd(width))}  ${check.detail}`);
    if (check.hint) line(`  ${' '.repeat(width)}  ${styles.dim(check.hint)}`);
  }

  line();

  if (failures > 0) {
    line(styles.error(`${failures} check(s) failed`) + styles.dim(`, ${warnings} warning(s)`));
  } else if (warnings > 0) {
    line(styles.warn(`All critical checks passed, ${warnings} warning(s)`));
  } else {
    line(styles.ok('All checks passed'));
  }

  line();
  return failures > 0 ? 1 : 0;
}

function symbol(status: Status): string {
  if (status === 'pass') return styles.ok('✓');
  if (status === 'warn') return styles.warn('!');
  if (status === 'fail') return styles.error('✗');
  return styles.dim('-');
}

function checkNode(): Check {
  const version = process.versions.node;
  const major = Number.parseInt(version.split('.')[0] ?? '0', 10);

  if (major < MIN_NODE_MAJOR) {
    return {
      name: 'node',
      status: 'fail',
      detail: `v${version} (minimum is v${MIN_NODE_MAJOR})`,
      hint: `Upgrade Node.js to v${MIN_NODE_MAJOR} or newer.`,
    };
  }

  return { name: 'node', status: 'pass', detail: `v${version}` };
}

/**
 * Python is only required by agents that declare `runtime: python`, so its
 * absence is a warning rather than a failure.
 */
async function checkPython(): Promise<Check> {
  for (const candidate of ['python3', 'python']) {
    try {
      const { stdout, stderr } = await run(candidate, ['--version'], { timeout: 5000 });
      const version = `${stdout}${stderr}`.trim();
      if (version) {
        return { name: 'python', status: 'pass', detail: `${version} (${candidate})` };
      }
    } catch {
      // Try the next candidate.
    }
  }

  return {
    name: 'python',
    status: 'warn',
    detail: 'not found on PATH',
    hint: 'Only needed to run agents with "runtime": "python".',
  };
}

async function checkConfiguration(context: CommandContext): Promise<Check> {
  const { credentials } = context;

  if (!credentials.handle) {
    return {
      name: 'config',
      status: 'warn',
      detail: 'not logged in',
      hint: "Run 'norien login' before publishing or installing.",
    };
  }

  const readable = await access(configPath())
    .then(() => true)
    .catch(() => false);

  return {
    name: 'config',
    status: 'pass',
    detail: `${credentials.handle} via ${credentials.source}${readable ? '' : ' (no config file)'}`,
  };
}

async function checkApi(context: CommandContext): Promise<Check[]> {
  const checks: Check[] = [];

  try {
    const started = Date.now();
    const health = await context.client.health();
    const elapsed = Date.now() - started;

    checks.push({
      name: 'registry',
      status: health.status === 'ok' ? 'pass' : 'warn',
      detail: `${context.credentials.registry} — ${health.status} (${elapsed}ms, v${health.version})`,
    });

    checks.push({
      name: 'registry db',
      status: health.checks.database.ok ? 'pass' : 'fail',
      detail: health.checks.database.ok
        ? `${health.checks.database.driver} (${health.checks.database.latency_ms}ms)`
        : (health.checks.database.error ?? 'unreachable'),
    });
  } catch (error) {
    const message = error instanceof NorienError ? error.message : String(error);
    checks.push({
      name: 'registry',
      status: 'fail',
      detail: `${context.credentials.registry} — ${message}`,
      hint: 'Is the registry running? Check the URL with --registry.',
    });
    // Every later check needs the API, so mark it explicitly rather than
    // reporting a cascade of confusing failures.
    checks.push({ name: 'registry db', status: 'skip', detail: 'skipped — registry unreachable' });
  }

  return checks;
}

/** Validates the local `agent.json`, if this directory has one. */
async function checkManifest(context: CommandContext): Promise<Check[]> {
  let project;

  try {
    project = await detectProject(context.cwd);
  } catch {
    return [
      {
        name: 'manifest',
        status: 'skip',
        detail: `no ${MANIFEST_FILENAME} in this directory`,
      },
    ];
  }

  const checks: Check[] = [];

  try {
    const inspection = await context.client.runtime.inspect(project.manifest);

    // A successful inspect means the manifest parsed and every field was
    // accepted; structural problems raise instead. Each remaining concern gets
    // its own check below so a failure names the thing to fix.
    checks.push({
      name: 'manifest',
      status: 'pass',
      detail: `${inspection.slug}@${inspection.version} — valid`,
    });

    checks.push({
      name: 'dependencies',
      status: inspection.dependencies.satisfied ? 'pass' : 'fail',
      detail: inspection.dependencies.satisfied
        ? `${inspection.dependencies.resolved.length} tool(s) resolved`
        : `missing: ${inspection.dependencies.missing.join(', ')}`,
      ...(inspection.dependencies.satisfied
        ? {}
        : { hint: 'Publish the missing tools, or remove them from "tools".' }),
    });

    checks.push({
      name: 'runtime',
      status: inspection.runtime.source === 'declared' ? 'pass' : 'warn',
      detail: `${inspection.runtime.name} — ${inspection.runtime.commands.start}`,
      ...(inspection.runtime.source === 'inferred'
        ? { hint: 'Runtime was inferred. Declare "runtime" explicitly in agent.json.' }
        : {}),
    });

    // A warning, not a failure: an author legitimately may not hold the
    // agent's secrets on the machine they publish from.
    const missingEnv = inspection.environment.missing;
    checks.push({
      name: 'environment',
      status: missingEnv.length === 0 ? 'pass' : 'warn',
      detail:
        missingEnv.length === 0
          ? `${inspection.environment.required.length} required variable(s) satisfied`
          : `not set locally: ${missingEnv.join(', ')}`,
      ...(missingEnv.length > 0
        ? { hint: 'Only needed to run the agent here; publishing does not require them.' }
        : {}),
    });

    // Also a warning: the current version being published already is the
    // normal state between releases, not a broken project.
    checks.push({
      name: 'version',
      status: inspection.version_check.acceptable ? 'pass' : 'warn',
      detail: inspection.version_check.acceptable
        ? `${inspection.version} — would ${inspection.version_check.action}`
        : (inspection.version_check.conflict_reason ?? 'conflict'),
      ...(inspection.version_check.acceptable
        ? {}
        : { hint: 'Bump "version" in agent.json before publishing again.' }),
    });
  } catch (error) {
    checks.push({
      name: 'manifest',
      status: 'fail',
      detail: error instanceof NorienError ? error.message : String(error),
      ...(error instanceof NorienError && error.details.length > 0
        ? { hint: error.details.map((detail) => `${detail.field ?? ''} ${detail.message}`.trim()).join('; ') }
        : {}),
    });
  }

  return checks;
}

/** Confirms every lockfile entry still has its folder on disk. */
async function checkInstalled(context: CommandContext): Promise<Check[]> {
  const lockfile = await readLockfile(context.cwd);
  const entries = Object.values(lockfile.agents);

  if (entries.length === 0) {
    return [{ name: 'installed', status: 'skip', detail: 'no agents installed here' }];
  }

  const missing: string[] = [];

  for (const entry of entries) {
    const exists = await access(agentDir(entry.slug, context.cwd))
      .then(() => true)
      .catch(() => false);

    if (!exists) missing.push(entry.slug);
  }

  if (missing.length > 0) {
    return [
      {
        name: 'installed',
        status: 'fail',
        detail: `${missing.length} of ${entries.length} missing from ${AGENTS_DIRNAME}/`,
        hint: `Reinstall with: norien install ${missing.join(' ')}`,
      },
    ];
  }

  return [
    { name: 'installed', status: 'pass', detail: `${entries.length} agent(s) present` },
  ];
}
