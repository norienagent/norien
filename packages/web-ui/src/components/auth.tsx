import Link from 'next/link';
import type { ReactNode } from 'react';

import { Brand } from './brand';

/**
 * Authentication UI.
 *
 * Prepared for Supabase Auth: the providers, layout, and copy are final, and
 * the buttons are the components the OAuth handlers will attach to. They are
 * disabled rather than wired to a stub, because a sign-in button that appears
 * to work and silently does nothing is worse than one that says it is not ready.
 */

export function AuthShell({
  title,
  detail,
  children,
  footer,
}: {
  title: string;
  detail: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Brand size="lg" />
        </div>

        <div className="rounded-xl border border-line bg-card p-7">
          <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{detail}</p>

          <div className="mt-6">{children}</div>
        </div>

        <p className="mt-6 text-center text-sm text-muted">{footer}</p>

        <p className="mt-8 text-center text-xs text-muted">
          <Link href="/" className="hover:text-accent">
            ← Back to norien.dev
          </Link>
        </p>
      </div>
    </div>
  );
}
