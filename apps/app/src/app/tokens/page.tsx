import Link from 'next/link';
import { Suspense } from 'react';

import { api, type Token } from '@norien-live/web-ui/api';
import { count, price, usd } from '@norien-live/web-ui';
import { buildQuery, intParam, Pagination, TokenLogo } from '@norien-live/web-ui';
import {
  Card,
  Change,
  DegradedNotice,
  Empty,
  ErrorState,
  SectionHeading,
  Skeleton,
} from '@norien-live/web-ui';
import { TokenControls } from './controls';

export const metadata = { title: 'Tokens' };

const SORTS = ['volume24', 'liquidity', 'marketCap', 'change24', 'trendingScore24'] as const;
type Sort = (typeof SORTS)[number];

interface SearchParams {
  q?: string;
  sort?: string;
  limit?: string;
  offset?: string;
}

/**
 * Token directory.
 *
 * The same data as Markets, presented for browsing rather than scanning: a card
 * per token with its key figures, where Markets is a dense sortable table.
 */
export default async function TokensPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const sort: Sort = SORTS.includes(params.sort as Sort) ? (params.sort as Sort) : 'volume24';
  const limit = intParam(params.limit, 24, 1, 100);
  const offset = Math.max(0, intParam(params.offset, 0, 0, Number.MAX_SAFE_INTEGER));
  const q = params.q?.trim() ?? '';

  return (
    <>
      <SectionHeading
        title="Tokens"
        detail="Every token Norien can resolve, with price, liquidity, and holder counts."
      />

      <TokenControls sort={sort} q={q} />

      <Suspense key={`${q}:${sort}:${limit}:${offset}`} fallback={<GridSkeleton />}>
        <TokenGrid sort={sort} limit={limit} offset={offset} q={q} />
      </Suspense>
    </>
  );
}

async function TokenGrid({
  sort,
  limit,
  offset,
  q,
}: {
  sort: Sort;
  limit: number;
  offset: number;
  q: string;
}) {
  const result = await api.tokens({ sort, limit, offset, ...(q ? { q } : {}) }).catch(() => null);

  if (!result) {
    return (
      <Card>
        <ErrorState
          title="Tokens are unavailable"
          detail="The market data provider could not be reached. This usually resolves on its own."
        />
      </Card>
    );
  }

  const { items, meta } = result.data;

  if (items.length === 0) {
    return (
      <Card>
        <Empty
          title={q ? `No tokens match “${q}”` : 'No tokens found'}
          detail={q ? 'Try a different symbol or name.' : undefined}
        />
      </Card>
    );
  }

  const buildHref = (nextOffset: number) =>
    `/tokens${buildQuery({ q, sort, limit, offset: nextOffset }, { sort: 'volume24', limit: 24, offset: 0 })}`;

  return (
    <>
      <DegradedNotice sources={result.sources} degraded={result.degraded} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((token) => (
          <TokenCard key={`${token.chain.id}:${token.address}`} token={token} />
        ))}
      </div>

      <Pagination
        offset={offset}
        limit={limit}
        shown={items.length}
        total={meta.total}
        hasMore={meta.hasMore}
        buildHref={buildHref}
      />
    </>
  );
}

function TokenCard({ token }: { token: Token }) {
  return (
    <Link
      href={`/token/${token.address}?chainId=${token.chain.id}`}
      className="group block rounded-xl border border-line bg-card p-5 transition-colors hover:border-accent/40"
    >
      <div className="flex items-center gap-3">
        <TokenLogo src={token.logo} symbol={token.symbol} className="size-9" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink group-hover:text-accent">
            {token.symbol || '—'}
          </div>
          <div className="truncate text-xs text-muted">{token.name}</div>
        </div>
        <div className="ml-auto shrink-0 text-right">
          <div className="text-sm font-medium text-ink">{price(token.price)}</div>
          <div className="text-xs">
            <Change value={token.change24h} />
          </div>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3 text-xs">
        <div>
          <dt className="text-muted">Volume</dt>
          <dd className="mt-0.5 text-ink">{usd(token.volume24h)}</dd>
        </div>
        <div>
          <dt className="text-muted">Liquidity</dt>
          <dd className="mt-0.5 text-ink">{usd(token.liquidity)}</dd>
        </div>
        <div>
          <dt className="text-muted">Holders</dt>
          <dd className="mt-0.5 text-ink">{count(token.holders)}</dd>
        </div>
      </dl>
    </Link>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-xl border border-line bg-card p-5">
          <div className="flex items-center gap-3">
            <Skeleton width={36} height={36} />
            <div className="flex-1">
              <Skeleton width="40%" height={12} />
              <div className="h-1.5" />
              <Skeleton width="65%" height={10} />
            </div>
          </div>
          <div className="mt-4 border-t border-line pt-3">
            <Skeleton width="100%" height={28} />
          </div>
        </div>
      ))}
    </div>
  );
}
