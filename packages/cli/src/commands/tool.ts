import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

import inquirer from 'inquirer';

import type { Tool } from '@norien/sdk';
import { NorienError } from '@norien/sdk';
import {
  ToolError,
  ToolExecutor,
  ToolInstaller,
  TOOL_MANIFEST_FILENAME,
  generateToolDoc,
  readToolsLockfile,
  validateToolManifest,
} from '@norien/tools';

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

/**
 * `norien tool <command>`
 *
 * Registry-facing commands (search, info, publish) go through the SDK.
 * Local commands (install, remove, list, run) go through @norien/tools, which
 * owns the tool workspace and the plugin executor. This mirrors how the agent
 * commands split between the registry and the runtime.
 */

/** `norien tool search <keyword>` */
export async function toolSearch(
  context: CommandContext,
  keyword: string,
  options: { category?: string; runtime?: string; limit?: number },
): Promise<void> {
  const progress = spinner(`Searching tools for "${keyword}"`).start();

  const results = await context.client.tools
    .search({
      q: keyword,
      limit: options.limit ?? 20,
      ...(options.category ? { category: options.category } : {}),
      ...(options.runtime ? { runtime: options.runtime as 'node' | 'python' | 'http' } : {}),
    })
    .finally(() => progress.stop());

  if (context.json) {
    emitJson({ ok: true, query: keyword, ...results });
    return;
  }

  if (results.data.length === 0) {
    warn(`No tools match "${keyword}".`);
    return;
  }

  heading(`${results.meta.total} tool${results.meta.total === 1 ? '' : 's'} for "${keyword}"`);
  line();

  table(results.data, [
    { header: 'tool', value: (tool) => styles.title(tool.slug) },
    { header: 'version', value: (tool) => tool.version },
    { header: 'category', value: (tool) => tool.category },
    { header: 'runtime', value: (tool) => tool.runtime ?? '' },
    { header: 'author', value: (tool) => tool.author },
    { header: 'downloads', value: (tool) => formatDownloads(tool.downloads), align: 'right' },
    { header: 'description', value: (tool) => truncate(tool.description, 46) },
  ]);

  line();
  line(styles.dim('Install:'));
  for (const tool of results.data.slice(0, 5)) line(`  ${styles.code(tool.install_command)}`);
  line();
}

/** `norien tool info <slug>` */
export async function toolInfo(
  context: CommandContext,
  slug: string,
  options: { docs?: boolean; output?: string },
): Promise<void> {
  const progress = spinner(`Fetching ${slug}`).start();
  const tool = await context.client.tools.info(slug).finally(() => progress.stop());

  if (options.docs || options.output) {
    const doc = generateToolDoc(tool, { registry: context.credentials.registry });

    if (options.output) {
      await writeFile(options.output, doc, 'utf8');
      if (!context.json) success(`Wrote ${options.output}`);
      if (context.json) emitJson({ ok: true, output: options.output });
      return;
    }

    if (context.json) {
      emitJson({ ok: true, tool: tool.slug, doc });
      return;
    }

    line(doc);
    return;
  }

  if (context.json) {
    emitJson({ ok: true, tool });
    return;
  }

  heading(`${tool.name} ${styles.dim(`@${tool.version}`)}`);
  line(`  ${tool.description}`);
  line();

  definitions([
    ['slug', tool.slug],
    ['category', tool.category],
    ['runtime', tool.runtime ?? 'n/a'],
    ['entrypoint', tool.entrypoint],
    ['author', tool.author],
    ['license', tool.license],
    ['homepage', tool.homepage],
    ['repository', tool.repository],
    ['updated', `${relativeTime(tool.updated_at)} (${tool.updated_at.slice(0, 10)})`],
    ['tags', tool.tags.length > 0 ? tool.tags.join(', ') : null],
  ]);

  if (tool.authentication && tool.authentication.type !== 'none') {
    heading('Authentication');
    definitions([
      ['type', String(tool.authentication.type)],
      ['location', tool.authentication.location ? String(tool.authentication.location) : null],
      ['name', tool.authentication.name ? String(tool.authentication.name) : null],
    ]);
  }

  if (tool.permissions.length > 0) {
    heading('Permissions');
    for (const permission of tool.permissions) line(`  ${styles.warn('•')} ${permission}`);
  }

  if (tool.dependencies.length > 0) {
    heading('Depends on');
    for (const dependency of tool.dependencies) line(`  ${styles.dim('•')} ${dependency}`);
  }

  if (tool.environment.length > 0) {
    heading('Environment variables');
    for (const variable of tool.environment) {
      const flags = [
        variable.required ? styles.warn('required') : styles.dim('optional'),
        variable.secret ? styles.error('secret') : null,
      ]
        .filter(Boolean)
        .join(' · ');
      line(`  ${styles.key(variable.name.padEnd(24))} ${flags}`);
    }
  }

  heading('Input schema');
  line(indent(JSON.stringify(tool.input_schema, null, 2), 2));

  heading('Output schema');
  line(indent(JSON.stringify(tool.output_schema, null, 2), 2));

  heading('Install');
  line(`  ${styles.code(tool.install_command)}`);
  line();
  line(styles.dim(`  Full docs: norien tool info ${tool.slug} --docs`));
  line();
}

