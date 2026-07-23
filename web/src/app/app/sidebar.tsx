'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { Brand } from '@/components/brand';

/**
 * Application navigation.
 *
 * One list drives both the fixed desktop rail and the mobile drawer, so the two
 * can never fall out of sync. The drawer closes on navigation because App
 * Router keeps this component mounted across route changes.
 */

const NAV: { href: string; label: string; icon: ReactNode }[] = [
  { href: '/app', label: 'Dashboard', icon: <IconGrid /> },
  { href: '/app/markets', label: 'Markets', icon: <IconChart /> },
  { href: '/app/search', label: 'Search', icon: <IconSearch /> },
  { href: '/app/projects', label: 'Projects', icon: <IconLayers /> },
  { href: '/app/registry', label: 'Registry', icon: <IconBox /> },
  { href: '/app/tools', label: 'Tools', icon: <IconTool /> },
  { href: '/app/runtime', label: 'Runtime', icon: <IconPlay /> },
  { href: '/app/publish', label: 'Publish', icon: <IconUpload /> },
  { href: '/app/api-keys', label: 'API Keys', icon: <IconKey /> },
  { href: '/app/settings', label: 'Settings', icon: <IconCog /> },
];

const DrawerContext = createContext<{ open: boolean; setOpen: (open: boolean) => void }>({
  open: false,
  setOpen: () => {},
});

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return <DrawerContext.Provider value={{ open, setOpen }}>{children}</DrawerContext.Provider>;
}

export function DrawerToggle() {
  const { open, setOpen } = useContext(DrawerContext);

  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-controls="app-sidebar"
      aria-label={open ? 'Close navigation' : 'Open navigation'}
      className="rounded-lg border border-line bg-card p-2 text-ink lg:hidden"
    >
      <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75">
        {open ? (
          <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
        ) : (
          <path d="M3 6h14M3 10h14M3 14h14" strokeLinecap="round" />
        )}
      </svg>
    </button>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { open, setOpen } = useContext(DrawerContext);

  return (
    <>
      {/* Scrim. Only rendered when the drawer is open, so it never intercepts
          clicks on desktop. */}
      {open ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-ink/25 lg:hidden"
        />
      ) : null}

      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line bg-card transition-transform duration-200 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 shrink-0 items-center border-b border-line px-5">
          <Brand href="/app" />
        </div>

        <nav aria-label="Application" className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-0.5">
            {NAV.map((item) => {
              const active =
                item.href === '/app' ? pathname === '/app' : pathname.startsWith(item.href);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-accent-soft text-accent'
                        : 'text-muted hover:bg-sunken hover:text-ink'
                    }`}
                  >
                    <span className="shrink-0">{item.icon}</span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-line p-3">
          <Link
            href="/app/profile"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-sunken hover:text-ink"
          >
            <IconUser />
            Profile
          </Link>
          <Link
            href="/"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-sunken hover:text-ink"
          >
            <IconHome />
            Back to site
          </Link>
        </div>
      </aside>
    </>
  );
}

/* --- Icons ---------------------------------------------------------------
 * Inline so they cost no request and inherit currentColor. 20x20 on a 1.6
 * stroke keeps them optically consistent with the type.
 * ---------------------------------------------------------------------- */

const iconProps = {
  className: 'size-[1.125rem]',
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function IconGrid() {
  return (
    <svg {...iconProps}>
      <rect x="2.5" y="2.5" width="6" height="6" rx="1.5" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1.5" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1.5" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1.5" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg {...iconProps}>
      <path d="M3 16.5V9M8 16.5V4M13 16.5v-5M18 16.5V7" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg {...iconProps}>
      <circle cx="9" cy="9" r="5.5" />
      <path d="M13 13l4 4" />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg {...iconProps}>
      <path d="M10 2.5l7 3.75-7 3.75-7-3.75 7-3.75z" />
      <path d="M3 10.5l7 3.75 7-3.75" />
    </svg>
  );
}

function IconBox() {
  return (
    <svg {...iconProps}>
      <path d="M10 2.5l7 3.5v8l-7 3.5-7-3.5v-8l7-3.5z" />
      <path d="M3 6l7 3.5L17 6M10 9.5v8" />
    </svg>
  );
}

function IconTool() {
  return (
    <svg {...iconProps}>
      <path d="M12.5 3a4 4 0 00-4.9 5.2l-4.4 4.4a1.5 1.5 0 002.1 2.1l4.4-4.4A4 4 0 0016.5 6l-2 2-2-1-1-2 2-2z" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg {...iconProps}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M8.25 7.25l4.5 2.75-4.5 2.75v-5.5z" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg {...iconProps}>
      <path d="M10 13.5v-10M6.5 6.5L10 3l3.5 3.5" />
      <path d="M3.5 12.5v3a1.5 1.5 0 001.5 1.5h10a1.5 1.5 0 001.5-1.5v-3" />
    </svg>
  );
}

function IconKey() {
  return (
    <svg {...iconProps}>
      <circle cx="6.5" cy="6.5" r="3.5" />
      <path d="M9 9l7.5 7.5M13 13l2-2M15 15l1.5-1.5" />
    </svg>
  );
}

function IconCog() {
  return (
    <svg {...iconProps}>
      <circle cx="10" cy="10" r="2.75" />
      <path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1L4.7 4.7" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg {...iconProps}>
      <circle cx="10" cy="7" r="3.25" />
      <path d="M3.75 16.5a6.25 6.25 0 0112.5 0" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg {...iconProps}>
      <path d="M3.5 8.5L10 3l6.5 5.5V16a1 1 0 01-1 1h-11a1 1 0 01-1-1V8.5z" />
    </svg>
  );
}
