import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  AGENTS_DIRNAME,
  ENV_EXAMPLE_FILENAME,
  LOCKFILE_NAME,
  MANIFEST_FILENAME,
  METADATA_FILENAME,
  README_FILENAME,
} from '@norien/runtime';
import type { InstallResult } from '@norien/sdk';

/**
 * Local install state.
 *
 * Agents install into `norien_agents/<slug>/` beside a `norien.lock.json`
 * manifest, deliberately mirroring `node_modules` + a lockfile: the layout is
 * immediately legible, the directory is safe to delete, and the lockfile is the
 * single record of what is installed at which version.
 */

// The layout is defined once in @norien/runtime, because the CLI, the
// supervisor, and any future worker must all agree on where agents live.
export {
  AGENTS_DIRNAME,
  ENV_EXAMPLE_FILENAME,
  LOCKFILE_NAME,
  MANIFEST_FILENAME,
  METADATA_FILENAME,
  README_FILENAME,
} from '@norien/runtime';

const ICON_CANDIDATES = ['icon.png', 'icon.svg', 'icon.jpg', 'icon.jpeg', 'icon.webp'];

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

const EMPTY_LOCKFILE: Lockfile = { version: 1, agents: {} };

export function agentsDir(cwd = process.cwd()): string {
  return path.join(cwd, AGENTS_DIRNAME);
}

export function agentDir(slug: string, cwd = process.cwd()): string {
  return path.join(agentsDir(cwd), slug);
}

export function lockfilePath(cwd = process.cwd()): string {
  return path.join(cwd, LOCKFILE_NAME);
}

export async function readLockfile(cwd = process.cwd()): Promise<Lockfile> {
  try {
    const raw = await readFile(lockfilePath(cwd), 'utf8');
    const parsed = JSON.parse(raw) as Partial<Lockfile>;
    return { version: 1, agents: parsed.agents ?? {} };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...EMPTY_LOCKFILE, agents: {} };
    if (error instanceof SyntaxError) {
      throw new Error(`${LOCKFILE_NAME} is not valid JSON. Fix or delete it and reinstall.`);
    }
    throw error;
  }
}

export async function writeLockfile(lockfile: Lockfile, cwd = process.cwd()): Promise<void> {
  // Sorted so the file produces clean diffs in version control.
  const agents = Object.fromEntries(
    Object.entries(lockfile.agents).sort(([a], [b]) => a.localeCompare(b)),
  );

  await writeFile(
    lockfilePath(cwd),
    `${JSON.stringify({ version: 1, agents }, null, 2)}\n`,
    'utf8',
  );
}

export async function recordInstall(entry: LockEntry, cwd = process.cwd()): Promise<void> {
  const lockfile = await readLockfile(cwd);
  lockfile.agents[entry.slug] = entry;
  await writeLockfile(lockfile, cwd);
}

export async function forgetInstall(slug: string, cwd = process.cwd()): Promise<boolean> {
  const lockfile = await readLockfile(cwd);
  if (!lockfile.agents[slug]) return false;

  delete lockfile.agents[slug];
  await writeLockfile(lockfile, cwd);
  return true;
}

export async function removeAgentDir(slug: string, cwd = process.cwd()): Promise<void> {
  await rm(agentDir(slug, cwd), { recursive: true, force: true });
}

/**
 * Renders `.env.example`.
 *
 * Required variables are listed first and left blank so a missing value fails
 * loudly rather than silently running with a placeholder. Optional variables
 * are pre-filled with their declared default and commented out.
 */
