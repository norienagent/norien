import { Suspense } from 'react';

import { api } from '@/lib/api';
import { buildQuery, intParam, Pagination } from '@/components/controls';
import { TokenTable } from '@/components/token-table';
import { Card, DegradedNotice, ErrorState, SectionHeading, SkeletonRows, SourceList } from '@/components/ui';
import { MarketControls } from './controls';

export const metadata = { title: 'Markets' };

const SORTS = ['volume24', 'liquidity', 'marketCap', 'change24', 'trendingScore24'] as const;
type Sort = (typeof SORTS)[number];

interface SearchParams {
  q?: string;
  sort?: string;
  limit?: string;
  offset?: string;
  chainId?: string;
}

/**
 * Markets.
 *
 * Filter, sort, and pagination live in the URL, so a view is shareable and the
 * back button behaves. The table is suspended on those parameters, so changing
 * a filter re-renders only the results.
 */
export default async function MarketsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const sort: Sort = SORTS.includes(params.sort as Sort) ? (params.sort as Sort) : 'volume24';
  const limit = intParam(params.limit, 25, 1, 100);
  const offset = Math.max(0, intParam(params.offset, 0, 0, Number.MAX_SAFE_INTEGER));
  const q = params.q?.trim() ?? '';
  const chainId = params.chainId ? Number.parseInt(params.chainId, 10) : undefined;

  return (
    <>
      <SectionHeading title="Markets" detail="Live token prices, liquidity, volume, and holders." />

      <MarketControls sort={sort} limit={limit} q={q} chainId={chainId} />

      <Suspense
        key={`${q}:${sort}:${limit}:${offset}:${chainId ?? ''}`}
        fallback={
          <Card padded={false}>
            <SkeletonRows rows={10} cols={7} />
          </Card>
        }
      >
        <MarketsTable sort={sort} limit={limit} offset={offset} q={q} chainId={chainId} />
      </Suspense>
    </>
  );
}

async function MarketsTable({
  sort,
  limit,
  offset,
  q,
  chainId,
}: {
  sort: Sort;
  limit: number;
  offset: number;
  q: string;
  chainId: number | undefined;
}) {
  const result = await api
    .tokens({
      sort,
      limit,
      offset,
      ...(q ? { q } : {}),
      ...(chainId !== undefined ? { chainId } : {}),
    })
    .catch(() => null);

  if (!result) {
    return (
      <Card>
        <ErrorState
          title="Markets are unavailable"
          detail="The market data provider could not be reached. This usually resolves on its own."
        />
      </Card>
    );
  }

  const { items, meta } = result.data;

  const buildHref = (nextOffset: number) =>
    `/app/markets${buildQuery(
      { q, sort, limit, chainId, offset: nextOffset },
      { sort: 'volume24', limit: 25, offset: 0 },
    )}`;

  return (
    <>
      <DegradedNotice sources={result.sources} degraded={result.degraded} />

      <Card padded={false}>
        <TokenTable
          tokens={items}
          columns={['price', 'change', 'volume', 'liquidity', 'marketCap', 'holders', 'chain']}
          emptyTitle={q ? `No tokens match “${q}”` : 'No tokens found'}
          emptyDetail={q ? 'Try a different symbol or name.' : undefined}
        />
      </Card>

      <Pagination
        offset={offset}
        limit={limit}
        shown={items.length}
        total={meta.total}
        hasMore={meta.hasMore}
        buildHref={buildHref}
      />

      <div className="mt-5">
        <SourceList sources={result.sources} />
      </div>
    </>
  );
}