/** `norien tool install <slug|path>` */
export async function toolInstall(
  context: CommandContext,
  target: string,
  options: { version?: string },
): Promise<void> {
  const installer = new ToolInstaller(context.cwd);
  const local = await looksLikeLocalPath(target);

  const progress = spinner(local ? `Installing from ${target}` : `Resolving ${target}`).start();

  try {
    if (local) {
      const installed = await installer.installFromLocal(path.resolve(context.cwd, target), {
        registry: context.credentials.registry,
      });
      progress.succeed(`Installed ${installed.slug}@${installed.version} (${installed.runtime})`);

      if (context.json) return emitJson({ ok: true, ...installed });
      renderInstalled(installed.slug, installed.runtime, installed.executable, installed.directory);
      return;
    }

    const resolved = await context.client.tools.install(target, {
      ...(options.version ? { version: options.version } : {}),
    });

    // Dependency tools are materialised too, so one install brings everything.
    const dependencyNames: string[] = [];
    for (const dependency of resolved.dependencies) {
      const dep = await installer.installFromRegistry(dependency, {
        registry: context.credentials.registry,
      });
      dependencyNames.push(dep.slug);
    }

    const installed = await installer.installFromRegistry(resolved.tool, {
      registry: context.credentials.registry,
    });

    progress.succeed(`Installed ${installed.slug}@${installed.version} (${installed.runtime})`);

    if (context.json) {
      return emitJson({ ok: true, ...installed, dependencies: dependencyNames });
    }

    renderInstalled(installed.slug, installed.runtime, installed.executable, installed.directory);
    if (installed.fetched?.fetched) {
      const at = installed.fetched.commit
        ? `${installed.fetched.ref} (${installed.fetched.commit.slice(0, 8)})`
        : installed.fetched.ref;
      line(`  ${styles.ok('✓')} fetched source from ${at}`);
    } else if (installed.fetched?.reason) {
      line(`  ${styles.warn('!')} source not fetched: ${installed.fetched.reason}`);
    }
    if (dependencyNames.length > 0) {
      line(`  ${styles.dim('dependencies:')} ${dependencyNames.join(', ')}`);
    }
    line();
  } catch (error) {
    progress.fail(`Could not install ${target}`);
    throw asCliError(error);
  }
}

/** `norien tool publish` */
export async function toolPublish(
  context: CommandContext,
  options: { dryRun?: boolean; visibility?: 'public' | 'private' },
): Promise<void> {
  const handle = requireIdentity(context);
  const manifestPath = path.join(context.cwd, TOOL_MANIFEST_FILENAME);

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new CliError(`No ${TOOL_MANIFEST_FILENAME} found in ${context.cwd}.`, {
        exitCode: 2,
        details: ["Run this from your tool's root directory."],
      });
    }
    throw new CliError(`${manifestPath} is not valid JSON.`, { exitCode: 2 });
  }

  // Validated locally first, so obvious mistakes fail before an upload.
  let manifest;
  try {
    manifest = validateToolManifest(raw);
  } catch (error) {
    throw asCliError(error);
  }

  if (!context.json) {
    heading('Publish plan');
    definitions([
      ['tool', manifest.slug ?? manifest.name],
      ['version', manifest.version],
      ['category', manifest.category ?? 'utility'],
      ['runtime', manifest.runtime],
      ['permissions', (manifest.permissions ?? []).join(', ') || 'none'],
      ['dependencies', (manifest.dependencies ?? []).join(', ') || 'none'],
      ['author', handle],
    ]);
  }

  if (options.dryRun) {
    if (context.json) return emitJson({ ok: true, published: false, dry_run: true, manifest });
    line();
    line(styles.dim('Dry run — nothing was uploaded.'));
    line();
    return;
  }

  if (!context.yes && !context.json && process.stdin.isTTY) {
    const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
      {
        type: 'confirm',
        name: 'confirmed',
        message: `Publish ${manifest.slug ?? manifest.name}@${manifest.version} to ${context.credentials.registry}?`,
        default: true,
      },
    ]);
    if (!confirmed) {
      warn('Cancelled.');
      return;
    }
  }

  const progress = spinner(`Publishing ${manifest.slug ?? manifest.name}`).start();

  const tool = await context.client.tools
    .publish({
      ...manifest,
      ...(options.visibility ? { visibility: options.visibility } : {}),
    } as Parameters<typeof context.client.tools.publish>[0])
    .catch((error: unknown) => {
      progress.fail('Publish failed');
      throw error;
    });

  const url = `${context.credentials.registry}/tools/${tool.slug}`;
  progress.succeed(`Published ${tool.slug}@${tool.version}`);

  if (context.json) {
    return emitJson({ ok: true, published: true, tool, url });
  }

  heading('Published');
  definitions([
    ['url', url],
    ['version', tool.version],
    ['runtime', tool.runtime],
    ['install', tool.install_command],
  ]);
  line();
  success(`Anyone can now run ${styles.code(tool.install_command)}`);
  line();
}

