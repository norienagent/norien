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
  // The OG and Twitter images come from src/app/opengraph-image.png and
  // twitter-image.png (Next's file convention), so no images are listed here.
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: APP_NAME,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
  // Virtuals Protocol site-ownership verification.
  verification: {
    other: {
      'virtual-protocol-site-verification': '6604e6a63f65b420e504639b13367520',
    },
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
