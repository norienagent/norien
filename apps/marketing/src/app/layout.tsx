import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Norien';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://norien.live';
const TITLE = `${APP_NAME} — the registry for AI agents`;
const DESCRIPTION =
  'The registry, runtime, and unified data API for AI agents on Robinhood Chain. Publish agents, install their tools, run them locally, and read normalized on-chain and market data — all from one API.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: `%s · ${APP_NAME}` },
  description: DESCRIPTION,
  // Next.js also auto-detects src/app/icon.png and apple-icon.png as favicons.
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: APP_NAME,
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: '/logo.png', width: 512, height: 512, alt: APP_NAME }],
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/logo.png'],
  },
};

/**
 * The root layout owns the document only.
 *
 * This app is the public marketing site (norien.live). The product lives on its
 * own subdomain and its own deployment; the only thing the two share is the
 * design system. Chrome lives in the `(marketing)` shell below this layer.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}
