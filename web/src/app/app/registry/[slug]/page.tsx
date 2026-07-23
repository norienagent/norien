import Link from 'next/link';
import { Suspense } from 'react';

import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { InstallCommand, RuntimeBadge } from '@/components/registry';
import { Table } from '@/components/table';
import {
  Badge,
  Card,
  Empty,
  MissingResource,
  Row,
  SectionHeading,
  Skeleton,
  Stat,
} from '@/components/ui';

/**
 * Agent detail.
 *
 * The record, its version history, and the live runtime view — "could this
 * actually run?" — which is computed by the registry rather than guessed here.
 */
export default async function AgentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agent = await api.agent(slug).catch(() => null);
  if (!agent) return <MissingResource kind="Agent" identifier={slug} />;

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{agent.name}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{agent.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="accent">v{agent.version}</Badge>
            <RuntimeBadge runtime={agent.runtime} />
            <span className="text-xs text-muted">
              by {agent.author} · updated {relativeTime(agent.updated_at)}
            </span>
          </div>
        </div>
      </header>

      <div className="mb-5">
        <InstallCommand command={agent.install_command} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Runtime" value={agent.runtime} hint={agent.entrypoint} />
        <Stat label="Required tools" value={agent.required_tools.length} />
        <Stat label="Permissions" value={agent.permissions.length} />
        <Stat label="Environment" value={agent.environment_variables.length} hint="declared variables" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Manifest">
          <dl>
            <Row label="Slug">
              <span className="font-mono text-xs">{agent.slug}</span>
            </Row>
            <Row label="Version">
              <span className="font-mono text-xs">{agent.version}</span>
            </Row>
            <Row label="Runtime">{agent.runtime}</Row>
            <Row label="Entrypoint">
              <span className="font-mono text-xs break-all">{agent.entrypoint}</span>
            </Row>
            <Row label="Start command">
              <span className="font-mono text-xs break-all">{agent.commands.start}</span>
            </Row>
            <Row label="Health command">
              <span className="font-mono text-xs break-all">{agent.commands.health ?? '—'}</span>
            </Row>
            <Row label="Visibility">{agent.visibility}</Row>
            <Row label="Published">{relativeTime(agent.created_at)}</Row>
          </dl>
        </Card>

        <Card title="Requirements">
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Tools</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {agent.required_tools.length === 0 ? (
                <span className="text-sm text-muted">None declared.</span>
              ) : (
                agent.required_tools.map((tool) => (
                  <Link key={tool} href={`/app/tools/${tool}`}>
                    <Badge tone="accent">{tool}</Badge>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="mt-5">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Permissions</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {agent.permissions.length === 0 ? (
                <span className="text-sm text-muted">None requested.</span>
              ) : (
                agent.permissions.map((permission) => <Badge key={permission}>{permission}</Badge>)
              )}
            </div>
          </div>

          <div className="mt-5">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Tags</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {agent.tags.length === 0 ? (
                <span className="text-sm text-muted">None.</span>
              ) : (
                agent.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Card title="Environment variables" padded={false}>
          <Table
            rows={agent.environment_variables}
            rowKey={(variable) => variable.name}
            empty={<Empty title="No environment variables" detail="This agent needs no configuration." />}
            columns={[
              {
                key: 'name',
                header: 'Name',
                cell: (variable) => <span className="font-mono text-xs">{variable.name}</span>,
              },
              {
                key: 'required',
                header: 'Required',
                cell: (variable) =>
                  variable.required ? <Badge tone="warn">required</Badge> : <Badge>optional</Badge>,
              },
              {
                key: 'secret',
                header: 'Secret',
                hideBelow: 'sm',
                cell: (variable) => (variable.secret ? <Badge tone="down">secret</Badge> : '—'),
              },
              {
                key: 'default',
                header: 'Default',
                hideBelow: 'md',
                cell: (variable) => (
                  <span className="font-mono text-xs text-muted">{variable.default ?? '—'}</span>
                ),
              },
            ]}
          />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Suspense fallback={<Card title="Runtime readiness"><Skeleton height={120} /></Card>}>
          <RuntimeReadiness slug={agent.slug} />
        </Suspense>

        <Suspense fallback={<Card title="Version history"><Skeleton height={120} /></Card>}>
          <VersionHistory slug={agent.slug} />
        </Suspense>
      </div>

      {agent.readme ? (
        <div className="mt-4">
          <Card title="README" padded={false}>
            <pre className="scroll-x max-h-[32rem] overflow-y-auto rounded-b-xl bg-sunken p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink">
              {agent.readme}
            </pre>
          </Card>
        </div>
      ) : null}
    </>
  );
}

/**
 * The registry's own answer to "could this run here?".
 *
 * `ready` is false whenever a tool cannot be resolved or a required variable is
 * unset — which is normal when viewing someone else's agent, so the section
 * explains the reasons rather than presenting it as a failure.
 */
async function RuntimeReadiness({ slug }: { slug: string }) {
  const runtime = await api.agentRuntime(slug).catch(() => null);

  if (!runtime) {
    return (
      <Card title="Runtime readiness">
        <Empty title="Runtime view unavailable" detail="The registry could not normalize this agent." />
      </Card>
    );
  }

  return (
    <Card title="Runtime readiness">
      <div className="mb-4 flex items-center gap-2">
        {runtime.ready ? (
          <Badge tone="up">ready</Badge>
        ) : (
          <Badge tone="warn">needs configuration</Badge>
        )}
        <span className="text-sm text-muted">
          {runtime.runtime.interpreter} · {runtime.runtime.manifest_file}
        </span>
      </div>

      <dl>
        <Row label="Tools resolved">
          {runtime.dependencies.resolved.length} of {runtime.dependencies.requested.length}
        </Row>
        {runtime.dependencies.missing.length > 0 ? (
          <Row label="Missing tools">
            <span className="text-down">{runtime.dependencies.missing.join(', ')}</span>
          </Row>
        ) : null}
        <Row label="Required variables">
          {runtime.environment.required.length === 0 ? '—' : runtime.environment.required.join(', ')}
        </Row>
        {runtime.environment.missing.length > 0 ? (
          <Row label="Unset variables">
            <span className="text-warn">{runtime.environment.missing.join(', ')}</span>
          </Row>
        ) : null}
      </dl>

      {runtime.diagnostics.length > 0 ? (
        <ul className="mt-4 space-y-1.5 border-t border-line pt-4">
          {runtime.diagnostics.map((diagnostic) => (
            <li key={`${diagnostic.code}:${diagnostic.message}`} className="text-xs text-muted">
              <span className="font-mono text-ink">{diagnostic.code}</span> — {diagnostic.message}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

async function VersionHistory({ slug }: { slug: string }) {
  const versions = await api.agentVersions(slug).catch(() => null);

  if (!versions || versions.data.length === 0) {
    return (
      <Card title="Version history">
        <Empty title="No version history" />
      </Card>
    );
  }

  return (
    <Card title={`Version history (${versions.data.length})`} padded={false}>
      <Table
        rows={versions.data}
        rowKey={(version) => version.version}
        columns={[
          {
            key: 'version',
            header: 'Version',
            cell: (version) => <span className="font-mono text-xs text-ink">{version.version}</span>,
          },
          { key: 'runtime', header: 'Runtime', hideBelow: 'sm', cell: (version) => version.runtime },
          {
            key: 'tools',
            header: 'Tools',
            align: 'right',
            hideBelow: 'sm',
            cell: (version) => version.required_tools.length,
          },
          {
            key: 'published',
            header: 'Published',
            align: 'right',
            cell: (version) => <span className="text-muted">{relativeTime(version.created_at)}</span>,
          },
        ]}
      />
    </Card>
  );
}
