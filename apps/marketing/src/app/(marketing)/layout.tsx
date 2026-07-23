import Link from 'next/link';
import type { ReactNode } from 'react';

import { Brand } from '@norien-live/web-ui';
import { API_URL, APP_URL, DOCS_URL } from '@norien-live/web-ui';
import { Container } from '@norien-live/web-ui';
import { ButtonLink } from '@norien-live/web-ui';
import { MarketingNav } from './nav';

/**
 * The public site shell.
 *
 * Deliberately unlike the app shell: no sidebar, wide measure, generous
 * vertical rhythm. The only thing the two share is the token set.
 */

const PRODUCT = [
  { href: '/#registry', label: 'Registry' },
  { href: '/#runtime', label: 'Runtime' },
  { href: '/#marketplace', label: 'Marketplace' },
  { href: '/#api', label: 'API' },
];

const RESOURCES = [
  { href: DOCS_URL, label: 'Documentation' },
  { href: '/changelog', label: 'Changelog' },
  { href: '/blog', label: 'Blog' },
  { href: '/pricing', label: 'Pricing' },
];

const COMPANY = [
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
];

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-sm">
        <Container>
          <div className="flex h-16 items-center justify-between gap-4">
            <Brand />
            <MarketingNav />
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-ink sm:inline-flex"
              >
                Sign in
              </Link>
              <ButtonLink href={APP_URL} className="px-3 py-1.5 sm:px-4 sm:py-2">
                Open app
              </ButtonLink>
            </div>
          </div>
        </Container>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-line bg-card">
        <Container className="py-12 sm:py-16">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Brand />
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
                The registry, runtime, and data layer for autonomous agents.
              </p>
            </div>

            <FooterColumn title="Product" links={PRODUCT} />
            <FooterColumn title="Resources" links={RESOURCES} />
            <FooterColumn title="Company" links={COMPANY} />
          </div>

          <div className="mt-10 flex flex-col gap-3 border-t border-line pt-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} Norien</span>
            <ApiOrigin />
          </div>
        </Container>
      </footer>
    </div>
  );
}

/**
 * Where this deployment reads its data from.
 *
 * Derived rather than written, so the footer stops claiming "running locally"
 * the moment the app is pointed at a deployed registry.
 */
function ApiOrigin() {
  let origin = API_URL;
  try {
    origin = new URL(API_URL).host;
  } catch {
    // A malformed value is still worth showing verbatim.
  }

  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);

  return (
    <span className="font-mono text-xs">
      {local ? 'Running locally · ' : ''}
      api: {origin}
    </span>
  );
}

function FooterColumn({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink">{title}</h3>
      <ul className="mt-3 space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-sm text-muted transition-colors hover:text-accent">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
