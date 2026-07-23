import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { APP_URL, Brand, ButtonLink, Container, DOCS_URL, SITE_URL } from '@norien-live/web-ui';

import './globals.css';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Norien';
const TITLE = `${APP_NAME} Docs`;
const DESCRIPTION = 'Install the CLI, publish an agent, run it, and read the API.';

export const metadata: Metadata = {
  metadataBase: new URL(DOCS_URL),
  title: { default: TITLE, template: `%s · ${TITLE}` },
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    url: DOCS_URL,
    siteName: TITLE,
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: '/logo.png', width: 512, height: 512, alt: APP_NAME }],
  },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION, images: ['/logo.png'] },
};

/**
 * The documentation document and shell.
 *
 * docs.norien.live is a single long page, so the chrome is deliberately thin: a
 * header that points back to the marketing site and out to the app, the content,
 * and a quiet footer. It shares the design system with the other two apps but
 * none of their navigation.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas text-ink antialiased">
        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-sm">
            <Container>
              <div className="flex h-16 items-center justify-between gap-4">
                <Brand href={SITE_URL} />
                <div className="flex items-center gap-2">
                  <a
                    href={SITE_URL}
                    className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-ink sm:inline-flex"
                  >
                    Home
                  </a>
                  <ButtonLink href={APP_URL} className="px-3 py-1.5 sm:px-4 sm:py-2">
                    Open app
                  </ButtonLink>
                </div>
              </div>
            </Container>
          </header>

          <main className="flex-1">{children}</main>

          <footer className="border-t border-line bg-card">
            <Container className="flex flex-col gap-3 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
              <span>© {new Date().getFullYear()} Norien</span>
              <a href={SITE_URL} className="transition-colors hover:text-accent">
                norien.live
              </a>
            </Container>
          </footer>
        </div>
      </body>
    </html>
  );
}
