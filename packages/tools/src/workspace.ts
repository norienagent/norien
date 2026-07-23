import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ToolError } from './errors.js';
import type { ToolManifest } from './manifest.js';

/**
 * Tool workspace layout.
 *
 * Tools install into `norien_tools/<slug>/` beside `norien.tools.lock.json`,
 * deliberately parallel to how agents install into `norien_agents/`. Same
 * mental model, separate namespace.
 */

export const TOOLS_DIRNAME = 'norien_tools';
export const TOOLS_LOCKFILE = 'norien.tools.lock.json';
export const TOOL_MANIFEST_FILENAME = 'tool.json';
export const TOOL_METADATA_FILENAME = 'norien.tool.metadata.json';
export const ENV_EXAMPLE_FILENAME = '.env.example';

/** How a tool arrived: pulled from the registry, or copied from a local path. */
export type ToolSource = 'registry' | 'local';

export interface ToolLockEntry {
  slug: string;
  version: string;
  runtime: string;
  source: ToolSource;
  /** True when the entrypoint code is present locally (runnable). */
  executable: boolean;
  registry: string;
  installedAt: string;
  path: string;
}

export interface ToolLockfile {
  version: 1;
  tools: Record<string, ToolLockEntry>;
}

export function toolsDir(workspace: string): string {
  return path.join(workspace, TOOLS_DIRNAME);
}

export function toolDir(workspace: string, slug: string): string {
  return path.join(toolsDir(workspace), slug);
}

export function toolsLockfilePath(workspace: string): string {
  return path.join(workspace, TOOLS_LOCKFILE);
}

export async function readToolsLockfile(workspace: string): Promise<ToolLockfile> {
  try {
    const raw = await readFile(toolsLockfilePath(workspace), 'utf8');
    const parsed = JSON.parse(raw) as Partial<ToolLockfile>;
    return { version: 1, tools: parsed.tools ?? {} };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, tools: {} };
    if (error instanceof SyntaxError) {
      throw new ToolError('INTERNAL', `${TOOLS_LOCKFILE} is not valid JSON.`, {
        hint: 'Fix or delete it and reinstall.',
      });
    }
    throw error;
  }
}

export async function writeToolsLockfile(workspace: string, lockfile: ToolLockfile): Promise<void> {
  // Sorted for clean diffs in version control.
  const tools = Object.fromEntries(
    Object.entries(lockfile.tools).sort(([a], [b]) => a.localeCompare(b)),
  );

  await writeFile(
    toolsLockfilePath(workspace),
    `${JSON.stringify({ version: 1, tools }, null, 2)}\n`,
    'utf8',
  );
}

/**
 * Reads an installed tool's manifest from disk.
 *
 * The manifest is the source of truth for execution -- the lockfile only
 * records what is installed and where.
 */
export async function readInstalledToolManifest(
  workspace: string,
  slug: string,
): Promise<ToolManifest> {
  const manifestPath = path.join(toolDir(workspace, slug), TOOL_MANIFEST_FILENAME);

  try {
    return JSON.parse(await readFile(manifestPath, 'utf8')) as ToolManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw ToolError.notInstalled(slug);
    throw new ToolError('MANIFEST_INVALID', `${manifestPath} is not valid JSON.`, { cause: error });
  }
}
