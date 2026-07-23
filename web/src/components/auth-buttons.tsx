'use client';

import { useState, type ReactNode } from 'react';

import { createClient, supabaseConfigured } from '@/lib/supabase/client';

/**
 * OAuth sign-in buttons.
 *
 * A real click now: each button starts a Supabase OAuth flow and the browser is
 * handed to GitHub/Google. When Supabase is not configured the buttons disable
 * themselves and a notice explains why — the same honest "not connected" state
 * as before, but now the connected path actually works.
 */
export function OAuthButtons({ verb, next = '/app' }: { verb: string; next?: string }) {
  const [pending, setPending] = useState<'github' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(provider: 'github' | 'google') {
    const supabase = createClient();
    if (!supabase) return;

    setPending(provider);
    setError(null);

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error: authError } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });

    if (authError) {
      setError(authError.message);
      setPending(null);
    }
    // On success the browser navigates away, so no success handling is needed.
  }

  const disabled = !supabaseConfigured;

  return (
    <div className="space-y-2.5">
      <ProviderButton
        label={`${verb} with GitHub`}
        loading={pending === 'github'}
        disabled={disabled || pending !== null}
        onClick={() => signIn('github')}
        icon={
          <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden>
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
        }
      />
      <ProviderButton
        label={`${verb} with Google`}
        loading={pending === 'google'}
        disabled={disabled || pending !== null}
        onClick={() => signIn('google')}
        icon={
          <svg viewBox="0 0 18 18" className="size-4" aria-hidden>
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 009 18z"
            />
            <path fill="#FBBC05" d="M3.96 10.71a5.41 5.41 0 010-3.42V4.96H.96a9 9 0 000 8.08l3-2.33z" />
            <path
              fill="#EA4335"
              d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 00.96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"
            />
          </svg>
        }
      />

      {error ? <p className="pt-1 text-sm text-down">{error}</p> : null}
      {disabled ? <NotConnected /> : null}
    </div>
  );
}

function ProviderButton({
  label,
  icon,
  loading,
  disabled,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-card px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-55"
    >
      {loading ? <span className="size-4 animate-spin rounded-full border-2 border-line border-t-accent" /> : icon}
      {loading ? 'Redirecting…' : label}
    </button>
  );
}

function NotConnected() {
  return (
    <div className="mt-4 rounded-lg border border-warn/30 bg-warn/10 px-4 py-3">
      <p className="text-sm leading-relaxed text-ink">
        Authentication is not configured on this deployment. Set{' '}
        <span className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</span> and{' '}
        <span className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> to enable it.
      </p>
    </div>
  );
}
