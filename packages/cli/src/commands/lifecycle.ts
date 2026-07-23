import path from 'node:path';

import inquirer from 'inquirer';

import { NorienError } from '@norien/sdk';
import { fetchSource, type FetchResult } from '@norien/tools';

import { type CommandContext, requireIdentity } from '../context.js';
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
import {
  AGENTS_DIRNAME,
  forgetInstall,
  materialiseAgent,
  readLockfile,
  recordInstall,
  removeAgentDir,
} from '../workspace.js';

/**
 * `norien install <agent>`
 *
 * The registry does the resolution -- version range, tool dependencies,
 * runtime detection, environment readiness -- in a single call. This command's
 * job is to turn that response into files on disk and to refuse to pretend an
 * unsatisfiable install succeeded.
 */
export async function install(
  context: CommandContext,
  slug: string,
  options: { version?: string; force?: boolean; env?: string[]; source?: boolean },
): Promise<void> {
  requireIdentity(context);

  const requested = parseSlugWithVersion(slug, options.version);
  const lockfile = await readLockfile(context.cwd);
  const existing = lockfile.agents[requested.slug];

  if (existing && !options.force) {
    throw new CliError(
      `${requested.slug}@${existing.version} is already installed in ${AGENTS_DIRNAME}/.`,
      {
        exitCode: 2,
        details: [
          "Use 'norien update' to move to a newer version.",
          "Use 'norien install --force' to reinstall in place.",
        ],
      },
    );
  }

  const progress = spinner(`Resolving ${requested.slug}${requested.version ? `@${requested.version}` : ''}`).start();

  const result = await context.client
    .install({
      agent: requested.slug,
      ...(requested.version ? { version: requested.version } : {}),
      ...(options.env?.length ? { environment: options.env } : {}),
    })
    .catch((error: unknown) => {
      progress.fail(`Could not resolve ${requested.slug}`);
      throw error;
    });

  progress.text = 'Validating runtime';

  // An agent whose tools cannot be resolved is not runnable, so writing files
  // for it would be misleading. Environment gaps are different: they are the
  // developer's to fill in, and .env.example exists precisely for that.
  if (!result.dependencies.satisfied) {
    progress.fail('Dependencies could not be resolved');
    throw new CliError(
      `${requested.slug} requires ${result.dependencies.missing.length} tool(s) that are not published.`,
      {
        exitCode: 5,
        details: result.dependencies.missing.map((tool) => `missing tool: ${tool}`),
      },
    );
  }

  progress.text = `Writing ${AGENTS_DIRNAME}/${result.agent.slug}`;
  const written = await materialiseAgent(result, { cwd: context.cwd });

  // The registry carries the manifest, not the code. When the manifest declares
  // a source and the runtime needs code to run, fetch it now — cloning only,
  // never executing. `--no-source` skips this for anyone who wants to read the
  // manifest before pulling code. `http` agents (none today) need no code.
  // `result.manifest` is the canonical rebuild, which drops manifest extras;
  // `result.agent.manifest` is the stored document, where the source survives.
  const wantsCode = result.runtime.name === 'node' || result.runtime.name === 'python';
  const declaredSource = result.agent.manifest?.source;
  let fetch: FetchResult | null = null;

  if (options.source !== false && wantsCode && declaredSource) {
    progress.text = 'Fetching source';
    fetch = await fetchSource(declaredSource, written.directory, {
      entrypoint: result.runtime.entrypoint,
    });
  }

  await recordInstall(
    {
      slug: result.agent.slug,
      version: result.installation.installed_version,
      runtime: result.runtime.name,
      registry: context.credentials.registry,
      installedAt: result.installation.installed_at,
      tools: result.dependencies.resolved.map((tool) => tool.slug),
      path: path.relative(context.cwd, written.directory).split(path.sep).join('/'),
    },
    context.cwd,
  );

  progress.succeed(`Installed ${result.agent.slug}@${result.installation.installed_version}`);

  if (context.json) {
    emitJson({
      ok: true,
      agent: result.agent.slug,
      version: result.installation.installed_version,
      directory: written.directory,
      files: written.files.map((file) => file.name),
      runtime: result.runtime,
      dependencies: result.dependencies,
      environment: result.environment,
      ready: result.ready,
      diagnostics: result.diagnostics,
      source: fetch,
    });
    return;
  }

  const relative = path.relative(context.cwd, written.directory).split(path.sep).join('/');

  heading(`${result.agent.name} ${styles.dim(`@${result.installation.installed_version}`)}`);
  definitions([
    ['runtime', `${result.runtime.name} (${result.runtime.source})`],
    ['start', result.runtime.commands.start],
    ['health', result.runtime.commands.health],
    ['tools', result.dependencies.resolved.map((tool) => tool.slug).join(', ') || 'none'],
    ['location', relative],
  ]);

  heading('Files');
  for (const file of written.files) {
    line(`  ${styles.ok('+')} ${relative}/${file.name} ${styles.dim(`${file.bytes} B`)}`);
  }

  reportSource(fetch, result, relative, {
    skipped: options.source === false && Boolean(declaredSource),
  });

  if (!result.environment.satisfied) {
    heading('Next steps');
    line(`  ${result.environment.missing.length} required environment variable(s) still need values:`);
    for (const name of result.environment.missing) line(`    ${styles.warn('•')} ${name}`);
    line();
    line(`  ${styles.dim('cp')} ${relative}/.env.example ${styles.dim('.env')}`);
  } else {
    line();
    success('Ready to run.');
  }

  line();
}

