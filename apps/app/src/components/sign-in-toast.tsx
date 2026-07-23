'use client';

import { useEffect, useState } from 'react';

/**
 * A transient "Login successful" confirmation.
 *
 * The OAuth callback lands the user here with `?signedin=1`. We show a toast,
 * strip the flag from the URL so a refresh or share does not repeat it, and fade
 * out on a timer. Reads the URL directly (rather than useSearchParams) to avoid
 * a Suspense boundary in the layout.
 */
export function SignInToast() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('signedin') !== '1') return;

    setShow(true);
    url.searchParams.delete('signedin');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);

    const timer = setTimeout(() => setShow(false), 4500);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2.5 rounded-lg border border-line bg-card px-4 py-3 text-sm font-medium text-ink shadow-lg"
    >
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-up/15 text-xs text-up">
        ✓
      </span>
      Login successful
    </div>
  );
}
