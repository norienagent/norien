'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import type { Aggregated, Page, Token } from '@norien-live/web-ui/api';
import { price, TokenLogo, usd } from '@norien-live/web-ui';

/**
 * The new-launches radar.
 *
 * Newest tokens on the chain, refreshing on an interval so a launch appears
 * without a reload. Server-rendered with an initial page, then polled.
 */

const REFRESH_MS = 20_000;

/** Compact "just now / 3m / 2h / 5d" from a unix-seconds timestamp. */
function ago(createdAt: number | null | undefined, now: number): string {
  if (!createdAt) return '—';
  const s = Math.max(0, Math.floor(now / 1000) - createdAt);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export function NewLaunches({ initial }: { initial: Token[] }) {
  const [tokens, setTokens] = useState<Token[]>(initial);
  const [now, setNow] = useState(() => Date.now());
  const [flash, setFlash] = useState(false);

  // Tick the clock so relative times stay live between fetches.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        // no-store so the browser/CDN never serves a stale list on the poll.
        const res = await fetch('/api/new?limit=30', { cache: 'no-store' });
        if (!res.ok) return;
        const body = (await res.json()) as Aggregated<Page<Token>>;
        if (cancelled) return;
        const next = body.data.items;
        setTokens((prev) => {
          if (next[0] && prev[0] && next[0].address !== prev[0].address) {
            setFlash(true);
            setTimeout(() => setFlash(false), 1200);
          }
          return next;
        });
        setNow(Date.now());
      } catch {
        /* keep the last good list */
      }
    };
    const t = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-sm font-medium text-ink">Latest listings</span>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span
            className={`size-2 rounded-full ${flash ? 'bg-up' : 'bg-up/60'}`}
            style={{ transition: 'background-color 0.4s' }}
          />
          live · refreshes every 20s
        </span>
      </div>
      <ul className="divide-y divide-line">
        {tokens.map((token) => (
          <li key={token.address}>
            <Link
              href={`/token/${token.address}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-sunken"
            >
              <TokenLogo src={token.logo} symbol={token.symbol} className="size-8 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">
                  {token.symbol}{' '}
                  <span className="font-normal text-muted">{token.name}</span>
                </div>
                <div className="text-xs text-muted">
                  Liq {usd(token.liquidity)} · Vol {usd(token.volume24h)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm tabular-nums text-ink">{price(token.price)}</div>
                <div className="text-xs tabular-nums text-accent">{ago(token.createdAt, now)}</div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
