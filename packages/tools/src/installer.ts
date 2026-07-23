import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { EnvironmentVariable, Tool } from '@norien-live/sdk';

import { ToolError } from './errors.js';
import { type ToolManifest, normalizeEnvironment, validateToolManifest } from './manifest.js';
import { type FetchResult, fetchSource } from './source.js';
import {
  ENV_EXAMPLE_FILENAME,
  TOOL_MANIFEST_FILENAME,
  TOOL_METADATA_FILENAME,
  type ToolLockEntry,
  type ToolSource,
  readToolsLockfile,
  toolDir,
  writeToolsLockfile,
} from './workspace.js';

/**
 * Tool Installer.
 *
 * Materialises a tool into `norien_tools/<slug>/`. Two sources, because the
 * registry distributes manifests rather than code bundles:
 *
 * - **registry**: writes the reconstructed `tool.json`, `.env.example`, and
 *   metadata. Immediately runnable for `http` tools; a `node`/`python` tool
 *   installed this way is a declaration until its code is provided.
 * - **local**: copies a directory that already contains `tool.json` and the
 *   entrypoint, so `node`/`python` tools are runnable.
 */

const IGNORED_ON_COPY = new Set(['node_modules', '.git', '.norien', ENV_EXAMPLE_FILENAME]);

export interface InstalledTool {
  slug: string;
  version: string;
  runtime: string;
  directory: string;
  source: ToolSource;
  executable: boolean;
  manifest: ToolManifest;
  files: string[];
  /** Set when a declared `source` was fetched during a registry install. */
  fetched?: FetchResult;
}

export class ToolInstaller {
  constructor(private readonly workspace: string) {}

  /** Reconstructs a `tool.json` from a registry tool record. */
  private manifestFromRegistry(tool: Tool): ToolManifest {
    return {
      name: tool.name,
      slug: tool.slug,
      version: tool.version,
      description: tool.description,
      category: tool.category,
      runtime: (tool.runtime ?? 'http') as ToolManifest['runtime'],
      entrypoint: tool.entrypoint ?? '',
      input_schema: tool.input_schema,
      output_schema: tool.output_schema,
      ...(tool.authentication ? { authentication: tool.authentication } : {}),
      environment: tool.environment ?? [],
      permissions: tool.permissions ?? [],
      dependencies: tool.dependencies ?? [],
      author: tool.author,
      ...(tool.license ? { license: tool.license } : {}),
      ...(tool.homepage ? { homepage: tool.homepage } : {}),
      ...(tool.repository ? { repository: tool.repository } : {}),
      ...(tool.documentation ? { documentation: tool.documentation } : {}),
    };
  }

  /** Installs a tool resolved from the registry (manifest only). */
  async installFromRegistry(tool: Tool, options: { registry: string }): Promise<InstalledTool> {
    const manifest = validateToolManifest(this.manifestFromRegistry(tool));
    // An http tool is fully runnable from its manifest; a local-runtime tool
    // needs its code, which a registry install does not carry.
    const executable = manifest.runtime === 'http';

    const installed = await this.materialise(manifest, {
      source: 'registry',
      registry: options.registry,
      executable,
      copyFrom: null,
    });

    // A node/python tool that declared where its code lives: fetch it, the same
    // way an agent does. Cloning only — nothing runs. If the code arrives and
    // the entrypoint now exists, the tool becomes executable.
    if (!installed.executable && manifest.entrypoint && manifest.source) {
      const fetch = await fetchSource(manifest.source, installed.directory, {
        entrypoint: manifest.entrypoint,
      });
      if (fetch.fetched && !fetch.reason) {
        installed.executable = true;
        installed.fetched = fetch;
      } else if (fetch.fetched || fetch.reason !== 'no source declared') {
        installed.fetched = fetch;
      }
    }

    return installed;
  }

