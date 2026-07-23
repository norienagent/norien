'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Input, Select, Toolbar } from '@norien-live/web-ui';
import { Button } from '@norien-live/web-ui';

/**
 * Market filters.
 *
 * State lives in the URL rather than component state, so a filtered view is
 * shareable and the server component re-fetches with the new parameters. Any
 * filter change resets paging — page 3 of a different filter is meaningless.
 */
export function MarketControls({
  sort,
  limit,
  q,
  chainId,
  basePath = '/markets',
}: {
  sort: string;
  limit: number;
  q: string;
  chainId: number | undefined;
  basePath?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(q);

  function navigate(next: Partial<{ q: string; sort: string; limit: string; chainId: string }>) {
    const params = new URLSearchParams();
    const merged = {
      q: next.q ?? query,
      sort: next.sort ?? sort,
      limit: next.limit ?? String(limit),
      chainId: next.chainId ?? (chainId === undefined ? '' : String(chainId)),
    };

    if (merged.q) params.set('q', merged.q);
    if (merged.sort !== 'volume24') params.set('sort', merged.sort);
    if (merged.limit !== '25') params.set('limit', merged.limit);
    if (merged.chainId) params.set('chainId', merged.chainId);

    const text = params.toString();
    router.push(`${basePath}${text ? `?${text}` : ''}`);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    navigate({ q: query });
  }

  return (
    <Toolbar onSubmit={submit}>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter by name or symbol"
        aria-label="Filter tokens"
        className="min-w-[14rem] flex-1 sm:flex-none"
      />

      <Select value={sort} onChange={(event) => navigate({ sort: event.target.value })} aria-label="Sort by">
        <option value="volume24">Volume 24h</option>
        <option value="liquidity">Liquidity</option>
        <option value="marketCap">Market cap</option>
        <option value="change24">24h change</option>
        <option value="trendingScore24">Trending</option>
      </Select>

      <Select
        value={chainId === undefined ? '' : String(chainId)}
        onChange={(event) => navigate({ chainId: event.target.value })}
        aria-label="Chain"
      >
        <option value="">Native chain</option>
        <option value="1">Ethereum</option>
        <option value="8453">Base</option>
        <option value="42161">Arbitrum</option>
        <option value="10">Optimism</option>
        <option value="56">BNB Chain</option>
      </Select>

      <Select value={String(limit)} onChange={(event) => navigate({ limit: event.target.value })} aria-label="Rows">
        <option value="10">10 rows</option>
        <option value="25">25 rows</option>
        <option value="50">50 rows</option>
        <option value="100">100 rows</option>
      </Select>

      <Button type="submit" tone="secondary">
        Apply
      </Button>
    </Toolbar>
  );
}
