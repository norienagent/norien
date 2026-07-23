import { Suspense } from 'react';

import { api } from '@/lib/api';
import { buildQuery, Input, intParam, Pagination, Select, Toolbar } from '@/components/controls';
import { ToolCard } from '@/components/registry';
import { Button, Card, Empty, ErrorState, SectionHeading, Skeleton } from '@/components/ui';

export const metadata = { title: 'Tools' };

interface SearchParams {
  q?: string;
  category?: string;
  limit?: string;
  offset?: string;
}

/**
 * Tool marketplace.
 *
 * The category filter is built from the categories that actually have tools
 * rather than from a hardcoded list — the vocabulary is a backend constant, and
 * duplicating it here would let the two drift.
 */
export default async function ToolsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const category = params.category?.trim() ?? '';
  const limit = intParam(params.limit, 24, 1, 100);
  const offset = Math.max(0, intParam(params.offset, 0, 0, Number.MAX_SAFE_INTEGER));

  return (
    <>
      <SectionHeading
        title="Tools"
        detail="Reusable capabilities any agent can declare. Every tool is a plugin — JSON in, JSON out."
      />

      <Suspense fallback={<Toolbar />}>
        <ToolFilters q={q} category={category} />
      </Suspense>

      <Suspense key={`${q}:${category}:${limit}:${offset}`} fallback={<GridSkeleton />}>
        <ToolGrid q={q} category={category} limit={limit} offset={offset} />
      </Suspense>
    </>
  );
}

/** Category options, derived from the live catalogue. */
async function ToolFilters({ q, category }: { q: string; category: string }) {
  const all = await api.tools({ limit: 100 }).catch(() => null);
  const categories = [...new Set((all?.data ?? []).map((tool) => tool.category))].sort();

  return (
    <Toolbar action="/app/tools">
      <Input
        name="q"
        defaultValue={q}
        placeholder="Search tools"
        aria-label="Search tools"
        className="min-w-[15rem] flex-1 sm:flex-none"
      />
      <Select name="category" defaultValue={category} aria-label="Category">
        <option value="">All categories</option>
        {categories.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </Select>
      <Button type="submit" tone="secondary">
        Filter
      </Button>
    </Toolbar>
  );
}

async function ToolGrid({
  q,
  category,
  limit,
  offset,
}: {
  q: string;
  category: string;
  limit: number;
  offset: number;
}) {
  // A query goes to ranked search; browsing goes to the list endpoint, which is
  // the only one that can filter by category.
  const result = q
    ? await api
        .registrySearch({ q, type: 'tool', limit, offset })
        .then((page) =>
          page
            ? {
                tools: page.data.flatMap((hit) => (hit.type === 'tool' ? [hit.item] : [])),
                total: page.meta.total,
                hasMore: page.meta.has_more,
              }
            : null,
        )
        .catch(() => null)
    : await api
        .tools({ limit, offset, ...(category ? { category } : {}) })
        .then((page) =>
          page ? { tools: page.data, total: page.meta.total, hasMore: page.meta.has_more } : null,
        )
        .catch(() => null);

  if (!result) {
    return (
      <Card>
        <ErrorState
          title="The marketplace is unavailable"
          detail="Norien's API could not be reached. Check that the registry is running."
        />
      </Card>
    );
  }

  if (result.tools.length === 0) {
    return (
      <Card>
        <Empty
          title={q ? `No tools match “${q}”` : 'No tools found'}
          detail={
            q ? 'Try a different name, category, or tag.' : 'Publish one with `norien tool publish`.'
          }
        />
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {result.tools.map((tool) => (
          <ToolCard key={tool.slug} tool={tool} />
        ))}
      </div>

      <Pagination
        offset={offset}
        limit={limit}
        shown={result.tools.length}
        total={result.total}
        hasMore={result.hasMore}
        buildHref={(nextOffset) =>
          `/app/tools${buildQuery({ q, category, limit, offset: nextOffset }, { limit: 24, offset: 0 })}`
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
          <Skeleton width="50%" height={16} />
          <div className="h-3" />
          <Skeleton width="100%" height={10} />
          <div className="h-1.5" />
          <Skeleton width="75%" height={10} />
          <div className="h-4" />
          <Skeleton width="45%" height={18} />
        </div>
      ))}
    </div>
  );
}
