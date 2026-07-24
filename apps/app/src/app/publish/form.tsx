'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';

import { Textarea } from '@norien-live/web-ui';
import { InstallCommand } from '@/components/registry';
import { Badge, Button, Card, Empty, Row } from '@norien-live/web-ui';
import { inspectManifest, type InspectState } from './actions';

const EXAMPLE = `{
  "name": "Research Agent",
  "version": "1.0.0",
  "description": "Summarises sources on a topic and writes a digest.",
  "runtime": "node",
  "entrypoint": "index.js",
  "commands": {
    "start": "node index.js"
  },
  "tools": ["web-search"],
  "permissions": ["network:fetch"],
  "environment": [
    { "name": "OPENAI_API_KEY", "required": true, "secret": true }
  ]
}`;

const INITIAL: InspectState = { status: 'idle' };

/**
 * Manifest validator.
 *
 * Runs the same pre-flight as `norien publish` against the live registry, so
 * what this reports is exactly what publishing would do. The publish itself
 * happens from the CLI, which carries the identity this page does not have yet.
 */
export function PublishForm() {
  const [state, formAction, pending] = useActionState(inspectManifest, INITIAL);
  const [manifest, setManifest] = useState(EXAMPLE);

  return (
    <div className="space-y-4">
      <ManifestGenerator onGenerate={setManifest} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="agent.json">
          <form action={formAction}>
            <Textarea
              name="manifest"
              rows={20}
              value={manifest}
              onChange={(e) => setManifest(e.target.value)}
              aria-label="Agent manifest"
              className="w-full text-xs"
              placeholder="Paste your agent.json here"
            />
            <div className="mt-3 flex items-center gap-3">
              <Button type="submit" disabled={pending}>
                {pending ? 'Validating…' : 'Validate manifest'}
              </Button>
              <span className="text-xs text-muted">Nothing is stored — this only validates.</span>
            </div>
          </form>
        </Card>

        <Card title="Result">
          <Result state={state} />
        </Card>
      </div>
    </div>
  );
}

/**
 * Draft a manifest from a plain-English description (Groq). It fills the editor
 * below with a starting point the author refines and validates — never a
 * substitute for review.
 */
function ManifestGenerator({ onGenerate }: { onGenerate: (json: string) => void }) {
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(override?: string) {
    const text = (override ?? description).trim();
    if (override) setDescription(override);
    if (text.length < 5 || generating) return;

    setGenerating(true);
    setError(null);
    try {
      const response = await fetch('/api/ai/manifest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ description: text }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? 'Could not generate a manifest.');
      }
      const { manifest } = (await response.json()) as { manifest: unknown };
      onGenerate(JSON.stringify(manifest, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card title="Generate from a description">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. A Python agent that fetches crypto news hourly, summarises it, and posts to a webhook."
          aria-label="Describe your agent"
          className="w-full text-sm sm:flex-1"
        />
        <Button onClick={() => generate()} disabled={generating || description.trim().length < 5}>
          {generating ? 'Generating…' : 'Generate ✨'}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {[
          'A Python agent that summarizes crypto news hourly and posts to Discord',
          'A Node.js agent that alerts on large wallet transfers',
          'A trading agent that scans tokens and suggests entries',
        ].map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => generate(example)}
            disabled={generating}
            className="rounded-full border border-line bg-canvas px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
          >
            {example}
          </button>
        ))}
      </div>

      {error ? <p className="mt-2 text-sm text-down">{error}</p> : null}
      <p className="mt-2 text-xs text-muted">
        A draft to refine — review it, then validate below before publishing.
      </p>
    </Card>
  );
}

function Result({ state }: { state: InspectState }) {
  if (state.status === 'idle') {
    return (
      <Empty
        title="No manifest validated yet"
        detail="Paste an agent.json and validate it against the live registry — its runtime, tools, and environment are all checked for real."
      />
    );
  }

  if (state.status === 'error') {
    return (
      <>
        <Badge tone="down">registry unreachable</Badge>
        <p className="mt-3 text-sm leading-relaxed text-muted">{state.message}</p>
      </>
    );
  }

  if (state.status === 'invalid') {
    return (
      <>
        <Badge tone="down">invalid</Badge>
        <p className="mt-3 text-sm leading-relaxed text-ink">{state.message}</p>
        {state.issues && state.issues.length > 0 ? (
          <ul className="mt-4 space-y-2 border-t border-line pt-4">
            {state.issues.map((issue, index) => (
              <li key={`${issue.field}:${index}`} className="text-sm">
                {issue.field ? (
                  <span className="font-mono text-xs text-accent">{issue.field}</span>
                ) : null}{' '}
                <span className="text-muted">{issue.message}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </>
    );
  }

  const result = state.result;
  if (!result) return null;

  const action = result.version_check?.action;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {result.ready ? <Badge tone="up">ready</Badge> : <Badge tone="warn">needs configuration</Badge>}
        {action ? (
          <Badge tone={action === 'conflict' ? 'down' : 'accent'}>{action.replace('_', ' ')}</Badge>
        ) : null}
      </div>

      <dl className="mt-4">
        <Row label="Name">{result.name}</Row>
        <Row label="Slug">
          <span className="font-mono text-xs">{result.slug}</span>
        </Row>
        <Row label="Version">
          <span className="font-mono text-xs">{result.version}</span>
        </Row>
        <Row label="Runtime">
          {result.runtime.name} · {result.runtime.interpreter}
        </Row>
        <Row label="Entrypoint">
          <span className="font-mono text-xs break-all">{result.runtime.entrypoint}</span>
        </Row>
        <Row label="Tools resolved">
          {result.dependencies.resolved.length} of {result.dependencies.requested.length}
        </Row>
        {result.dependencies.missing.length > 0 ? (
          <Row label="Missing tools">
            <span className="text-down">{result.dependencies.missing.join(', ')}</span>
          </Row>
        ) : null}
        {result.environment.missing.length > 0 ? (
          <Row label="Unset variables">
            <span className="text-warn">{result.environment.missing.join(', ')}</span>
          </Row>
        ) : null}
      </dl>

      {result.dependencies.resolved.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Resolved tools</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {result.dependencies.resolved.map((tool) => (
              <Link key={tool.slug} href={`/tools/${tool.slug}`}>
                <Badge tone="accent">
                  {tool.slug}@{tool.version}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {result.diagnostics.length > 0 ? (
        <ul className="mt-4 space-y-1.5 border-t border-line pt-4">
          {result.diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.code}:${index}`} className="text-xs text-muted">
              <span className="font-mono text-ink">{diagnostic.code}</span> — {diagnostic.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 border-t border-line pt-4">
        <p className="mb-3 text-sm text-muted">
          {action === 'conflict'
            ? 'This version already exists. Bump the version before publishing.'
            : 'Publish it from the directory containing this manifest:'}
        </p>
        <InstallCommand command="norien publish" />
      </div>
    </>
  );
}
