'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/markets', label: 'Markets' },
  { href: '/projects', label: 'Projects' },
] as const;

/** Marks the active section so the current page is always obvious. */
export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="nav">
      {LINKS.map((link) => {
        const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
        return (
          <Link key={link.href} href={link.href} data-active={active}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
