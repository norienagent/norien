import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/**
 * Form and pagination primitives.
 *
 * Every list route filters and paginates the same way, so the styling and the
 * URL-building live here rather than in each page.
 */

const fieldBase =
  'rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none';

export function Input({ className = '', ...props }: ComponentProps<'input'>) {
  return <input spellCheck={false} className={`${fieldBase} ${className}`} {...props} />;
}

export function Select({ className = '', children, ...props }: ComponentProps<'select'>) {
  return (
    <select className={`${fieldBase} pr-8 ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className = '', ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea spellCheck={false} className={`${fieldBase} font-mono leading-relaxed ${className}`} {...props} />
  );
}

export function Toolbar({ children, ...props }: ComponentProps<'form'>) {
  return (
    <form className="mb-5 flex flex-wrap items-center gap-2" {...props}>
      {children}
    </form>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

/**
 * Offset pagination.
 *
 * `buildHref` is supplied by the page so each route keeps its own query-string
 * shape; everything visual is decided here.
 */
export function Pagination({
  offset,
  limit,
  shown,
  total,
  hasMore,
  buildHref,
}: {
  offset: number;
  limit: number;
  shown: number;
  total?: number;
  hasMore: boolean;
  buildHref: (offset: number) => string;
}) {
  if (shown === 0) return null;

  const disabled = 'cursor-not-allowed border-line bg-card text-muted opacity-50';
  const enabled = 'border-line bg-card text-ink hover:bg-sunken';
  const base = 'inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors';

  return (
    <nav className="mt-4 flex items-center justify-between gap-3 text-sm" aria-label="Pagination">
      <span className="text-muted">
        Showing {offset + 1}–{offset + shown}
        {total !== undefined ? ` of ${total.toLocaleString('en-US')}` : ''}
      </span>
      <span className="flex gap-2">
        {offset > 0 ? (
          <Link className={`${base} ${enabled}`} href={buildHref(Math.max(0, offset - limit))}>
            ← Previous
          </Link>
        ) : (
          <span className={`${base} ${disabled}`} aria-disabled="true">
            ← Previous
          </span>
        )}
        {hasMore ? (
          <Link className={`${base} ${enabled}`} href={buildHref(offset + limit)}>
            Next →
          </Link>
        ) : (
          <span className={`${base} ${disabled}`} aria-disabled="true">
            Next →
          </span>
        )}
      </span>
    </nav>
  );
}

/** Query-string builder shared by every paginated route. */
export function buildQuery(entries: Record<string, string | number | undefined>, defaults: Record<string, string | number> = {}): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined || value === '') continue;
    if (defaults[key] !== undefined && String(defaults[key]) === String(value)) continue;
    params.set(key, String(value));
  }

  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Parses an integer search param, clamped, with a fallback for anything invalid. */
export function intParam(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}
