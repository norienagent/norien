import inquirer from 'inquirer';

import { NorienClient } from '@norien-live/sdk';

import { DEFAULT_PROFILE, clearConfig, configPath, readConfig, removeProfile, saveProfile } from '../config.js';
import type { CommandContext } from '../context.js';
import { CliError, definitions, emitJson, heading, line, spinner, styles, success, warn } from '../ui.js';

/**
 * `norien login`
 *
 * The registry attributes writes by handle (`x-norien-actor`) and declares an
 * API-key scheme it does not yet enforce. Both are collected and both are sent,
 * so nothing about this command changes when key verification lands.
 */
export async function login(
  context: CommandContext,
  options: { registry?: string; handle?: string; apiKey?: string; profile?: string },
): Promise<void> {
  const interactive = process.stdin.isTTY === true && !context.json;

  let registry = options.registry ?? context.credentials.registry;
  let handle = options.handle ?? context.credentials.handle;
  let apiKey = options.apiKey ?? context.credentials.apiKey;

  if (interactive) {
    const answers = await inquirer.prompt<{ registry: string; handle: string; apiKey: string }>([
      {
        type: 'input',
        name: 'registry',
        message: 'Registry URL',
        default: registry,
        validate: (value: string) =>
          /^https?:\/\//.test(value.trim()) || 'Enter a URL starting with http:// or https://',
      },
      {
        type: 'input',
        name: 'handle',
        message: 'Handle (publishes and installs are attributed to this)',
        ...(handle ? { default: handle } : {}),
        validate: (value: string) =>
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.trim().toLowerCase()) ||
          'Use lowercase letters, digits, and single hyphens.',
      },
      {
        type: 'password',
        name: 'apiKey',
        mask: '*',
        message: 'API key (optional - not yet enforced by the registry)',
        default: apiKey ?? '',
      },
    ]);

    registry = answers.registry.trim();
    handle = answers.handle.trim().toLowerCase();
    apiKey = answers.apiKey.trim() || undefined;
  }

  if (!handle) {
    throw new CliError('A handle is required.', {
      exitCode: 2,
      details: ['Pass --handle <name>, or run interactively to be prompted.'],
    });
  }

  // Verified before anything is written, so a typo in the URL fails here
  // rather than on the next command.
  const progress = spinner(`Contacting ${registry}`).start();
  const probe = new NorienClient({
    baseUrl: registry,
    actor: handle,
    ...(apiKey ? { apiKey } : {}),
    userAgent: '@norien-live/cli',
  });

  try {
    const health = await probe.health();
    progress.succeed(`Registry reachable (${health.status})`);
  } catch (error) {
    progress.fail(`Could not reach ${registry}`);
    throw error;
  }

  const profile = options.profile ?? context.credentials.profile ?? DEFAULT_PROFILE;
  await saveProfile(profile, { registry, handle, ...(apiKey ? { apiKey } : {}) });

  if (context.json) {
    emitJson({
      ok: true,
      profile,
      registry,
      handle,
      api_key_stored: Boolean(apiKey),
      config_path: configPath(),
    });
    return;
  }

  success(`Logged in as ${styles.title(handle)}`);
  definitions([
    ['registry', registry],
    ['profile', profile],
    ['api key', apiKey ? 'stored' : 'not set'],
    ['config', configPath()],
  ]);

  if (!apiKey) {
    line();
    warn('No API key stored. The registry does not enforce keys yet, so this is fine for now.');
  }
}

/** `norien logout` — removes the stored profile, or every profile with --all. */
export async function logout(
  context: CommandContext,
  options: { all?: boolean; profile?: string },
): Promise<void> {
  if (options.all) {
    await clearConfig();
    if (context.json) return emitJson({ ok: true, removed: 'all' });
    success('Removed all stored credentials.');
    return;
  }

  const profile = options.profile ?? context.credentials.profile;
  const removed = await removeProfile(profile);

  if (context.json) {
    emitJson({ ok: removed, profile, removed });
    return;
  }

  if (!removed) {
    warn(`No stored credentials for profile '${profile}'.`);
    return;
  }

  success(`Logged out of profile '${profile}'.`);
}

/** `norien whoami` — who the CLI will act as, and where that came from. */
export async function whoami(context: CommandContext): Promise<void> {
  const { credentials, client } = context;

  if (!credentials.handle) {
    if (context.json) {
      emitJson({ ok: false, authenticated: false, registry: credentials.registry });
      return;
    }

    warn('Not logged in.');
    line();
    line(`  Run ${styles.code('norien login')} to authenticate.`);
    line(`  Registry: ${credentials.registry}`);
    return;
  }

  // Reachability is part of the answer: knowing the handle is useless if the
  // registry it points at is down.
  const progress = spinner('Checking registry').start();
  let reachable = true;
  let registryVersion: string | null = null;

  try {
    const health = await client.health();
    registryVersion = health.version;
    progress.stop();
  } catch {
    reachable = false;
    progress.stop();
  }

  // Counted via the registry so the answer reflects the server, not local state.
  let published: number | null = null;
  if (reachable) {
    try {
      const owned = await client.agents.list({ author: credentials.handle, limit: 1 });
      published = owned.meta.total;
    } catch {
      published = null;
    }
  }

  if (context.json) {
    emitJson({
      ok: true,
      authenticated: true,
      handle: credentials.handle,
      registry: credentials.registry,
      profile: credentials.profile,
      credential_source: credentials.source,
      api_key_stored: Boolean(credentials.apiKey),
      registry_reachable: reachable,
      registry_version: registryVersion,
      published_agents: published,
    });
    return;
  }

  heading(credentials.handle);
  definitions([
    ['registry', credentials.registry],
    ['profile', credentials.profile],
    ['source', credentials.source],
    ['api key', credentials.apiKey ? 'stored' : 'not set'],
    ['status', reachable ? styles.ok(`reachable (v${registryVersion})`) : styles.error('unreachable')],
    ['published', published === null ? null : String(published)],
  ]);
  line();
}

/** `norien profiles` — list configured registries. */
export async function profiles(context: CommandContext): Promise<void> {
  const config = await readConfig();
  const entries = Object.entries(config.profiles);

  if (context.json) {
    emitJson({
      ok: true,
      current: config.currentProfile,
      profiles: entries.map(([name, profile]) => ({
        name,
        registry: profile.registry,
        handle: profile.handle,
        api_key_stored: Boolean(profile.apiKey),
        current: name === config.currentProfile,
      })),
    });
    return;
  }

  if (entries.length === 0) {
    warn('No profiles configured.');
    line(`  Run ${styles.code('norien login')} to create one.`);
    return;
  }

  heading('Profiles');
  for (const [name, profile] of entries) {
    const marker = name === config.currentProfile ? styles.ok('*') : ' ';
    line(`${marker} ${styles.title(name.padEnd(12))} ${profile.handle} @ ${styles.dim(profile.registry)}`);
  }
  line();
}
