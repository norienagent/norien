'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { DOCS_NAV } from './docs-nav';

/**
 * Documentation navigation.
 *
 * A sticky rail on desktop; a collapsible panel on mobile that names the current
 * page so the reader always knows where they are before opening it. One list
 * drives both, and it closes on navigation.
 */
export function DocsSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const current =
    DOCS_NAV.flatMap((g) => g.links).find((l) => l.href === pathname)?.label ?? 'Documentation';

  return (
    <>
      {/* Mobile disclosure */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg border border-line bg-card px-4 py-3 text-sm font-medium text-ink lg:hidden"
      >
        <span>
          <span className="text-muted">Docs / </span>
          {current}
        </span>
        <svg
          viewBox="0 0 20 20"
          className={`size-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <nav
        aria-label="Documentation"
        className={`${open ? 'mt-2 block' : 'hidden'} rounded-lg border border-line bg-card p-3 lg:mt-0 lg:block lg:border-0 lg:bg-transparent lg:p-0`}
      >
        <div className="space-y-6 lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-2">
          {DOCS_NAV.map((group) => (
            <div key={group.title}>
              <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-ink lg:px-0">
                {group.title}
              </h3>
              <ul className="space-y-0.5">
                {group.links.map((link) => {
                  const active = pathname === link.href;
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        aria-current={active ? 'page' : undefined}
                        className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
                          active
                            ? 'bg-accent-soft font-medium text-accent'
                            : 'text-muted hover:bg-sunken hover:text-ink'
                        }`}
                      >
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
