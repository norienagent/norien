'use client';

import { useState, type ReactNode } from 'react';

import { createClient, supabaseConfigured } from '@/lib/supabase/client';

/**
 * OAuth sign-in.
 *
 * A real click now: the button starts a Supabase OAuth flow and hands the
 * browser to GitHub. When Supabase is not configured it disables itself and a
 * notice explains why. (Google is intentionally not offered — GitHub covers the
 * developer audience, and a provider that is not configured would be a dead
 * button.)
 */
export function OAuthButtons({ verb, next = '/app' }: { verb: string; next?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    const supabase = createClient();
    if (!supabase) return;

    setPending(true);
    setError(null);

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo },
    });

    if (authError) {
      setError(authError.message);
      setPending(false);
    }
    // On success the browser navigates away, so no success handling is needed.
  }

  const disabled = !supabaseConfigured;

  return (
    <div className="space-y-2.5">
      <ProviderButton
        label={`${verb} with GitHub`}
        loading={pending}
        disabled={disabled || pending}
        onClick={signIn}
        icon={
          <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden>
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
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
