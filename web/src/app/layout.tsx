import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Norien';

export const metadata: Metadata = {
  title: { default: `${APP_NAME} — the registry for AI agents`, template: `%s · ${APP_NAME}` },
  description:
    'Publish agents, install the tools they depend on, run them locally, and read normalized on-chain and market data — all from one API.',
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
