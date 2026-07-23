import type { Agent, SearchHit, Tool } from '@norien-live/sdk';

import type { CommandContext } from '../context.js';
import {
  definitions,
  emitJson,
  heading,
  line,
  relativeTime,
  spinner,
  styles,
  table,
  warn,
} from '../ui.js';

/** One row shape for both catalogues, so the table renders uniformly. */
interface SearchRow {
  type: string;
  name: string;
  version: string;
  author: string;
  downloads?: number | undefined;
  updated: string | null;
  description: string;
  installCommand: string;
}

/**
 * `norien search <keyword>`
 *
 * The Downloads column is rendered only when the registry actually returns the
 * field. It does not today, so the column is absent rather than showing a
 * fabricated or permanently blank value; it appears on its own once install
 * counts are exposed.
 */
export async function search(
  context: CommandContext,
  keyword: string,
  options: {
    type?: 'all' | 'agent' | 'tool' | 'token' | 'project';
    limit?: number;
    tag?: string[];
    author?: string;
  },
): Promise<void> {
  const progress = spinner(`Searching for "${keyword}"`).start();
  const type = options.type ?? 'all';
  const limit = options.limit ?? 20;

  const wantsRegistry = type === 'all' || type === 'agent' || type === 'tool';
  const wantsMarket = type === 'all' || type === 'token' || type === 'project';

  // Global search spans two catalogues: the registry (agents and tools) and
  // market data (tokens and projects). Both are queried concurrently and
  // merged into the one envelope, so `--type` narrows without changing shape.
  const [registry, market] = await Promise.all([
    wantsRegistry
      ? context.client.search({
          q: keyword,
          type: type === 'all' ? 'all' : (type as 'agent' | 'tool'),
          limit,
          ...(options.tag?.length ? { tag: options.tag } : {}),
          ...(options.author ? { author: options.author } : {}),
        })
      : Promise.resolve(null),
    wantsMarket
      ? context.client.market.all(keyword, { limit }).catch(() => null)
      : Promise.resolve(null),
  ]).finally(() => progress.stop());

  // Both catalogues collapse into one row shape for rendering, so neither
  // side's field names leak into the table.
  const registryRows: SearchRow[] = (registry?.data ?? []).map((hit) => ({
    type: hit.type,
    name: hit.item.slug,
    version: hit.item.version,
    author: hit.item.author,
    downloads: hit.item.downloads,
    updated: hit.item.updated_at,
    description: hit.item.description,
    installCommand: hit.type === 'agent' ? hit.item.install_command : `norien tool install ${hit.item.slug}`,
  }));

  const marketRows: SearchRow[] = (market?.data.items ?? [])
    .filter((hit) => (type === 'all' ? hit.kind !== 'address' : hit.kind === type))
    .map((hit) => ({
      type: hit.kind,
      name: hit.id,
      version: '',
      author: hit.chain?.name ?? '',
      updated: null,
      description: hit.symbol ? `${hit.name} (${hit.symbol})` : hit.name,
      installCommand: hit.kind === 'token' ? `norien token ${hit.id}` : `norien project ${hit.id}`,
    }));

  const rows = [...registryRows, ...marketRows];

  const results = {
    data: rows,
    meta: {
      total: (registry?.meta.total ?? 0) + marketRows.length,
      limit,
      offset: 0,
      has_more: registry?.meta.has_more ?? false,
      next_offset: registry?.meta.next_offset ?? null,
    },
  };

  if (context.json) {
    emitJson({ ok: true, query: keyword, ...results });
    return;
  }

  if (results.data.length === 0) {
    warn(`No results for "${keyword}".`);
    return;
  }

  heading(`${results.meta.total} result${results.meta.total === 1 ? '' : 's'} for "${keyword}"`);
  line();

  table(results.data, [
    { header: 'type', value: (row) => styles.dim(row.type) },
    { header: 'name', value: (row) => styles.title(row.name) },
    { header: 'version', value: (row) => row.version },
    { header: 'author', value: (row) => row.author },
    // Dropped automatically while every cell is empty.
    { header: 'downloads', value: (row) => formatDownloads(row.downloads), align: 'right' },
    { header: 'updated', value: (row) => styles.dim(row.updated ? relativeTime(row.updated) : '') },
    { header: 'description', value: (row) => truncate(row.description, 52) },
  ]);

  line();
  line(styles.dim('Next:'));
  for (const row of results.data.slice(0, 5)) {
    line(`  ${styles.code(row.installCommand)}`);
  }

  if (results.meta.has_more) {
    line();
    line(styles.dim(`${results.meta.total - results.data.length} more. Use --limit to show them.`));
  }
  line();
}

