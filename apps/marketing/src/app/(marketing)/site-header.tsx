'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { APP_URL, Brand, ButtonLink, Container, DOCS_URL } from '@norien-live/web-ui';

/**
 * The marketing site header.
 *
 * One client component owns the whole bar so the mobile menu can coordinate
 * with the actions — opening the drawer swaps the hamburger for an ✕ and hides
 * the "Open app" button, making the navigation the single focus. Desktop is a
 * balanced three-part row: logo · navigation · actions.
 */

const LINKS: { href: string; label: string; external?: boolean }[] = [
  { href: DOCS_URL, label: 'Docs', external: true },
  { href: '/pricing', label: 'Pricing' },
  { href: '/changelog', label: 'Changelog' },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // App Router keeps this mounted across routes, so close the drawer on navigate.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-sm">
      <Container>
        {/* Desktop: logo · nav · actions */}
        <div className="hidden h-16 items-center justify-between gap-6 md:flex">
          <Brand />
          <nav className="flex items-center gap-1" aria-label="Main">
            {LINKS.map((link) => (
              <NavLink key={link.href} link={link} active={isActive(pathname, link)} />
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-ink"
            >
              Sign in
            </Link>
            <ButtonLink href={APP_URL} className="px-4 py-2">
              Open app
            </ButtonLink>
          </div>
        </div>

        {/* Mobile: logo · centered toggle · action */}
        <div className="grid h-16 grid-cols-3 items-center md:hidden">
          <div className="justify-self-start">
            <Brand />
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="site-mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="flex size-11 items-center justify-center justify-self-center rounded-lg border border-line bg-card text-ink transition-colors active:bg-sunken"
          >
            <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75">
              {open ? (
                <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
              ) : (
                <path d="M3 6h14M3 10h14M3 14h14" strokeLinecap="round" />
              )}
            </svg>
          </button>
          <div className="justify-self-end">
            {open ? null : (
              <ButtonLink href={APP_URL} className="px-3.5 py-2 text-sm">
                Open app
              </ButtonLink>
            )}
          </div>
        </div>
      </Container>

      {/* Mobile drawer — animates open/closed, primary focus when open */}
      <div
        id="site-mobile-nav"
        className={`overflow-hidden bg-canvas transition-[max-height,opacity] duration-300 ease-out md:hidden ${
          open ? 'max-h-[26rem] border-t border-line opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <Container className="py-3">
          <nav className="flex flex-col" aria-label="Mobile">
            {LINKS.map((link) =>
              link.external ? (
                <a
                  key={link.href}
                  href={link.href}
                  className="border-b border-line py-3.5 text-[15px] font-medium text-ink last:border-0"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className="border-b border-line py-3.5 text-[15px] font-medium text-ink last:border-0"
                >
                  {link.label}
                </Link>
              ),
            )}
            <div className="flex flex-col gap-2 pt-4">
              <Link
                href="/login"
                className="rounded-lg border border-line bg-card px-4 py-2.5 text-center text-sm font-medium text-ink transition-colors active:bg-sunken"
              >
                Sign in
              </Link>
              <ButtonLink href={APP_URL} className="w-full justify-center py-2.5">
                Open app
              </ButtonLink>
            </div>
          </nav>
        </Container>
      </div>
    </header>
  );
}

function NavLink({
  link,
  active,
}: {
  link: { href: string; label: string; external?: boolean };
  active: boolean;
}) {
  const className = `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    active ? 'text-accent' : 'text-muted hover:text-ink'
  }`;
  return link.external ? (
    <a href={link.href} className={className}>
      {link.label}
    </a>
  ) : (
    <Link href={link.href} aria-current={active ? 'page' : undefined} className={className}>
      {link.label}
    </Link>
  );
}

function isActive(pathname: string, link: { href: string; external?: boolean }): boolean {
  if (link.external || !link.href.startsWith('/')) return false;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}
