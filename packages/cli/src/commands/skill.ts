import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { CommandContext } from '../context.js';
import { CliError, definitions, emitJson, heading, line, spinner, styles, table } from '../ui.js';

/**
 * `norien skill …` — the runnable-capability catalogue.
 *
 * Skills are grounded in Norien's live data, so `run` is the point: it streams
 * a real, data-backed result. Talks to `/api/skills*` directly (the SDK client
 * predates skills), the same way `norien chat` talks to `/api/chat/stream`.
 */

interface Skill {
  slug: string;
  name: string;
  description: string;
  version: string;
  category: string;
  author: string;
  tags: string[];
  instructions: string;
  data_source: string;
  input_hint: string | null;
  examples: string[];
  updated_at: string;
}

const api = (context: CommandContext, pathname: string): string =>
  new URL(pathname, context.credentials.registry).toString();

async function getJson<T>(context: CommandContext, pathname: string): Promise<T> {
  const response = await fetch(api(context, pathname), { headers: { accept: 'application/json' } });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new CliError(body?.error?.message ?? `Request failed (${response.status}).`, {
      exitCode: response.status === 404 ? 4 : 1,
    });
  }
  return response.json() as Promise<T>;
}

export async function skillSearch(
  context: CommandContext,
  keyword: string | undefined,
  options: { limit?: number },
): Promise<void> {
  const progress = spinner(keyword ? `Searching skills for "${keyword}"` : 'Loading skills').start();
  const query = new URLSearchParams();
  if (keyword) query.set('q', keyword);
  query.set('limit', String(options.limit ?? 20));
  const result = await getJson<{ data: Skill[]; meta: { total: number } }>(
    context,
    `/api/skills?${query.toString()}`,
  ).finally(() => progress.stop());

  if (context.json) {
    emitJson({ ok: true, ...result });
    return;
  }
  if (result.data.length === 0) {
    line(styles.warn(keyword ? `No skills match "${keyword}".` : 'No skills yet.'));
    return;
  }
  heading(`${result.meta.total} skill${result.meta.total === 1 ? '' : 's'}`);
  line();
  table(result.data, [
    { header: 'slug', value: (s) => styles.title(s.slug) },
    { header: 'data', value: (s) => styles.dim(s.data_source) },
    { header: 'name', value: (s) => s.name },
    { header: 'description', value: (s) => (s.description.length > 52 ? `${s.description.slice(0, 51)}…` : s.description) },
  ]);
  line();
  line(styles.dim('Run:'));
  for (const s of result.data.slice(0, 5)) line(`  ${styles.code(`norien skill run ${s.slug}`)}`);
  line();
}

export async function skillInfo(context: CommandContext, slug: string): Promise<void> {
  const progress = spinner(`Fetching ${slug}`).start();
  const skill = await getJson<Skill>(context, `/api/skills/${encodeURIComponent(slug)}`).finally(() =>
    progress.stop(),
  );

  if (context.json) {
    emitJson({ ok: true, skill });
    return;
  }
  heading(`${skill.name} ${styles.dim(`@${skill.version}`)}`);
  line(`  ${skill.description}`);
  line();
  definitions([
    ['slug', skill.slug],
    ['author', skill.author],
    ['data source', skill.data_source],
    ['input', skill.input_hint],
    ['tags', skill.tags.length > 0 ? skill.tags.join(', ') : null],
  ]);
  heading('Instructions');
  line(
    skill.instructions
      .split('\n')
      .map((l) => `  ${styles.dim(l)}`)
      .join('\n'),
  );
  if (skill.examples.length > 0) {
    heading('Examples');
    for (const ex of skill.examples) line(`  ${styles.code(`norien skill run ${skill.slug} "${ex}"`)}`);
  }
  line();
}

export async function skillRun(
  context: CommandContext,
  slug: string,
  input: string | undefined,
  options: { message?: string },
): Promise<void> {
  const text = (input ?? options.message ?? '').toString();
  const response = await fetch(api(context, `/api/skills/${encodeURIComponent(slug)}/run`), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ input: text }),
  });

  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new CliError(body?.error?.message ?? `Skill run failed (${response.status}).`, {
      exitCode: response.status === 404 ? 4 : 1,
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let first = true;
  let streamError: string | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const raw = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!raw.startsWith('data:')) continue;
      try {
        const event = JSON.parse(raw.slice(5).trim()) as { text?: string; error?: string; done?: boolean };
        if (typeof event.text === 'string') {
          if (first) {
            process.stdout.write(`${styles.ok(`▸ ${slug}`)}\n\n`);
            first = false;
          }
          process.stdout.write(event.text);
        } else if (event.error) {
          streamError = event.error;
        }
      } catch {
        // ignore keep-alives
      }
    }
  }
  process.stdout.write('\n');
  if (streamError && first) throw new CliError(streamError);
}

export async function skillPublish(context: CommandContext, options: { file?: string }): Promise<void> {
  const file = path.resolve(context.cwd, options.file ?? 'skill.json');
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  } catch {
    throw new CliError(`Could not read ${path.relative(context.cwd, file)}.`, {
      exitCode: 2,
      details: ['Create a skill.json with: slug, name, description, instructions, data_source.'],
    });
  }

  const progress = spinner(`Publishing ${String(manifest.slug ?? 'skill')}`).start();
  const response = await fetch(api(context, '/api/skills'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(context.credentials.handle ? { 'x-norien-actor': context.credentials.handle } : {}),
      ...(context.credentials.apiKey ? { authorization: `Bearer ${context.credentials.apiKey}` } : {}),
    },
    body: JSON.stringify(manifest),
  });
  progress.stop();

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string; details?: { field?: string; message: string }[] } }
      | null;
    const details = body?.error?.details?.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)) ?? [];
    if (response.status === 401) details.push("Run 'norien login', or set NORIEN_ACTOR.");
    throw new CliError(body?.error?.message ?? `Publish failed (${response.status}).`, {
      exitCode: response.status === 401 ? 3 : 1,
      details,
    });
  }

  const skill = (await response.json()) as Skill;
  if (context.json) {
    emitJson({ ok: true, skill });
    return;
  }
  line(`${styles.ok('✓')} Published ${styles.title(skill.slug)} @${skill.version}`);
  line();
  line(`  Run it: ${styles.code(`norien skill run ${skill.slug}`)}`);
  line();
}
