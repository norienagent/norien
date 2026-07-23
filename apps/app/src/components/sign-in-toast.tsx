'use client';

import { useEffect, useState } from 'react';

/**
 * A transient "Login successful" confirmation.
 *
 * A sign-in can land here two ways: through our own callback (which adds
 * `?signedin=1`), or straight from the identity provider with the auth `code`
 * still in the URL, which the Supabase client then exchanges. We treat either as
 * "just signed in". The entry URL is captured during the first render, before
 * any client can strip those params in an effect, so the signal is never missed.
 */
export function SignInToast() {
  const [entry] = useState(() =>
    typeof window === 'undefined' ? '' : window.location.search + window.location.hash,
  );
  const [show, setShow] = useState(false);

  useEffect(() => {
    const justSignedIn =
      /[?&]signedin=1(&|$)/.test(entry) || /[?&]code=/.test(entry) || /access_token=/.test(entry);
    if (!justSignedIn) return;

    setShow(true);

    // Drop our own flag so a refresh or shared link does not repeat the toast.
    const url = new URL(window.location.href);
    if (url.searchParams.has('signedin')) {
      url.searchParams.delete('signedin');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }

    const timer = setTimeout(() => setShow(false), 6000);
    return () => clearTimeout(timer);
  }, [entry]);

  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ animation: 'toast-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both' }}
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2.5 rounded-lg border border-line bg-card px-4 py-3 text-sm font-medium text-ink shadow-lg"
    >
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-up/15 text-xs text-up">
        ✓
      </span>
      Login successful
    </div>
  );
}
