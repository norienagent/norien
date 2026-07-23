import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { DEFAULT_BASE_URL } from '@norien-live/sdk';

/**
 * Credential storage.
 *
 * Credentials live in `~/.norien/config.json` with `0600` permissions -- the
 * same approach as `~/.npmrc`, `~/.docker/config.json`, and the GitHub CLI.
 * Environment variables always win over the file, so CI never needs to write
 * a credential to disk at all.
 *
 * Profiles exist so one machine can target several registries (local, staging,
 * production) without re-authenticating each time.
 */

export interface Profile {
  registry: string;
  /** Handle sent as `x-norien-actor`; what the registry attributes writes to. */
  handle: string;
  /** Sent as `Authorization: Bearer`. Not yet enforced by the registry. */
  apiKey?: string;
  createdAt?: string;
}

export interface ConfigFile {
  version: 1;
  currentProfile: string;
  profiles: Record<string, Profile>;
}

export const DEFAULT_PROFILE = 'default';

const EMPTY_CONFIG: ConfigFile = {
  version: 1,
  currentProfile: DEFAULT_PROFILE,
  profiles: {},
};

export function configDir(): string {
  return process.env.NORIEN_CONFIG_DIR ?? path.join(homedir(), '.norien');
}

export function configPath(): string {
  return path.join(configDir(), 'config.json');
}

export async function readConfig(): Promise<ConfigFile> {
  try {
    const raw = await readFile(configPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<ConfigFile>;

    return {
      version: 1,
      currentProfile: parsed.currentProfile ?? DEFAULT_PROFILE,
      profiles: parsed.profiles ?? {},
    };
  } catch (error) {
    // A missing config is the normal first-run state, not an error.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...EMPTY_CONFIG };
    if (error instanceof SyntaxError) {
      throw new Error(`${configPath()} is not valid JSON. Fix or delete it, then run 'norien login'.`);
    }
    throw error;
  }
}

export async function writeConfig(config: ConfigFile): Promise<void> {
  const directory = configDir();
  await mkdir(directory, { recursive: true, mode: 0o700 });

  const file = configPath();
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

  // Re-applied explicitly: `writeFile`'s mode only applies when it creates the
  // file, so an existing file with looser permissions would keep them.
  await chmod(file, 0o600).catch(() => {
    // Windows has no POSIX mode bits; the ACL default is already user-scoped.
  });
}

export async function saveProfile(name: string, profile: Profile): Promise<void> {
  const config = await readConfig();
  config.profiles[name] = { ...profile, createdAt: new Date().toISOString() };
  config.currentProfile = name;
  await writeConfig(config);
}

/** Returns true when a profile was actually removed. */
export async function removeProfile(name: string): Promise<boolean> {
  const config = await readConfig();
  if (!config.profiles[name]) return false;

  delete config.profiles[name];

  if (config.currentProfile === name) {
    config.currentProfile = Object.keys(config.profiles)[0] ?? DEFAULT_PROFILE;
  }

  await writeConfig(config);
  return true;
}

/** Deletes the whole config file. Used by `logout --all`. */
export async function clearConfig(): Promise<void> {
  await rm(configPath(), { force: true });
}

export interface ResolvedCredentials {
  registry: string;
  handle: string | undefined;
  apiKey: string | undefined;
  profile: string;
  /** Where each value came from, so `whoami` and `doctor` can explain it. */
  source: 'environment' | 'profile' | 'default';
}

/**
 * Resolves effective credentials.
 *
 * Precedence is explicit flag, then environment, then stored profile, then
 * built-in default -- the order every mature CLI uses, so scripted and
 * interactive use never fight over the same value.
 */
export async function resolveCredentials(
  overrides: { registry?: string; profile?: string } = {},
): Promise<ResolvedCredentials> {
  const config = await readConfig();
  const profileName = overrides.profile ?? process.env.NORIEN_PROFILE ?? config.currentProfile;
  const profile = config.profiles[profileName];

  const envRegistry = process.env.NORIEN_REGISTRY;
  const envHandle = process.env.NORIEN_ACTOR;
  const envKey = process.env.NORIEN_API_KEY;

  const registry = overrides.registry ?? envRegistry ?? profile?.registry ?? DEFAULT_BASE_URL;
  const handle = envHandle ?? profile?.handle;
  const apiKey = envKey ?? profile?.apiKey;

  const source: ResolvedCredentials['source'] =
    envHandle || envKey || envRegistry ? 'environment' : profile ? 'profile' : 'default';

  return {
    registry: registry.replace(/\/+$/, ''),
    handle,
    apiKey,
    profile: profileName,
    source,
  };
}