export function renderEnvExample(agent: {
  slug: string;
  version: string;
  environment_variables: {
    name: string;
    description?: string;
    required: boolean;
    secret: boolean;
    default?: string;
  }[];
}): string {
  const lines = [
    `# Environment for ${agent.slug}@${agent.version}`,
    '#',
    '# Copy to .env and fill in the required values.',
    '',
  ];

  const required = agent.environment_variables.filter((entry) => entry.required);
  const optional = agent.environment_variables.filter((entry) => !entry.required);

  if (required.length > 0) {
    lines.push('# --- Required ---', '');
    for (const entry of required) {
      if (entry.description) lines.push(`# ${entry.description}`);
      if (entry.secret) lines.push('# (secret - do not commit the filled-in value)');
      lines.push(`${entry.name}=${entry.default ?? ''}`, '');
    }
  }

  if (optional.length > 0) {
    lines.push('# --- Optional ---', '');
    for (const entry of optional) {
      if (entry.description) lines.push(`# ${entry.description}`);
      lines.push(`# ${entry.name}=${entry.default ?? ''}`, '');
    }
  }

  if (agent.environment_variables.length === 0) {
    lines.push('# This agent declares no environment variables.', '');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

/** Fallback README for an agent that published none. */
export function renderFallbackReadme(agent: {
  name: string;
  slug: string;
  version: string;
  description: string;
  author: string;
  install_command: string;
}): string {
  return [
    `# ${agent.name}`,
    '',
    agent.description,
    '',
    `- **Slug**: \`${agent.slug}\``,
    `- **Version**: ${agent.version}`,
    `- **Author**: ${agent.author}`,
    '',
    '## Install',
    '',
    '```bash',
    agent.install_command,
    '```',
    '',
    `_This agent did not publish a README. Generated by the Norien CLI._`,
    '',
  ].join('\n');
}

export interface WrittenFile {
  name: string;
  path: string;
  bytes: number;
}

/**
 * Writes the local agent folder. Returns what was written so the command can
 * report it rather than guessing.
 */
export async function materialiseAgent(
  result: InstallResult,
  options: { cwd?: string } = {},
): Promise<{ directory: string; files: WrittenFile[] }> {
  const cwd = options.cwd ?? process.cwd();
  const directory = agentDir(result.agent.slug, cwd);
  await mkdir(directory, { recursive: true });

  const files: WrittenFile[] = [];

  const write = async (name: string, content: string) => {
    const target = path.join(directory, name);
    await writeFile(target, content, 'utf8');
    files.push({ name, path: target, bytes: Buffer.byteLength(content, 'utf8') });
  };

  await write(MANIFEST_FILENAME, `${JSON.stringify(result.manifest, null, 2)}\n`);

  await write(
    README_FILENAME,
    result.agent.readme && result.agent.readme.trim().length > 0
      ? result.agent.readme.endsWith('\n')
        ? result.agent.readme
        : `${result.agent.readme}\n`
      : renderFallbackReadme(result.agent),
  );

  await write(ENV_EXAMPLE_FILENAME, renderEnvExample(result.agent));

  // Everything the registry resolved, kept alongside the manifest so `list`,
  // `update`, and `doctor` work without another network call.
  await write(
    METADATA_FILENAME,
    `${JSON.stringify(
      {
        slug: result.agent.slug,
        version: result.installation.installed_version,
        installed_at: result.installation.installed_at,
        install_command: result.install_command,
        runtime: result.runtime,
        permissions: result.permissions,
        dependencies: result.dependencies,
        environment: result.environment,
        icon: result.agent.icon,
        api_endpoint: result.agent.api_endpoint,
      },
      null,
      2,
    )}\n`,
  );

  return { directory, files };
}

// --- Publish-side detection ----------------------------------------------

export interface DetectedProject {
  root: string;
  manifestPath: string;
  manifest: Record<string, unknown>;
  readmePath: string | null;
  readme: string | null;
  iconPath: string | null;
}

async function firstExisting(root: string, candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    const target = path.join(root, candidate);
    try {
      const info = await stat(target);
      if (info.isFile()) return target;
    } catch {
      // Missing candidates are expected; keep looking.
    }
  }
  return null;
}

/** Case-insensitive README lookup, since casing varies across projects. */
async function findReadme(root: string): Promise<string | null> {
  try {
    const entries = await readdir(root);
    const match = entries.find((entry) => /^readme(\.md|\.markdown|\.txt)?$/i.test(entry));
    return match ? path.join(root, match) : null;
  } catch {
    return null;
  }
}

/**
 * Detects a publishable project: `agent.json` plus an optional README and icon.
 * Mirrors how `npm publish` reads `package.json` from the working directory.
 */
export async function detectProject(cwd = process.cwd()): Promise<DetectedProject> {
  const manifestPath = path.join(cwd, MANIFEST_FILENAME);

  let raw: string;
  try {
    raw = await readFile(manifestPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `No ${MANIFEST_FILENAME} found in ${cwd}. Run this from your agent's root directory.`,
      );
    }
    throw error;
  }

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`${manifestPath} is not valid JSON: ${(error as Error).message}`);
  }

  const readmePath = await findReadme(cwd);
  const readme = readmePath ? await readFile(readmePath, 'utf8') : null;
  const iconPath = await firstExisting(cwd, ICON_CANDIDATES);

  return { root: cwd, manifestPath, manifest, readmePath, readme, iconPath };
}
