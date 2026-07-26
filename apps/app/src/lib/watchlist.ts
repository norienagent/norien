'use client';

import { useEffect, useState } from 'react';

/**
 * A client-side watchlist.
 *
 * Kept in localStorage so it works with no account and no server auth (Norien's
 * auth boundary isn't enforced yet, so a server-side per-user list would mean
 * trusting a client-supplied identity — a fake boundary). Cross-tab updates ride
 * the storage event; same-tab updates a custom event.
 */

export interface WatchedToken {
  address: string;
  chainId?: number;
  symbol: string;
  name: string;
  /** Alert when |24h change| ≥ this percent. Undefined = no alert. */
  alertPct?: number;
}

const KEY = 'norien:watchlist';
const EVENT = 'norien:watchlist-change';

function read(): WatchedToken[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as WatchedToken[]) : [];
  } catch {
    return [];
  }
}

function write(list: WatchedToken[]): void {
  window.localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function isWatched(address: string): boolean {
  return read().some((t) => t.address.toLowerCase() === address.toLowerCase());
}

export function toggleWatch(token: WatchedToken): boolean {
  const list = read();
  const at = list.findIndex((t) => t.address.toLowerCase() === token.address.toLowerCase());
  if (at >= 0) {
    list.splice(at, 1);
    write(list);
    return false;
  }
  list.unshift(token);
  write(list);
  return true;
}

export function removeWatch(address: string): void {
  write(read().filter((t) => t.address.toLowerCase() !== address.toLowerCase()));
}

export function setAlert(address: string, alertPct: number | undefined): void {
  write(
    read().map((t) =>
      t.address.toLowerCase() === address.toLowerCase() ? { ...t, alertPct } : t,
    ),
  );
}

/** Subscribe to the watchlist, re-rendering on any change (this tab or another). */
export function useWatchlist(): WatchedToken[] {
  const [list, setList] = useState<WatchedToken[]>([]);
  useEffect(() => {
    const sync = () => setList(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return list;
}

/** Whether a single address is watched, kept live. */
export function useIsWatched(address: string): boolean {
  const list = useWatchlist();
  return list.some((t) => t.address.toLowerCase() === address.toLowerCase());
}
