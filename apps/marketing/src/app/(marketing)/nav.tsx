'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { DOCS_URL } from '@norien-live/web-ui';

const LINKS = [
  { href: DOCS_URL, label: 'Docs' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/changelog', label: 'Changelog' },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' },
];

/**
 * Marketing navigation.
 *
 * Inline on desktop, a disclosure panel below `md`. The panel closes on
 * navigation, since App Router keeps this component mounted across routes.
 */
export function MarketingNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
        {LINKS.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active ? 'text-accent' : 'text-muted hover:text-ink'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="marketing-menu"
        aria-label={open ? 'Close menu' : 'Open menu'}
        className="rounded-lg border border-line bg-card p-2 text-ink md:hidden"
      >
        <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75">
          {open ? (
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          ) : (
            <path d="M3 6h14M3 10h14M3 14h14" strokeLinecap="round" />
          )}
        </svg>
      </button>

      {open ? (
        <div
          id="marketing-menu"
          className="absolute inset-x-0 top-16 border-b border-line bg-canvas px-5 pb-4 shadow-sm md:hidden"
        >
          <nav className="flex flex-col" aria-label="Main">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="border-b border-line py-3 text-sm font-medium text-ink last:border-0"
              >
                {link.label}
              </Link>
            ))}
            <Link href="/login" className="py-3 text-sm font-medium text-accent">
              Sign in
            </Link>
          </nav>
        </div>
      ) : null}
    </>
  );
}
