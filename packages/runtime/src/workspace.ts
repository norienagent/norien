import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import type { AgentManifest } from '@norien/sdk';

import { RuntimeError } from './errors.js';

/**
 * Workspace layout.
 *
 * Defined here rather than in the CLI because the runtime, the CLI, and any
 * future worker all need the same answer to "where do installed agents live".
 * One definition, imported everywhere.
 */

export const AGENTS_DIRNAME = 'norien_agents';
export const LOCKFILE_NAME = 'norien.lock.json';
export const MANIFEST_FILENAME = 'agent.json';
export const README_FILENAME = 'README.md';
export const ENV_EXAMPLE_FILENAME = '.env.example';
export const METADATA_FILENAME = 'norien.metadata.json';
export const RUNTIME_STATE_DIRNAME = '.norien';

export interface LockEntry {
  slug: string;
  version: string;
  runtime: string | null;
  registry: string;
  installedAt: string;
  tools: string[];
  path: string;
}

export interface Lockfile {
  version: 1;
  agents: Record<string, LockEntry>;
}

export function agentsDir(workspace: string): string {
  return path.join(workspace, AGENTS_DIRNAME);
}

export function agentDir(workspace: string, slug: string): string {
  return path.join(agentsDir(workspace), slug);
}

export function lockfilePath(workspace: string): string {
  return path.join(workspace, LOCKFILE_NAME);
}

export function runtimeStateDir(workspace: string, slug: string): string {
  return path.join(agentDir(workspace, slug), RUNTIME_STATE_DIRNAME);
}

export async function readLockfile(workspace: string): Promise<Lockfile> {
  try {
    const raw = await readFile(lockfilePath(workspace), 'utf8');
    const parsed = JSON.parse(raw) as Partial<Lockfile>;
    return { version: 1, agents: parsed.agents ?? {} };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, agents: {} };
    if (error instanceof SyntaxError) {
      throw new RuntimeError('INTERNAL', `${LOCKFILE_NAME} is not valid JSON.`, {
        hint: 'Fix or delete it and reinstall.',
      });
    }
    throw error;
  }
}

export interface InstalledAgent {
  slug: string;
  version: string;
  directory: string;
  manifest: AgentManifest;
}

/** Reads and validates one installed agent's manifest. */
export async function readInstalledAgent(
  workspace: string,
  slug: string,
): Promise<InstalledAgent> {
  const directory = agentDir(workspace, slug);

  const info = await stat(directory).catch(() => null);
  if (!info?.isDirectory()) throw RuntimeError.notInstalled(slug);

  const manifestPath = path.join(directory, MANIFEST_FILENAME);

  let manifest: AgentManifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as AgentManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new RuntimeError('MANIFEST_INVALID', `${slug} has no ${MANIFEST_FILENAME}.`, {
        hint: `Reinstall it: norien install ${slug} --force`,
      });
    }
    throw new RuntimeError('MANIFEST_INVALID', `${manifestPath} is not valid JSON.`, {
      cause: error,
    });
  }

  if (!manifest.runtime) {
    throw new RuntimeError(
      'MANIFEST_INVALID',
      `${slug} declares no runtime in ${MANIFEST_FILENAME}.`,
      { hint: 'Add "runtime": "node" or "python".' },
    );
  }

  return {
    slug,
    version: manifest.version,
    directory,
    manifest,
  };
}

/**
 * Every installed agent.
 *
 * The lockfile is the source of truth, but the directory is scanned too: an
 * agent whose folder exists without a lockfile entry is still runnable, and
 * silently ignoring it would be more confusing than surfacing it.
 */
export async function listInstalledAgents(workspace: string): Promise<InstalledAgent[]> {
  const lockfile = await readLockfile(workspace);
  const slugs = new Set(Object.keys(lockfile.agents));

  const entries = await readdir(agentsDir(workspace), { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) slugs.add(entry.name);
  }

  const agents: InstalledAgent[] = [];

  for (const slug of [...slugs].sort()) {
    // A directory that cannot be read is skipped rather than failing the whole
    // listing -- one broken agent must not hide the others.
    const agent = await readInstalledAgent(workspace, slug).catch(() => null);
    if (agent) agents.push(agent);
  }

  return agents;
}
