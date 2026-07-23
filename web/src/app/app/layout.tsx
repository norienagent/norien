import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';

import { api } from '@/lib/api';
import { count } from '@/lib/format';
import { SearchBox } from '@/components/search-box';
import { DrawerProvider, DrawerToggle, Sidebar } from './sidebar';

/**
 * The application shell.
 *
 * Every /app/* route renders inside this: fixed sidebar on the left, topbar
 * across the content column, page content below. The sidebar collapses into a
 * drawer under `lg`; the content column is never horizontally scrollable, so
 * wide tables scroll inside their own container instead.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <DrawerProvider>
      <Sidebar />

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-sm">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <DrawerToggle />
            <div className="min-w-0 flex-1 sm:max-w-xl">
              <SearchBox />
            </div>
            <Suspense fallback={null}>
              <ChainBadge />
            </Suspense>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </DrawerProvider>
  );
}

/**
 * Live chain head in the topbar.
 *
 * Suspended separately so a slow RPC never delays the shell, and rendered as
 * nothing at all when the chain is unreachable rather than showing a stale or
 * invented block height.
 */
async function ChainBadge() {
  const chain = await api.chain().catch(() => null);
  if (!chain) return null;

  return (
    <Link
      href="/app/runtime"
      className="hidden shrink-0 items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-xs text-muted transition-colors hover:border-accent/40 md:inline-flex"
      title={`${chain.data.chain.name} · block ${count(chain.data.blockNumber)}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-up" />
      <span className="font-medium text-ink">{chain.data.chain.name}</span>
      <span className="font-mono">{count(chain.data.blockNumber)}</span>
    </Link>
  );
}
