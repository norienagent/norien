import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Norien';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://norien.live';
const TITLE = `${APP_NAME} — the registry for AI agents`;
const DESCRIPTION =
  'Publish agents, install the tools they depend on, run them locally, and read normalized on-chain and market data — all from one API.';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: TITLE, template: `%s · ${APP_NAME}` },
  description: DESCRIPTION,
  // Next.js also auto-detects src/app/icon.png and apple-icon.png as favicons.
  openGraph: {
    type: 'website',
    url: APP_URL,
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
 * Chrome lives in the two shells below it: `(marketing)` for the public site
 * and `app/` for the product. Keeping this layer empty is what lets the two
 * look nothing alike while sharing one design system.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}
