'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { buildQuery, Input, Select, Toolbar } from '@norien-live/web-ui';
import { Button } from '@norien-live/web-ui';

/** Directory filters. Like the market controls, all state lives in the URL. */
export function TokenControls({ sort, q }: { sort: string; q: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(q);

  function navigate(next: { q?: string; sort?: string }) {
    router.push(
      `/tokens${buildQuery(
        { q: next.q ?? query, sort: next.sort ?? sort },
        { sort: 'volume24' },
      )}`,
    );
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
        placeholder="Search by name or symbol"
        aria-label="Search tokens"
        className="min-w-[14rem] flex-1 sm:flex-none"
      />

      <Select value={sort} onChange={(event) => navigate({ sort: event.target.value })} aria-label="Sort by">
        <option value="volume24">Volume 24h</option>
        <option value="liquidity">Liquidity</option>
        <option value="marketCap">Market cap</option>
        <option value="change24">24h change</option>
        <option value="trendingScore24">Trending</option>
      </Select>

      <Button type="submit" tone="secondary">
        Search
      </Button>
    </Toolbar>
  );
}
