import Link from 'next/link';
import { Suspense } from 'react';

import { api } from '@norien-live/web-ui/api';
import { count, usd } from '@norien-live/web-ui';
import { buildQuery, Input, intParam, Pagination, Toolbar } from '@norien-live/web-ui';
import { Table } from '@/components/table';
import {
  Button,
  Card,
  DegradedNotice,
  Empty,
  ErrorState,
  SectionHeading,
  SkeletonRows,
  SourceList,
} from '@norien-live/web-ui';

export const metadata = { title: 'Projects' };

/** Ecosystem projects ranked by total value locked. */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; limit?: string; offset?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const limit = intParam(params.limit, 30, 1, 100);
  const offset = Math.max(0, intParam(params.offset, 0, 0, Number.MAX_SAFE_INTEGER));

  return (
    <>
      <SectionHeading title="Projects" detail="DeFi protocols ranked by total value locked." />

      {/* A plain GET form: no client JavaScript is needed to filter this list. */}
      <Toolbar action="/projects">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Filter by name"
          aria-label="Filter projects"
          className="min-w-[15rem] flex-1 sm:flex-none"
        />
        <Button type="submit" tone="secondary">
          Filter
        </Button>
      </Toolbar>

      <Suspense
        key={`${q}:${limit}:${offset}`}
        fallback={
          <Card padded={false}>
            <SkeletonRows rows={10} cols={5} />
          </Card>
        }
      >
        <ProjectTable q={q} limit={limit} offset={offset} />
      </Suspense>
    </>
  );
}

async function ProjectTable({ q, limit, offset }: { q: string; limit: number; offset: number }) {
  const result = await api.projects({ limit, offset, ...(q ? { q } : {}) }).catch(() => null);

  if (!result) {
    return (
      <Card>
        <ErrorState title="Projects are unavailable" detail="The TVL provider could not be reached." />
      </Card>
    );
  }

  const { items, meta } = result.data;

  if (items.length === 0) {
    return (
      <Card>
        <Empty title={q ? `No projects match “${q}”` : 'No projects found'} />
      </Card>
    );
  }

  // Share is relative to the largest project on this page, so the bar stays
  // readable regardless of how the list is filtered.
  const top = items[0]?.tvl ?? 1;

  return (
    <>
      <DegradedNotice sources={result.sources} degraded={result.degraded} />

      <Card padded={false}>
        <Table
          rows={items}
          rowKey={(project) => project.slug}
          columns={[
            {
              key: 'project',
              header: 'Project',
              cell: (project) => (
                <Link href={`/project/${project.slug}`} className="group inline-flex items-center gap-2.5">
                  {project.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- provider CDNs vary
                    <img
                      src={project.logo}
                      alt=""
                      loading="lazy"
                      className="size-6 shrink-0 rounded-full border border-line bg-sunken object-cover"
                    />
                  ) : (
                    <span aria-hidden className="size-6 shrink-0 rounded-full border border-line bg-sunken" />
                  )}
                  <span className="font-medium text-ink group-hover:text-accent">{project.name}</span>
                </Link>
              ),
            },
            {
              key: 'category',
              header: 'Category',
              hideBelow: 'sm',
              cell: (project) => <span className="text-muted">{project.category ?? '—'}</span>,
            },
            {
              key: 'chains',
              header: 'Chains',
              align: 'right',
              hideBelow: 'md',
              cell: (project) => count(project.chains.length),
            },
            { key: 'tvl', header: 'TVL', align: 'right', cell: (project) => usd(project.tvl) },
            {
              key: 'share',
              header: 'Share',
              hideBelow: 'lg',
              cell: (project) => (
                <div className="h-1.5 w-32 rounded-full bg-sunken">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.max(2, ((project.tvl ?? 0) / top) * 100)}%` }}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Pagination
        offset={offset}
        limit={limit}
        shown={items.length}
        total={meta.total}
        hasMore={meta.hasMore}
        buildHref={(nextOffset) =>
          `/projects${buildQuery({ q, limit, offset: nextOffset }, { limit: 30, offset: 0 })}`
        }
      />

      <div className="mt-5">
        <SourceList sources={result.sources} />
      </div>
    </>
  );
}