/**
 * Reports what the source fetch did.
 *
 * Every outcome is stated plainly, because each means something different for
 * whether the agent can run: code present, code declared-but-absent, or no
 * source at all. A `node`/`python` agent with no code is the one case a user
 * most needs told, since it looks installed but cannot start.
 */
function reportSource(
  fetch: FetchResult | null,
  result: { runtime: { name: string; entrypoint: string | null } },
  relative: string,
  context: { skipped: boolean },
): void {
  const needsCode = result.runtime.name === 'node' || result.runtime.name === 'python';

  if (fetch?.fetched) {
    heading('Source');
    const at = fetch.commit ? `${fetch.ref} (${fetch.commit.slice(0, 8)})` : fetch.ref;
    line(`  ${styles.ok('✓')} fetched ${fetch.files.length} item(s) from ${at}`);
    if (fetch.reason) line(`  ${styles.warn('!')} ${fetch.reason}`);
    if (fetch.hasDependencies) {
      line(
        `  ${styles.warn('!')} declares dependencies — install them in ${relative}/ before running`,
      );
    }
    return;
  }

  if (!needsCode || !result.runtime.entrypoint) return;

  heading('Source');
  if (context.skipped) {
    line(`  ${styles.dim('skipped (--no-source).')} Re-run without the flag to fetch the code.`);
    return;
  }
  if (fetch) {
    line(`  ${styles.warn('!')} could not fetch code: ${fetch.reason}`);
  } else {
    line(`  ${styles.warn('!')} this agent published no source, so its code was not fetched`);
  }
  line(
    `  ${styles.dim('The manifest installed, but')} ${relative}/${result.runtime.entrypoint} ${styles.dim('is missing.')}`,
  );
}

/** `norien list` — what the lockfile says is installed here. */
export async function list(
  context: CommandContext,
  options: { remote?: boolean },
): Promise<void> {
  if (options.remote) {
    return listRemote(context);
  }

  const lockfile = await readLockfile(context.cwd);
  const entries = Object.values(lockfile.agents);

  if (context.json) {
    emitJson({ ok: true, scope: 'local', count: entries.length, agents: entries });
    return;
  }

  if (entries.length === 0) {
    warn(`No agents installed in this directory.`);
    line(`  Install one with ${styles.code('norien install <agent>')}`);
    return;
  }

  heading(`${entries.length} agent${entries.length === 1 ? '' : 's'} installed`);
  line();

  table(entries, [
    { header: 'agent', value: (entry) => styles.title(entry.slug) },
    { header: 'version', value: (entry) => entry.version },
    { header: 'runtime', value: (entry) => entry.runtime ?? '' },
    { header: 'tools', value: (entry) => String(entry.tools.length), align: 'right' },
    { header: 'installed', value: (entry) => styles.dim(relativeTime(entry.installedAt)) },
    { header: 'path', value: (entry) => styles.dim(entry.path) },
  ]);
  line();
}

