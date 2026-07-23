import Link from 'next/link';
import { Suspense } from 'react';

import { api } from '@norien-live/web-ui/api';
import { relativeTime } from '@norien-live/web-ui';
import { InstallCommand, RuntimeBadge } from '@/components/registry';
import { Table } from '@/components/table';
import { Badge, Card, Empty, MissingResource, Row, Skeleton, Stat } from '@norien-live/web-ui';

/**
 * Tool detail.
 *
 * The schemas are the contract an agent codes against, so they are shown
 * verbatim rather than summarised — and they are stored verbatim too, which is
 * what makes them MCP compatible later.
 */
export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = await api.tool(slug).catch(() => null);
  if (!tool) return <MissingResource kind="Tool" identifier={slug} />;

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{tool.name}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{tool.description}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone="accent">v{tool.version}</Badge>
          <Badge>{tool.category}</Badge>
          <RuntimeBadge runtime={tool.runtime} />
          <span className="text-xs text-muted">
            by {tool.author} · updated {relativeTime(tool.updated_at)}
          </span>
        </div>
      </header>

      <div className="mb-5">
        <InstallCommand command={tool.install_command} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Category" value={tool.category} />
        <Stat label="Runtime" value={tool.runtime ?? '—'} hint={tool.entrypoint ?? undefined} />
        <Stat label="Permissions" value={tool.permissions.length} />
        <Stat label="Environment" value={tool.environment.length} hint="declared variables" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Details">
          <dl>
            <Row label="Slug">
              <span className="font-mono text-xs">{tool.slug}</span>
            </Row>
            <Row label="Version">
              <span className="font-mono text-xs">{tool.version}</span>
            </Row>
            <Row label="Runtime">{tool.runtime ?? '—'}</Row>
            <Row label="Entrypoint">
              <span className="font-mono text-xs break-all">{tool.entrypoint ?? '—'}</span>
            </Row>
            <Row label="Authentication">
              {tool.authentication ? (
                <span>
                  {tool.authentication.type}
                  {tool.authentication.name ? ` · ${tool.authentication.name}` : ''}
                </span>
              ) : (
                'none'
              )}
            </Row>
            <Row label="License">{tool.license ?? '—'}</Row>
            <Row label="Published">{relativeTime(tool.created_at)}</Row>
          </dl>
        </Card>

        <Card title="Requirements">
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Permissions</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {tool.permissions.length === 0 ? (
                <span className="text-sm text-muted">None requested.</span>
              ) : (
                tool.permissions.map((permission) => <Badge key={permission}>{permission}</Badge>)
              )}
            </div>
          </div>

          <div className="mt-5">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Dependencies</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {tool.dependencies.length === 0 ? (
                <span className="text-sm text-muted">None.</span>
              ) : (
                tool.dependencies.map((dependency) => (
                  <Link key={dependency} href={`/tools/${dependency}`}>
                    <Badge tone="accent">{dependency}</Badge>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="mt-5">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Tags</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {tool.tags.length === 0 ? (
                <span className="text-sm text-muted">None.</span>
              ) : (
                tool.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)
              )}
            </div>
          </div>

          {tool.homepage || tool.repository || tool.documentation ? (
            <div className="mt-5 border-t border-line pt-4">
              <div className="flex flex-wrap gap-3 text-sm">
                {tool.homepage ? <External href={tool.homepage} label="Homepage" /> : null}
                {tool.repository ? <External href={tool.repository} label="Repository" /> : null}
                {tool.documentation ? <External href={tool.documentation} label="Documentation" /> : null}
              </div>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="mt-4">
        <Card title="Environment variables" padded={false}>
          <Table
            rows={tool.environment}
            rowKey={(variable) => variable.name}
            empty={<Empty title="No environment variables" detail="This tool needs no configuration." />}
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
            ]}
          />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Input schema" padded={false}>
          <SchemaBlock schema={tool.input_schema} />
        </Card>
        <Card title="Output schema" padded={false}>
          <SchemaBlock schema={tool.output_schema} />
        </Card>
      </div>

      <div className="mt-4">
        <Suspense
          fallback={
            <Card title="Version history">
              <Skeleton height={100} />
            </Card>
          }
        >
          <VersionHistory slug={tool.slug} />
        </Suspense>
      </div>
    </>
  );
}

function SchemaBlock({ schema }: { schema: Record<string, unknown> | null }) {
  if (!schema) {
    return (
      <div className="p-4">
        <Empty title="No schema declared" detail="This tool does not publish a JSON Schema." />
      </div>
    );
  }

  return (
    <pre className="scroll-x max-h-80 overflow-y-auto rounded-b-xl bg-sunken p-4 font-mono text-xs leading-relaxed text-ink">
      {JSON.stringify(schema, null, 2)}
    </pre>
  );
}

async function VersionHistory({ slug }: { slug: string }) {
  const versions = await api.toolVersions(slug).catch(() => null);

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
          {
            key: 'runtime',
            header: 'Runtime',
            hideBelow: 'sm',
            cell: (version) => version.runtime ?? '—',
          },
          {
            key: 'description',
            header: 'Description',
            hideBelow: 'md',
            cell: (version) => <span className="text-muted">{version.description}</span>,
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

function External({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-accent underline underline-offset-2"
    >
      {label} ↗
    </a>
  );
}