/** `norien tool list` */
export async function toolList(context: CommandContext): Promise<void> {
  const lockfile = await readToolsLockfile(context.cwd);
  const entries = Object.values(lockfile.tools);

  if (context.json) {
    return emitJson({ ok: true, count: entries.length, tools: entries });
  }

  if (entries.length === 0) {
    warn('No tools installed in this workspace.');
    line(`  Install one with ${styles.code('norien tool install <slug>')}`);
    return;
  }

  heading(`${entries.length} tool${entries.length === 1 ? '' : 's'} installed`);
  line();
  table(entries, [
    { header: 'tool', value: (entry) => styles.title(entry.slug) },
    { header: 'version', value: (entry) => entry.version },
    { header: 'runtime', value: (entry) => entry.runtime },
    { header: 'source', value: (entry) => entry.source },
    { header: 'runnable', value: (entry) => (entry.executable ? styles.ok('yes') : styles.dim('manifest')) },
    { header: 'installed', value: (entry) => styles.dim(relativeTime(entry.installedAt)) },
  ]);
  line();
}

/** `norien tool update [slug]` */
export async function toolUpdate(
  context: CommandContext,
  slug: string | undefined,
  options: { check?: boolean },
): Promise<void> {
  const lockfile = await readToolsLockfile(context.cwd);
  const entries = slug
    ? Object.values(lockfile.tools).filter((entry) => entry.slug === slug)
    : Object.values(lockfile.tools);

  if (entries.length === 0) {
    throw new CliError(
      slug ? `${slug} is not installed here.` : 'No tools installed in this workspace.',
      { exitCode: 4, details: ["Run 'norien tool list' to see what is installed."] },
    );
  }

  const installer = new ToolInstaller(context.cwd);
  const progress = spinner('Checking for updates').start();
  const plans: { slug: string; from: string; to: string; outdated: boolean }[] = [];

  for (const entry of entries) {
    try {
      const latest = await context.client.tools.info(entry.slug);
      plans.push({ slug: entry.slug, from: entry.version, to: latest.version, outdated: latest.version !== entry.version });
    } catch {
      plans.push({ slug: entry.slug, from: entry.version, to: entry.version, outdated: false });
    }
  }

  progress.stop();
  const outdated = plans.filter((plan) => plan.outdated);

  if (!context.json) {
    if (outdated.length === 0) {
      success(`All ${plans.length} tool(s) are up to date.`);
      return;
    }
    heading(`${outdated.length} update${outdated.length === 1 ? '' : 's'} available`);
    for (const plan of outdated) {
      line(`  ${styles.title(plan.slug)}  ${styles.dim(plan.from)} → ${styles.ok(plan.to)}`);
    }
    line();
  }

  if (options.check) {
    if (context.json) emitJson({ ok: true, checked: plans.length, outdated: outdated.length, plans });
    else line(styles.dim("Run 'norien tool update' without --check to apply."));
    return;
  }

  const applied: string[] = [];
  for (const plan of outdated) {
    const resolved = await context.client.tools.install(plan.slug);
    await installer.installFromRegistry(resolved.tool, { registry: context.credentials.registry });
    applied.push(plan.slug);
  }

  if (context.json) {
    return emitJson({ ok: true, updated: applied, checked: plans.length });
  }

  if (applied.length > 0) success(`Updated ${applied.length} tool(s): ${applied.join(', ')}`);
}