/** Installations recorded server-side for this account. */
async function listRemote(context: CommandContext): Promise<void> {
  requireIdentity(context);

  const progress = spinner('Fetching installations').start();
  const page = await context.client.installations.list({ limit: 100 }).finally(() => progress.stop());

  if (context.json) {
    emitJson({ ok: true, scope: 'remote', ...page });
    return;
  }

  if (page.data.length === 0) {
    warn('No installations recorded for this account.');
    return;
  }

  heading(`${page.meta.total} installation${page.meta.total === 1 ? '' : 's'} on ${context.credentials.registry}`);
  line();
  table(page.data, [
    { header: 'agent', value: (entry) => styles.title(entry.agent) },
    { header: 'version', value: (entry) => entry.installed_version },
    { header: 'installed', value: (entry) => styles.dim(relativeTime(entry.installed_at)) },
  ]);
  line();
}

/**
 * `norien uninstall <agent>`
 *
 * Removes the local folder and lockfile entry, and tells the registry so the
 * account's installation list stays accurate. A registry that has already
 * forgotten the installation is not an error.
 */
export async function uninstall(
  context: CommandContext,
  slug: string,
  options: { keepRemote?: boolean },
): Promise<void> {
  const lockfile = await readLockfile(context.cwd);
  const entry = lockfile.agents[slug];

  if (!entry) {
    throw new CliError(`${slug} is not installed in this directory.`, {
      exitCode: 4,
      details: [`Run 'norien list' to see what is installed.`],
    });
  }

  if (!context.yes && !context.json && process.stdin.isTTY) {
    const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
      {
        type: 'confirm',
        name: 'confirmed',
        message: `Remove ${slug}@${entry.version} and its folder?`,
        default: true,
      },
    ]);

    if (!confirmed) {
      warn('Cancelled.');
      return;
    }
  }

  const progress = spinner(`Removing ${slug}`).start();

  await removeAgentDir(slug, context.cwd);
  await forgetInstall(slug, context.cwd);

  let remoteRemoved = false;
  if (!options.keepRemote && context.credentials.handle) {
    try {
      await context.client.uninstall(slug);
      remoteRemoved = true;
    } catch (error) {
      // Already gone server-side is a success for our purposes.
      if (!(error instanceof NorienError && error.isNotFound)) {
        progress.warn(`Removed locally, but the registry rejected the uninstall.`);
      }
    }
  }

  progress.succeed(`Removed ${slug}@${entry.version}`);

  if (context.json) {
    emitJson({ ok: true, agent: slug, version: entry.version, remote_removed: remoteRemoved });
  }
}

/**
 * `norien update [agent]`
 *
 * Compares each installed version against the registry and, when newer
 * versions exist, prints the intervening version descriptions as a changelog
 * before rewriting the local folder.
 */