  /** Installs a tool from a local directory containing `tool.json`. */
  async installFromLocal(
    sourceDir: string,
    options: { registry: string },
  ): Promise<InstalledTool> {
    const manifestPath = path.join(sourceDir, TOOL_MANIFEST_FILENAME);

    let manifest: ToolManifest;
    try {
      manifest = validateToolManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new ToolError('MANIFEST_INVALID', `No ${TOOL_MANIFEST_FILENAME} in ${sourceDir}.`, {
          hint: 'Run this from a directory that contains a tool.json.',
        });
      }
      throw error;
    }

    // http tools carry no local entrypoint; local-runtime tools do.
    const executable =
      manifest.runtime === 'http' ||
      (await fileExists(path.join(sourceDir, manifest.entrypoint)));

    return this.materialise(manifest, {
      source: 'local',
      registry: options.registry,
      executable,
      copyFrom: sourceDir,
    });
  }

  /** Shared write path for both sources. */
  private async materialise(
    manifest: ToolManifest,
    context: { source: ToolSource; registry: string; executable: boolean; copyFrom: string | null },
  ): Promise<InstalledTool> {
    const slug = manifest.slug ?? slugify(manifest.name);
    const directory = toolDir(this.workspace, slug);

    await mkdir(directory, { recursive: true });

    // Local installs copy the whole project so the entrypoint comes along;
    // registry installs only write the manifest artefacts.
    if (context.copyFrom) {
      await cp(context.copyFrom, directory, {
        recursive: true,
        filter: (source) => !IGNORED_ON_COPY.has(path.basename(source)),
      });
    }

    const files: string[] = [];
    const write = async (name: string, content: string) => {
      await writeFile(path.join(directory, name), content, 'utf8');
      files.push(name);
    };

    await write(TOOL_MANIFEST_FILENAME, `${JSON.stringify(manifest, null, 2)}\n`);
    await write(ENV_EXAMPLE_FILENAME, renderEnvExample(manifest));
    await write(
      TOOL_METADATA_FILENAME,
      `${JSON.stringify(
        {
          slug,
          version: manifest.version,
          runtime: manifest.runtime,
          source: context.source,
          executable: context.executable,
          registry: context.registry,
          installed_at: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
    );

    await this.record({
      slug,
      version: manifest.version,
      runtime: manifest.runtime,
      source: context.source,
      executable: context.executable,
      registry: context.registry,
      installedAt: new Date().toISOString(),
      path: path.relative(this.workspace, directory).split(path.sep).join('/'),
    });

    return {
      slug,
      version: manifest.version,
      runtime: manifest.runtime,
      directory,
      source: context.source,
      executable: context.executable,
      manifest,
      files,
    };
  }

  private async record(entry: ToolLockEntry): Promise<void> {
    const lockfile = await readToolsLockfile(this.workspace);
    lockfile.tools[entry.slug] = entry;
    await writeToolsLockfile(this.workspace, lockfile);
  }

  /** Removes a tool's directory and lockfile entry. */
  async uninstall(slug: string): Promise<boolean> {
    const lockfile = await readToolsLockfile(this.workspace);
    const known = Boolean(lockfile.tools[slug]);

    await rm(toolDir(this.workspace, slug), { recursive: true, force: true });

    if (known) {
      delete lockfile.tools[slug];
      await writeToolsLockfile(this.workspace, lockfile);
    }

    return known;
  }
}

function renderEnvExample(manifest: ToolManifest): string {
  const variables: EnvironmentVariable[] = normalizeEnvironment(manifest.environment);

  const lines = [
    `# Environment for ${manifest.slug ?? slugify(manifest.name)}@${manifest.version}`,
    '#',
    '# Copy to .env and fill in the required values.',
    '',
  ];

  const required = variables.filter((entry) => entry.required);
  const optional = variables.filter((entry) => !entry.required);

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

  if (variables.length === 0) lines.push('# This tool declares no environment variables.', '');

  return `${lines.join('\n').trimEnd()}\n`;
}

async function fileExists(target: string): Promise<boolean> {
  return stat(target).then(
    (info) => info.isFile(),
    () => false,
  );
}

function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
