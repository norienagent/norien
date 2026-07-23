import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Marketing-site primitives.
 *
 * The public pages are content, not data, so they share layout components
 * rather than the app's card/table set. Same tokens, different rhythm: more
 * whitespace, larger type, fewer borders.
 */

export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>{children}</div>;
}

export function Section({
  id,
  children,
  className = '',
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-20 border-t border-line py-16 sm:py-24 ${className}`}>
      <Container>{children}</Container>
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-accent">{children}</div>
  );
}

export function SectionTitle({ title, detail }: { title: string; detail?: ReactNode }) {
  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h2>
      {detail ? <p className="mt-3 text-base leading-relaxed text-muted">{detail}</p> : null}
    </div>
  );
}

/** A terminal-style block. Used wherever the page shows a real command. */
export function Terminal({ lines, caption }: { lines: string[]; caption?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-ink">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
        <span aria-hidden className="size-2.5 rounded-full bg-white/20" />
        <span aria-hidden className="size-2.5 rounded-full bg-white/20" />
        <span aria-hidden className="size-2.5 rounded-full bg-white/20" />
        {caption ? <span className="ml-2 text-xs text-white/40">{caption}</span> : null}
      </div>
      <pre className="scroll-x px-4 py-4 font-mono text-[0.8125rem] leading-relaxed text-code-fg">
        <code>
          {lines.map((line, index) => (
            <span key={`${index}:${line}`} className="block">
              {line.startsWith('$') ? (
                <>
                  <span className="text-code-prompt select-none">$ </span>
                  {line.slice(2)}
                </>
              ) : (
                <span className="text-white/45">{line}</span>
              )}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

/**
 * A static code sample on the inverted surface.
 *
 * Shared by the landing page, the docs, and the engineering notes so the three
 * cannot drift apart.
 */
export function CodeBlock({ children }: { children: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-ink">
      <pre className="scroll-x p-4 font-mono text-[0.8125rem] leading-relaxed text-code-fg">
        <code>{children}</code>
      </pre>
    </div>
  );
}

export function FeatureCard({
  title,
  children,
  href,
}: {
  title: string;
  children: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <h3 className="text-base font-semibold tracking-tight text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>
      {href ? <span className="mt-3 inline-block text-sm font-medium text-accent">Learn more →</span> : null}
    </>
  );

  const className = 'block rounded-xl border border-line bg-card p-6 transition-colors';

  return href ? (
    <Link href={href} className={`${className} hover:border-accent/40`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Long-form content pages (privacy, terms, about) share this measure and rhythm. */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-3xl space-y-5 text-[0.9375rem] leading-relaxed text-muted [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded [&_code]:bg-sunken [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-ink [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-ink [&_h3]:mt-8 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-semibold [&_strong]:text-ink">
      {children}
    </div>
  );
}

/** Page header for every secondary marketing page. */
export function PageHeader({ title, detail }: { title: string; detail?: ReactNode }) {
  return (
    <Container className="py-14 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h1>
      {detail ? <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">{detail}</p> : null}
    </Container>
  );
}