export async function update(
  context: CommandContext,
  slug: string | undefined,
  options: { check?: boolean },
): Promise<void> {
  const lockfile = await readLockfile(context.cwd);
  const entries = slug
    ? [lockfile.agents[slug]].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    : Object.values(lockfile.agents);

  if (entries.length === 0) {
    throw new CliError(
      slug ? `${slug} is not installed in this directory.` : 'No agents installed in this directory.',
      { exitCode: 4, details: [`Run 'norien list' to see what is installed.`] },
    );
  }

  const progress = spinner('Checking for updates').start();
  const plans: UpdatePlan[] = [];

  for (const entry of entries) {
    progress.text = `Checking ${entry.slug}`;

    try {
      const latest = await context.client.info(entry.slug);
      const history = await context.client.agents.versions(entry.slug, { limit: 100 });

      // Everything published strictly after what is installed, newest first.
      const installedIndex = history.data.findIndex((version) => version.version === entry.version);
      const changelog =
        installedIndex === -1 ? history.data.slice(0, 5) : history.data.slice(0, installedIndex);

      plans.push({
        slug: entry.slug,
        from: entry.version,
        to: latest.version,
        outdated: latest.version !== entry.version,
        changelog: changelog.map((version) => ({
          version: version.version,
          description: version.description,
          created_at: version.created_at,
        })),
      });
    } catch (error) {
      plans.push({
        slug: entry.slug,
        from: entry.version,
        to: null,
        outdated: false,
        changelog: [],
        error: error instanceof NorienError ? error.message : String(error),
      });
    }
  }

  progress.stop();

  const outdated = plans.filter((plan) => plan.outdated);

  if (context.json && options.check) {
    emitJson({ ok: true, checked: plans.length, outdated: outdated.length, plans });
    return;
  }

  if (!context.json) {
    if (outdated.length === 0) {
      success(`All ${plans.length} agent(s) are up to date.`);
      for (const plan of plans.filter((entry) => entry.error)) {
        warn(`${plan.slug}: ${plan.error}`);
      }
      return;
    }

    heading(`${outdated.length} update${outdated.length === 1 ? '' : 's'} available`);
    line();

    for (const plan of outdated) {
      line(`${styles.title(plan.slug)}  ${styles.dim(plan.from)} → ${styles.ok(plan.to as string)}`);
      for (const change of plan.changelog) {
        line(`  ${styles.key(change.version.padEnd(10))} ${change.description}`);
        line(`  ${' '.repeat(10)} ${styles.dim(relativeTime(change.created_at))}`);
      }
      line();
    }
  }

  if (options.check) {
    if (context.json) emitJson({ ok: true, checked: plans.length, outdated: outdated.length, plans });
    else line(styles.dim(`Run 'norien update' without --check to apply.`));
    return;
  }

  if (outdated.length === 0) {
    if (context.json) emitJson({ ok: true, updated: [], checked: plans.length });
    return;
  }

  requireIdentity(context);

  const applied: { slug: string; from: string; to: string }[] = [];
  const applying = spinner('Applying updates').start();

  for (const plan of outdated) {
    applying.text = `Updating ${plan.slug}`;

    const result = await context.client.install({ agent: plan.slug });
    await materialiseAgent(result, { cwd: context.cwd });
    await recordInstall(
      {
        slug: result.agent.slug,
        version: result.installation.installed_version,
        runtime: result.runtime.name,
        registry: context.credentials.registry,
        installedAt: result.installation.installed_at,
        tools: result.dependencies.resolved.map((tool) => tool.slug),
        path: `${AGENTS_DIRNAME}/${result.agent.slug}`,
      },
      context.cwd,
    );

    applied.push({ slug: plan.slug, from: plan.from, to: result.installation.installed_version });
  }

  applying.succeed(`Updated ${applied.length} agent${applied.length === 1 ? '' : 's'}`);

  if (context.json) {
    emitJson({ ok: true, updated: applied, checked: plans.length });
    return;
  }

  for (const entry of applied) {
    line(`  ${styles.ok('✓')} ${entry.slug} ${styles.dim(entry.from)} → ${entry.to}`);
  }
  line();
}

interface UpdatePlan {
  slug: string;
  from: string;
  to: string | null;
  outdated: boolean;
  changelog: { version: string; description: string; created_at: string }[];
  error?: string;
}

/** Accepts `agent`, `agent@1.2.3`, and an explicit `--version` that wins. */
function parseSlugWithVersion(
  input: string,
  explicit: string | undefined,
): { slug: string; version: string | undefined } {
  const at = input.lastIndexOf('@');

  if (at > 0) {
    return { slug: input.slice(0, at), version: explicit ?? input.slice(at + 1) };
  }

  return { slug: input, version: explicit };
}
