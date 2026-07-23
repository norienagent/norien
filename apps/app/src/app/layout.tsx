import Link from 'next/link';
import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';

import { api } from '@norien-live/web-ui/api';
import { count } from '@norien-live/web-ui';

import './globals.css';
import { SearchBox } from '@/components/search-box';
import { SignInToast } from '@/components/sign-in-toast';
import { DrawerProvider, DrawerToggle, Sidebar } from './sidebar';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Norien';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.norien.live';
const TITLE = `${APP_NAME} — the registry for AI agents`;
const DESCRIPTION =
  'Publish agents, install the tools they depend on, run them locally, and read normalized on-chain and market data — all from one API.';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: TITLE, template: `%s · ${APP_NAME}` },
  description: DESCRIPTION,
  // Next.js also auto-detects src/app/icon.png and apple-icon.png as favicons.
  robots: { index: false, follow: false },
};

/**
 * The app is a live product dashboard, not a static site: every page reads
 * current registry, market, and provider data. Rendering on demand (rather than
 * prerendering at build) keeps the data fresh and — just as importantly — means
 * the build never blocks on a slow provider. Applies to every route below.
 */
export const dynamic = 'force-dynamic';

/**
 * The application document and shell.
 *
 * This app is only ever the product (app.norien.live has no marketing pages),
 * so the shell lives directly in the root layout: fixed sidebar on the left,
 * topbar across the content column, page content below. The sidebar collapses
 * into a drawer under `lg`; the content column is never horizontally scrollable,
 * so wide tables scroll inside their own container instead.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas text-ink antialiased">
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
          <SignInToast />
        </DrawerProvider>
      </body>
    </html>
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
      href="/runtime"
      className="hidden shrink-0 items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-xs text-muted transition-colors hover:border-accent/40 md:inline-flex"
      title={`${chain.data.chain.name} · block ${count(chain.data.blockNumber)}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-up" />
      <span className="font-medium text-ink">{chain.data.chain.name}</span>
      <span className="font-mono">{count(chain.data.blockNumber)}</span>
    </Link>
  );
}
