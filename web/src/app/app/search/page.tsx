import Link from 'next/link';
import { Suspense } from 'react';

import { api } from '@/lib/api';
import { shortAddress } from '@/lib/format';
import { SearchBox } from '@/components/search-box';
import { Badge, Card, DegradedNotice, Empty, ErrorState, SectionHeading, SkeletonRows } from '@/components/ui';

export const metadata = { title: 'Search' };

/**
 * Global search.
 *
 * Spans both catalogues: the market API (tokens, projects, addresses) and the
 * registry (agents, tools). Both are queried concurrently and merged, so one
 * query covers everything Norien knows about — and a failure in either still
 * returns the other.
 */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = q?.trim() ?? '';

  return (
    <>
      <SectionHeading
        title="Search"
        detail={query ? `Results for “${query}”` : 'Tokens, projects, addresses, agents, and tools.'}
      />

      <div className="mb-5 max-w-2xl">
        <SearchBox initial={query} autoFocus={query === ''} />
      </div>

      {query === '' ? (
        <Card>
          <Empty
            title="Type something to search"
            detail="Search by token symbol, project name, agent or tool slug, or paste a 0x address."
          />
        </Card>
      ) : (
        <Suspense
          key={query}
          fallback={
            <Card padded={false}>
              <SkeletonRows rows={8} cols={3} />
            </Card>
          }
        >
          <Results query={query} />
        </Suspense>
      )}
    </>
  );
}

async function Results({ query }: { query: string }) {
  const [market, registry] = await Promise.all([
    api.search(query, 30).catch(() => null),
    api.registrySearch({ q: query, limit: 20 }).catch(() => null),
  ]);

  if (!market && !registry) {
    return (
      <Card>
        <ErrorState title="Search is unavailable" detail="The data providers could not be reached." />
      </Card>
    );
  }

  const marketItems = market?.data.items ?? [];
  const registryItems = registry?.data ?? [];

  if (marketItems.length === 0 && registryItems.length === 0) {
    return (
      <Card>
        <Empty
          title={`Nothing found for “${query}”`}
          detail="Try a different symbol, name, slug, or address."
        />
      </Card>
    );
  }

  return (
    <>
      {market ? <DegradedNotice sources={market.sources} degraded={market.degraded} /> : null}

      <div className="space-y-4">
        {registryItems.length > 0 ? (
          <Card title={`Registry (${registryItems.length})`} padded={false}>
            <ul>
              {registryItems.map((hit) => (
                <li key={`${hit.type}:${hit.item.slug}`} className="border-b border-line last:border-0">
                  <Link
                    href={
                      hit.type === 'agent'
                        ? `/app/registry/${hit.item.slug}`
                        : `/app/tools/${hit.item.slug}`
                    }
                    className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-sunken/60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-sm font-medium text-ink group-hover:text-accent">
                          {hit.item.name}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-muted">{hit.item.version}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted">{hit.item.description}</p>
                    </div>
                    <Badge tone="accent">{hit.type}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {marketItems.length > 0 ? (
          <Card title={`Market (${marketItems.length})`} padded={false}>
            <ul>
              {marketItems.map((item) => (
                <li key={`${item.kind}:${item.id}`} className="border-b border-line last:border-0">
                  <Link
                    href={hrefFor(item.kind, item.id, item.chain?.id)}
                    className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-sunken/60"
                  >
                    {item.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- provider CDNs vary
                      <img
                        src={item.logo}
                        alt=""
                        loading="lazy"
                        className="size-7 shrink-0 rounded-full border border-line bg-sunken object-cover"
                      />
                    ) : (
                      <span aria-hidden className="size-7 shrink-0 rounded-full border border-line bg-sunken" />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      <strong className="font-semibold text-ink group-hover:text-accent">
                        {item.symbol ?? item.name}
                      </strong>{' '}
                      <span className="text-muted">
                        {item.symbol ? item.name : shortAddress(item.id)}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-xs text-muted sm:inline">
                      {item.chain?.name ?? ''}
                    </span>
                    <Badge>{item.kind}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </>
  );
}

function hrefFor(kind: string, id: string, chainId?: number): string {
  if (kind === 'project') return `/app/project/${id}`;
  if (kind === 'address') return `/app/address/${id}`;
  return `/app/token/${id}${chainId ? `?chainId=${chainId}` : ''}`;
}
