import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

import type { SourceReport } from '@/lib/api';
import { percent } from '@/lib/format';

/**
 * Shared presentational primitives.
 *
 * Defined once so a card, a stat, a skeleton, and an empty state look identical
 * on every page — and so no page hand-rolls its own loading or error treatment.
 * Every colour resolves to a design token; none are hardcoded here.
 */

/* --- Surfaces ------------------------------------------------------------ */

export function Card({
  title,
  action,
  children,
  padded = true,
  className = '',
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-card ${className}`}
    >
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
          {action}
        </header>
      ) : null}
      {padded ? <div className="p-4 sm:p-5">{children}</div> : children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4 sm:p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1.5 text-xl font-semibold tracking-tight text-ink">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

export function SectionHeading({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {detail ? <p className="mt-1 text-sm text-muted">{detail}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* --- Values -------------------------------------------------------------- */

/** Colour carries direction; the sign carries the value. */
export function Change({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-muted">—</span>;
  return (
    <span className={value >= 0 ? 'text-up' : 'text-down'}>{percent(value)}</span>
  );
}

export function Mono({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-[0.8125rem] ${className}`}>{children}</span>;
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'up' | 'down' | 'warn';
}) {
  const tones: Record<string, string> = {
    neutral: 'border-line bg-sunken text-muted',
    accent: 'border-line bg-accent-soft text-accent',
    up: 'border-up/25 bg-up/10 text-up',
    down: 'border-down/25 bg-down/10 text-down',
    warn: 'border-warn/25 bg-warn/10 text-warn',
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Definition row used by every detail page, so labels align identically. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line py-2.5 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm text-ink">{children}</dd>
    </div>
  );
}

/* --- Controls ------------------------------------------------------------ */

type ButtonTone = 'primary' | 'secondary' | 'ghost';

const buttonTones: Record<ButtonTone, string> = {
  primary: 'bg-accent text-white border-accent hover:bg-accent-hover',
  secondary: 'bg-card text-ink border-line hover:bg-sunken',
  ghost: 'bg-transparent text-muted border-transparent hover:bg-sunken hover:text-ink',
};

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';

export function Button({
  tone = 'primary',
  className = '',
  ...props
}: ComponentProps<'button'> & { tone?: ButtonTone }) {
  return <button className={`${buttonBase} ${buttonTones[tone]} ${className}`} {...props} />;
}

export function ButtonLink({
  tone = 'primary',
  className = '',
  ...props
}: ComponentProps<typeof Link> & { tone?: ButtonTone }) {
  return <Link className={`${buttonBase} ${buttonTones[tone]} ${className}`} {...props} />;
}

/* --- States -------------------------------------------------------------- */

export function Empty({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="px-4 py-12 text-center">
      <div className="text-sm font-medium text-ink">{title}</div>
      {detail ? <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{detail}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="px-4 py-12 text-center">
      <div className="text-sm font-medium text-down">{title}</div>
      {detail ? <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{detail}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ width = '100%', height = 14 }: { width?: string | number; height?: number }) {
  return <div className="skeleton" style={{ width, height }} />;
}

export function SkeletonRows({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="p-4 sm:p-5">
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex gap-4">
            {Array.from({ length: cols }).map((__, colIndex) => (
              <div key={colIndex} className="flex-1">
                <Skeleton width={colIndex === 0 ? '60%' : '75%'} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonCards({ count: n = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: n }).map((_, index) => (
        <div className="rounded-xl border border-line bg-card p-4 sm:p-5" key={index}>
          <Skeleton width="45%" height={10} />
          <div className="h-2.5" />
          <Skeleton width="70%" height={20} />
        </div>
      ))}
    </>
  );
}

/**
 * Surfaces partial data honestly.
 *
 * The API reports which providers failed; hiding that would present an
 * incomplete answer as a complete one.
 */
export function DegradedNotice({ sources, degraded }: { sources: SourceReport[]; degraded: boolean }) {
  if (!degraded) return null;

  const down = sources.filter((source) => source.status === 'unavailable');
  if (down.length === 0) return null;

  return (
    <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-ink">
      <span aria-hidden className="text-warn">
        ⚠
      </span>
      <span>
        Showing partial data — {down.map((source) => source.provider).join(', ')}{' '}
        {down.length === 1 ? 'is' : 'are'} unavailable right now.
      </span>
    </div>
  );
}

/** Provenance, rendered plainly. Every market page can show where data came from. */
export function SourceList({ sources }: { sources: SourceReport[] }) {
  if (sources.length === 0) return null;

  const tone: Record<string, string> = {
    ok: 'text-up',
    unavailable: 'text-down',
    not_configured: 'text-muted',
    skipped: 'text-muted',
  };

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
      {sources.map((source) => (
        <span key={source.provider} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={tone[source.status] ?? 'text-muted'}>
            ●
          </span>
          <span className="text-ink">{source.provider}</span>
          <span>{source.status === 'ok' && source.ms ? `${source.ms}ms` : source.status}</span>
        </span>
      ))}
    </div>
  );
}

export function TokenCell({
  token,
}: {
  token: { address: string; name: string; symbol: string; logo: string | null; chain: { id: number } };
}) {
  return (
    <Link
      href={`/app/token/${token.address}?chainId=${token.chain.id}`}
      className="group inline-flex min-w-0 items-center gap-2.5"
    >
      {token.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote logos come
        // from many provider CDNs; configuring each host is not worth it here.
        <img
          className="size-6 shrink-0 rounded-full border border-line bg-sunken object-cover"
          src={token.logo}
          alt=""
          loading="lazy"
        />
      ) : (
        <span aria-hidden className="size-6 shrink-0 rounded-full border border-line bg-sunken" />
      )}
      <span className="min-w-0 truncate">
        <strong className="font-semibold text-ink group-hover:text-accent">
          {token.symbol || '—'}
        </strong>{' '}
        <span className="text-muted">{token.name}</span>
      </span>
    </Link>
  );
}

/**
 * Rendered inline by a detail page when the resource does not exist.
 *
 * Preferred over `notFound()` here because App Router streams these responses:
 * a thrown notFound lands in the RSC payload, so the message only appears after
 * hydration. Returning it as normal output puts it in the initial HTML, which
 * works immediately and without JavaScript.
 */
export function MissingResource({ kind, identifier }: { kind: string; identifier: string }) {
  return (
    <>
      <SectionHeading title={`${kind} not found`} />
      <p className="-mt-3 mb-5 font-mono text-sm break-all text-muted">{identifier}</p>
      <Card>
        <Empty
          title={`No ${kind.toLowerCase()} matches this identifier`}
          detail="It may not exist on this chain, or no connected data source knows about it yet."
        />
      </Card>
    </>
  );
}