/**
 * `norien info <agent>`
 *
 * Combines the agent record with its normalized runtime view, because the two
 * together are what a developer needs before deciding to install.
 */
export async function info(
  context: CommandContext,
  slug: string,
  options: { version?: string; readme?: boolean },
): Promise<void> {
  const progress = spinner(`Fetching ${slug}`).start();

  const agent = await context.client.info(slug, {
    ...(options.version ? { version: options.version } : {}),
  });

  // Best-effort: a pinned older version still resolves against the current
  // catalogue head, so a runtime failure must not break `info`.
  let runtime = null;
  try {
    runtime = await context.client.agents.runtime(slug);
  } catch {
    runtime = null;
  }

  progress.stop();

  if (context.json) {
    emitJson({ ok: true, agent, runtime });
    return;
  }

  heading(`${agent.name} ${styles.dim(`@${agent.version}`)}`);
  line(`  ${agent.description}`);
  line();

  definitions([
    ['slug', agent.slug],
    ['author', agent.author],
    ['runtime', agent.runtime ?? runtime?.runtime.name ?? null],
    ['entrypoint', agent.entrypoint],
    ['start', runtime?.runtime.commands.start ?? agent.commands.start ?? null],
    ['health', runtime?.runtime.commands.health ?? agent.commands.health ?? null],
    ['visibility', agent.visibility],
    ['updated', `${relativeTime(agent.updated_at)} (${agent.updated_at.slice(0, 10)})`],
    ['tags', agent.tags.length > 0 ? agent.tags.join(', ') : null],
    ['icon', agent.icon],
    ['endpoint', agent.api_endpoint],
  ]);

  if (agent.permissions.length > 0) {
    heading('Permissions');
    for (const permission of agent.permissions) line(`  ${styles.warn('•')} ${permission}`);
  }

  heading('Required tools');
  if (agent.required_tools.length === 0) {
    line(styles.dim('  none'));
  } else if (runtime) {
    for (const tool of runtime.dependencies.resolved) {
      line(
        `  ${styles.ok('✓')} ${styles.title(tool.slug.padEnd(16))} ${tool.version.padEnd(8)} ${styles.dim(
          `${tool.category} · auth: ${tool.authentication.type}`,
        )}`,
      );
    }
    for (const missing of runtime.dependencies.missing) {
      line(`  ${styles.error('✗')} ${styles.title(missing.padEnd(16))} ${styles.error('not published')}`);
    }
  } else {
    for (const tool of agent.required_tools) line(`  ${styles.dim('•')} ${tool}`);
  }

  heading('Environment variables');
  if (agent.environment_variables.length === 0) {
    line(styles.dim('  none'));
  } else {
    for (const variable of agent.environment_variables) {
      const flags = [
        variable.required ? styles.warn('required') : styles.dim('optional'),
        variable.secret ? styles.error('secret') : null,
        variable.default !== undefined ? styles.dim(`default: ${variable.default}`) : null,
      ]
        .filter(Boolean)
        .join(' · ');

      line(`  ${styles.key(variable.name.padEnd(24))} ${flags}`);
      if (variable.description) line(`    ${styles.dim(variable.description)}`);
    }
  }

  heading('Manifest');
  line(indent(JSON.stringify(agent.manifest, null, 2), 2));

  heading('Install');
  line(`  ${styles.code(agent.install_command)}`);

  if (options.readme) {
    heading('README');
    line(agent.readme ? indent(agent.readme, 2) : styles.dim('  (none published)'));
  } else if (agent.readme) {
    line();
    line(styles.dim(`  README available — rerun with --readme to print it.`));
  }

  line();
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

export type { Agent, Tool };
