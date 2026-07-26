'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import type { Aggregated, Token } from '@norien-live/web-ui/api';
import { price, TokenLogo, usd } from '@norien-live/web-ui';

import { removeWatch, setAlert, useWatchlist, type WatchedToken } from '@/lib/watchlist';

/**
 * The watchlist.
 *
 * Saved tokens with live prices, refreshing on an interval, plus per-token
 * price alerts delivered as browser notifications while a Norien tab is open.
 * Entirely client-side (localStorage) — no account needed.
 */

const REFRESH_MS = 20_000;

export default function WatchlistPage() {
  const watched = useWatchlist();
  const [data, setData] = useState<Record<string, Token>>({});
  const [perm, setPerm] = useState<NotificationPermission>('default');
  // Addresses currently past their alert threshold — so we notify once per crossing.
  const triggered = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof Notification !== 'undefined') setPerm(Notification.permission);
  }, []);

  const refresh = useCallback(async () => {
    if (watched.length === 0) return;
    const results = await Promise.all(
      watched.map(async (w) => {
        try {
          const res = await fetch(
            `/api/token/${w.address}${w.chainId ? `?chainId=${w.chainId}` : ''}`,
          );
          if (!res.ok) return null;
          const body = (await res.json()) as Aggregated<Token>;
          return body.data;
        } catch {
          return null;
        }
      }),
    );

    const next: Record<string, Token> = {};
    for (const token of results) if (token) next[token.address.toLowerCase()] = token;
    setData(next);

    // Evaluate alerts.
    for (const w of watched) {
      const token = next[w.address.toLowerCase()];
      if (!w.alertPct || !token || token.change24h == null) continue;
      const key = w.address.toLowerCase();
      const over = Math.abs(token.change24h) >= w.alertPct;
      if (over && !triggered.current.has(key)) {
        triggered.current.add(key);
        notify(w, token.change24h, token.price);
      } else if (!over) {
        triggered.current.delete(key);
      }
    }
  }, [watched]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  async function enableAlerts() {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission();
    setPerm(p);
  }

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Watchlist</h1>
          <p className="mt-0.5 text-sm text-muted">
            Live prices and alerts for the tokens you follow. Saved on this device.
          </p>
        </div>
        {watched.length > 0 && perm !== 'granted' ? (
          <button
            type="button"
            onClick={enableAlerts}
            className="shrink-0 rounded-lg border border-accent bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Enable alerts
          </button>
        ) : null}
      </div>

      {watched.length === 0 ? (
        <div className="rounded-xl border border-line bg-card px-6 py-16 text-center">
          <p className="text-sm font-medium text-ink">Nothing on your watchlist yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Open a token and tap the star, or browse{' '}
            <Link href="/markets" className="text-accent underline underline-offset-2">
              Markets
            </Link>{' '}
            and <Link href="/new" className="text-accent underline underline-offset-2">New launches</Link>.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          <ul className="divide-y divide-line">
            {watched.map((w) => (
              <WatchRow key={w.address} watched={w} token={data[w.address.toLowerCase()]} alertsOn={perm === 'granted'} />
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function WatchRow({
  watched,
  token,
  alertsOn,
}: {
  watched: WatchedToken;
  token: Token | undefined;
  alertsOn: boolean;
}) {
  const change = token?.change24h ?? null;

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Link href={`/token/${watched.address}`} className="flex min-w-0 flex-1 items-center gap-3">
        <TokenLogo src={token?.logo ?? null} symbol={watched.symbol} className="size-8 shrink-0" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-ink">
            {watched.symbol} <span className="font-normal text-muted">{watched.name}</span>
          </div>
          <div className="text-xs text-muted">Vol {usd(token?.volume24h ?? null)}</div>
        </div>
      </Link>

      <div className="shrink-0 text-right">
        <div className="text-sm tabular-nums text-ink">{price(token?.price ?? null)}</div>
        <div
          className={`text-xs tabular-nums ${
            change == null ? 'text-muted' : change >= 0 ? 'text-up' : 'text-down'
          }`}
        >
          {change == null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <label className="flex items-center gap-1 text-xs text-muted" title="Alert when |24h change| ≥ this">
          ±
          <input
            type="number"
            min={1}
            step={1}
            defaultValue={watched.alertPct ?? ''}
            placeholder="%"
            onBlur={(e) => {
              const v = Number.parseFloat(e.target.value);
              setAlert(watched.address, Number.isFinite(v) && v > 0 ? v : undefined);
            }}
            className="w-14 rounded-md border border-line bg-canvas px-1.5 py-1 text-right text-xs tabular-nums text-ink outline-none focus:border-accent"
          />
        </label>
        {watched.alertPct && !alertsOn ? (
          <span title="Enable alerts to be notified" className="text-warn">!</span>
        ) : null}
        <button
          type="button"
          onClick={() => removeWatch(watched.address)}
          aria-label="Remove"
          className="rounded-md p-1 text-muted transition-colors hover:bg-sunken hover:text-down"
        >
          ✕
        </button>
      </div>
    </li>
  );
}

function notify(token: WatchedToken, change: number, price: number | null): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const dir = change >= 0 ? '▲' : '▼';
  new Notification(`${token.symbol} ${dir} ${Math.abs(change).toFixed(1)}% (24h)`, {
    body: price != null ? `Now $${price.toLocaleString()}` : 'Threshold crossed on Norien',
    tag: `norien-alert-${token.address}`,
  });
}
