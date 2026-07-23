import path from 'node:path';

import inquirer from 'inquirer';

import type { Diagnostic, NormalizedAgent } from '@norien/sdk';

import { type CommandContext, requireIdentity } from '../context.js';
import {
  CliError,
  definitions,
  emitJson,
  heading,
  line,
  spinner,
  styles,
  success,
  warn,
} from '../ui.js';
import { detectProject } from '../workspace.js';

/**
 * `norien publish`
 *
 * Detects `agent.json`, the README, and an icon in the working directory,
 * validates through the registry's own `/runtime/inspect` (so the CLI can
 * never disagree with the server about what is valid), then uploads.
 */
export async function publish(
  context: CommandContext,
  options: {
    dryRun?: boolean;
    tag?: string[];
    visibility?: 'public' | 'private';
    slug?: string;
    cwd?: string;
  },
): Promise<void> {
  const handle = requireIdentity(context);
  const cwd = options.cwd ?? context.cwd;

  const detecting = spinner('Detecting project').start();
  const project = await detectProject(cwd).catch((error: unknown) => {
    detecting.fail('No publishable project found');
    throw new CliError((error as Error).message, { exitCode: 2 });
  });

  detecting.succeed(`Found ${path.basename(project.manifestPath)}`);

  if (!context.json) {
    definitions([
      ['manifest', path.relative(cwd, project.manifestPath) || 'agent.json'],
      ['readme', project.readmePath ? path.relative(cwd, project.readmePath) : 'not found'],
      ['icon', project.iconPath ? path.relative(cwd, project.iconPath) : 'not found'],
    ]);
  }

  // The registry stores an icon URL; there is no binary upload endpoint. A
  // local file cannot become one, so say so rather than silently dropping it.
  const manifestIcon = typeof project.manifest.icon === 'string' ? project.manifest.icon : undefined;
  if (project.iconPath && !manifestIcon) {
    warn(
      `Found ${path.basename(project.iconPath)}, but the registry stores icons by URL. ` +
        'Host it and set "icon" in agent.json to publish it.',
    );
  }

  const validating = spinner('Validating manifest').start();

  let inspection: NormalizedAgent;
  try {
    inspection = await context.client.runtime.inspect(project.manifest, {
      ...(options.slug ? { slug: options.slug } : {}),
    });
  } catch (error) {
    validating.fail('Manifest is invalid');
    throw error;
  }

  // `/runtime/inspect` answers "could this run here?", so it flags environment
  // variables the *calling machine* has not set. Publishing is a different
  // question: the author is declaring what the agent needs, not running it.
  // Those diagnostics are therefore informational here, not blocking.
  const blocking = inspection.diagnostics.filter(
    (entry) => entry.level === 'error' && entry.code !== 'ENVIRONMENT_MISSING',
  );
  const errors = blocking;
  const warnings = inspection.diagnostics.filter((entry) => entry.level === 'warning');

  if (errors.length > 0) {
    validating.fail('Manifest cannot be published');
    renderDiagnostics(errors, warnings, context.json);

    if (context.json) {
      emitJson({ ok: false, published: false, inspection });
    }

    throw new CliError(`${errors.length} problem(s) must be fixed before publishing.`, {
      exitCode: 5,
    });
  }

  if (!inspection.version_check.acceptable) {
    validating.fail('Version conflict');
    throw new CliError(
      inspection.version_check.conflict_reason ?? 'This version cannot be published.',
      {
        exitCode: 5,
        details: [
          `latest published: ${inspection.version_check.latest_published ?? 'none'}`,
          'Bump "version" in agent.json and try again.',
        ],
      },
    );
  }

  validating.succeed(
    `Manifest valid — would ${inspection.version_check.action === 'create' ? 'create' : 'add version'} ${inspection.slug}@${inspection.version}`,
  );

  if (warnings.length > 0 && !context.json) {
    for (const warning of warnings) warn(`${warning.code}: ${warning.message}`);
  }

  if (options.dryRun) {
    if (context.json) {
      emitJson({ ok: true, published: false, dry_run: true, inspection });
      return;
    }

    renderPlan(inspection, handle);
    line();
    line(styles.dim('Dry run — nothing was uploaded.'));
    line();
    return;
  }

  if (!context.yes && !context.json && process.stdin.isTTY) {
    renderPlan(inspection, handle);
    line();

    const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
      {
        type: 'confirm',
        name: 'confirmed',
        message: `Publish ${inspection.slug}@${inspection.version} to ${context.credentials.registry}?`,
        default: true,
      },
    ]);

    if (!confirmed) {
      warn('Cancelled.');
      return;
    }
  }

  const uploading = spinner(`Publishing ${inspection.slug}@${inspection.version}`).start();

  const payload: Record<string, unknown> = {
    type: 'agent',
    manifest: project.manifest,
    ...(options.slug ? { slug: options.slug } : {}),
    ...(project.readme ? { readme: project.readme } : {}),
    ...(options.tag?.length ? { tags: options.tag } : {}),
    ...(options.visibility ? { visibility: options.visibility } : {}),
  };

  const result = await context.client.publish(payload).catch((error: unknown) => {
    uploading.fail('Publish failed');
    throw error;
  });

  if (result.type !== 'agent') {
    uploading.fail('Unexpected response');
    throw new CliError('The registry did not return an agent.', { exitCode: 1 });
  }

  const agent = result.agent;
  const url = `${context.credentials.registry}/agents/${agent.slug}`;

  uploading.succeed(`Published ${agent.slug}@${agent.version}`);

  if (context.json) {
    emitJson({
      ok: true,
      published: true,
      agent,
      url,
      install_command: agent.install_command,
    });
    return;
  }

  heading('Published');
  definitions([
    ['url', url],
    ['version', agent.version],
    ['author', agent.author],
    ['visibility', agent.visibility],
    ['runtime', agent.runtime],
    ['install', agent.install_command],
  ]);
  line();
  success(`Anyone can now run ${styles.code(agent.install_command)}`);
  line();
}

function renderPlan(inspection: NormalizedAgent, handle: string): void {
  heading('Publish plan');
  definitions([
    ['slug', inspection.slug],
    ['version', `${inspection.version_check.latest_published ?? 'none'} → ${inspection.version}`],
    ['action', inspection.version_check.action],
    ['author', handle],
    ['runtime', `${inspection.runtime.name} (${inspection.runtime.source})`],
    ['start', inspection.runtime.commands.start],
    ['tools', inspection.dependencies.resolved.map((tool) => tool.slug).join(', ') || 'none'],
    ['permissions', inspection.permissions.join(', ') || 'none'],
    [
      'environment',
      inspection.environment.variables.map((entry) => entry.name).join(', ') || 'none',
    ],
  ]);
}

function renderDiagnostics(errors: Diagnostic[], warnings: Diagnostic[], json: boolean): void {
  if (json) return;

  heading('Problems');
  for (const entry of errors) {
    line(`  ${styles.error('✗')} ${entry.field ? `${styles.key(entry.field)} ` : ''}${entry.message}`);
  }
  for (const entry of warnings) {
    line(`  ${styles.warn('!')} ${entry.field ? `${styles.key(entry.field)} ` : ''}${entry.message}`);
  }
  line();
}
