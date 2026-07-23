import { Suspense } from 'react';

import { api } from '@norien-live/web-ui/api';
import { buildQuery, Input, intParam, Pagination, Select, Toolbar } from '@norien-live/web-ui';
import { AgentCard } from '@/components/registry';
import { Button, Card, Empty, ErrorState, SectionHeading, Skeleton } from '@norien-live/web-ui';

export const metadata = { title: 'Registry' };

interface SearchParams {
  q?: string;
  runtime?: string;
  limit?: string;
  offset?: string;
}

/**
 * Agent registry.
 *
 * Lists published agents. A query switches to the ranked search endpoint, which
 * is why filtering and browsing are two different reads rather than one — the
 * registry ranks by relevance, the list orders by recency.
 */
export default async function RegistryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const runtime = params.runtime === 'node' || params.runtime === 'python' ? params.runtime : '';
  const limit = intParam(params.limit, 24, 1, 100);
  const offset = Math.max(0, intParam(params.offset, 0, 0, Number.MAX_SAFE_INTEGER));

  return (
    <>
      <SectionHeading
        title="Registry"
        detail="Published agents, versioned and installable. Every record is the manifest that was published."
      />

      <Toolbar action="/registry">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search agents"
          aria-label="Search agents"
          className="min-w-[15rem] flex-1 sm:flex-none"
        />
        <Select name="runtime" defaultValue={runtime} aria-label="Runtime">
          <option value="">Any runtime</option>
          <option value="node">node</option>
          <option value="python">python</option>
        </Select>
        <Button type="submit" tone="secondary">
          Filter
        </Button>
      </Toolbar>

      <Suspense key={`${q}:${runtime}:${limit}:${offset}`} fallback={<GridSkeleton />}>
        <AgentGrid q={q} runtime={runtime} limit={limit} offset={offset} />
      </Suspense>
    </>
  );
}

async function AgentGrid({
  q,
  runtime,
  limit,
  offset,
}: {
  q: string;
  runtime: string;
  limit: number;
  offset: number;
}) {
  // A search query goes to the ranked endpoint; browsing goes to the list. The
  // two return different envelopes, so both are normalized to agents + total.
  const result = q
    ? await api
        .registrySearch({ q, type: 'agent', limit, offset })
        .then((page) =>
          page
            ? {
                agents: page.data.flatMap((hit) => (hit.type === 'agent' ? [hit.item] : [])),
                total: page.meta.total,
                hasMore: page.meta.has_more,
              }
            : null,
        )
        .catch(() => null)
    : await api
        .agents({ limit, offset, ...(runtime ? { runtime } : {}) })
        .then((page) =>
          page ? { agents: page.data, total: page.meta.total, hasMore: page.meta.has_more } : null,
        )
        .catch(() => null);

  if (!result) {
    return (
      <Card>
        <ErrorState
          title="The registry is unavailable"
          detail="Norien's API could not be reached. Check that the registry is running."
        />
      </Card>
    );
  }

  if (result.agents.length === 0) {
    return (
      <Card>
        <Empty
          title={q ? `No agents match “${q}”` : 'No agents published yet'}
          detail={
            q
              ? 'Try a different name, tag, or author.'
              : 'Publish one with `norien publish`, or validate a manifest first.'
          }
        />
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {result.agents.map((agent) => (
          <AgentCard key={agent.slug} agent={agent} />
        ))}
      </div>

      <Pagination
        offset={offset}
        limit={limit}
        shown={result.agents.length}
        total={result.total}
        hasMore={result.hasMore}
        buildHref={(nextOffset) =>
          `/registry${buildQuery(
            { q, runtime, limit, offset: nextOffset },
            { limit: 24, offset: 0 },
          )}`
        }
      />
    </>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-xl border border-line bg-card p-5">
          <Skeleton width="55%" height={16} />
          <div className="h-3" />
          <Skeleton width="100%" height={10} />
          <div className="h-1.5" />
          <Skeleton width="80%" height={10} />
          <div className="h-4" />
          <Skeleton width="40%" height={18} />
        </div>
      ))}
    </div>
  );
}