/** `norien tool remove <slug>` */
export async function toolRemove(
  context: CommandContext,
  slug: string,
  options: { registry?: boolean },
): Promise<void> {
  const installer = new ToolInstaller(context.cwd);
  const removedLocal = await installer.uninstall(slug);

  let removedRemote = false;
  if (options.registry) {
    requireIdentity(context);
    try {
      await context.client.tools.delete(slug);
      removedRemote = true;
    } catch (error) {
      throw asCliError(error);
    }
  }

  if (context.json) {
    return emitJson({ ok: removedLocal || removedRemote, local: removedLocal, registry: removedRemote });
  }

  if (!removedLocal && !removedRemote) {
    warn(`${slug} was not installed here.`);
    return;
  }

  if (removedLocal) success(`Removed ${slug} from ${context.cwd}`);
  if (removedRemote) success(`Deleted ${slug} from the registry.`);
}

/** `norien tool run <slug>` — execute a tool through the plugin executor. */
export async function toolRun(
  context: CommandContext,
  slug: string,
  options: { input?: string; env?: string[]; timeout?: number; grantAll?: boolean },
): Promise<void> {
  const input = await resolveInput(options.input);
  const env = parseEnvPairs(options.env);

  const executor = new ToolExecutor(context.cwd, { registry: context.credentials.registry });
  const progress = spinner(`Running ${slug}`).start();

  try {
    const result = await executor.execute(slug, input, {
      env,
      ...(options.timeout !== undefined ? { timeoutMs: options.timeout * 1000 } : {}),
      // The CLI operator is trusted to run a tool they installed; agent-side
      // execution is where permissions are enforced.
    });

    progress.succeed(`${slug} completed in ${result.duration_ms}ms`);

    if (context.json) {
      return emitJson({ ok: true, ...result });
    }

    if (result.logs.trim()) {
      heading('Logs');
      line(indent(result.logs.trimEnd(), 2));
    }

    heading('Output');
    line(indent(JSON.stringify(result.output, null, 2), 2));
    line();
  } catch (error) {
    progress.fail(`${slug} failed`);
    throw asCliError(error);
  }
}

// --- Helpers --------------------------------------------------------------

function renderInstalled(slug: string, runtime: string, executable: boolean, directory: string): void {
  definitions([
    ['runtime', runtime],
    ['location', directory],
  ]);
  if (!executable && runtime !== 'http') {
    line();
    warn(
      `Installed the manifest for '${slug}', but a ${runtime} tool needs its code to run. ` +
        `Its manifest declares no source to fetch from — install from a local path instead: ` +
        `norien tool install ./path/to/${slug}`,
    );
  } else {
    line();
    success(`Ready to run: norien tool run ${slug}`);
  }
}

async function looksLikeLocalPath(target: string): Promise<boolean> {
  if (target.startsWith('.') || target.startsWith('/') || target.includes(path.sep)) return true;
  // A bare name that happens to be a local directory with a tool.json.
  const candidate = path.resolve(process.cwd(), target, TOOL_MANIFEST_FILENAME);
  return stat(candidate).then(
    (info) => info.isFile(),
    () => false,
  );
}

async function resolveInput(input: string | undefined): Promise<unknown> {
  // Explicit --input wins; otherwise read JSON from stdin when it is piped.
  if (input !== undefined) return parseJsonArg(input);

  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (text) return parseJsonArg(text);
  }

  return {};
}

function parseJsonArg(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CliError(`--input is not valid JSON: ${(error as Error).message}`, { exitCode: 2 });
  }
}

function parseEnvPairs(pairs: string[] | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!pairs) return result;
  for (const pair of pairs) {
    const separator = pair.indexOf('=');
    if (separator <= 0) {
      throw new CliError(`Invalid --env value '${pair}'. Expected KEY=value.`, { exitCode: 2 });
    }
    result[pair.slice(0, separator)] = pair.slice(separator + 1);
  }
  return result;
}

/** Maps a ToolError or NorienError onto a CliError with a matching exit code. */
function asCliError(error: unknown): CliError | NorienError {
  if (error instanceof NorienError) return error;

  if (error instanceof ToolError) {
    const exitCode =
      error.code === 'PERMISSION_DENIED'
        ? 7
        : error.code === 'TOOL_NOT_INSTALLED'
          ? 4
          : error.code === 'INPUT_INVALID' || error.code === 'MANIFEST_INVALID'
            ? 5
            : 1;
    return new CliError(error.message, {
      exitCode,
      details: [...error.details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)), ...(error.hint ? [error.hint] : [])],
    });
  }

  return new CliError(error instanceof Error ? error.message : String(error), { exitCode: 1 });
}

function formatDownloads(value: number | undefined): string {
  return typeof value === 'number' ? value.toLocaleString('en-US') : '';
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function indent(text: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((row) => (row.length > 0 ? prefix + row : row))
    .join('\n');
}
