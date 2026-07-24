import Link from 'next/link';
import type { ReactNode } from 'react';

import { adjacent, type DocLink } from './docs-nav';

/**
 * The frame every documentation page shares: a title, a lead, the body, and a
 * prev/next pager derived from the nav order so a reader can move straight
 * through the docs without returning to the sidebar.
 */
export function DocPage({
  href,
  title,
  lead,
  children,
}: {
  href: string;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  const { prev, next } = adjacent(href);

  return (
    <article className="min-w-0">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h1>
        {lead ? <p className="mt-3 text-base leading-relaxed text-muted sm:text-lg">{lead}</p> : null}
      </header>

      <div className="space-y-6">{children}</div>

      {prev || next ? (
        <nav className="mt-14 grid gap-3 border-t border-line pt-6 sm:grid-cols-2" aria-label="Pager">
          {prev ? <PagerLink dir="Previous" link={prev} align="left" /> : <span />}
          {next ? <PagerLink dir="Next" link={next} align="right" /> : <span />}
        </nav>
      ) : null}
    </article>
  );
}

function PagerLink({ dir, link, align }: { dir: string; link: DocLink; align: 'left' | 'right' }) {
  return (
    <Link
      href={link.href}
      className={`group rounded-lg border border-line bg-card p-4 transition-colors hover:border-accent/40 ${
        align === 'right' ? 'sm:text-right' : ''
      }`}
    >
      <div className="text-xs text-muted">{dir}</div>
      <div className="mt-0.5 text-sm font-medium text-ink group-hover:text-accent">{link.label}</div>
    </Link>
  );
}

/** A note or warning callout — for the caveats prose alone would bury. */
export function Note({ type = 'note', children }: { type?: 'note' | 'warn'; children: ReactNode }) {
  const tone =
    type === 'warn' ? 'border-warn/30 bg-warn/10' : 'border-accent/25 bg-accent-soft/40';
  const label = type === 'warn' ? 'Careful' : 'Note';
  return (
    <div className={`rounded-lg border ${tone} px-4 py-3 text-sm leading-relaxed text-ink`}>
      <span className="mr-1.5 font-semibold">{label} —</span>
      {children}
    </div>
  );
}

/** Two-up grid for side-by-side samples (e.g. TypeScript vs Python). */
export function Cols({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 lg:grid-cols-2">{children}</div>;
}
