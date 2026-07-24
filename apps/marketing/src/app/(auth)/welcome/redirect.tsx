'use client';

import { useEffect, useState } from 'react';

import { ButtonLink } from '@norien-live/web-ui';

/**
 * The "Go to app" control on the success page.
 *
 * Sends the user on automatically after a short beat so the confirmation is
 * seen but never a dead end, while the button lets them skip the wait. A tiny
 * countdown makes the redirect legible rather than abrupt.
 */
export function WelcomeRedirect({ to }: { to: string }) {
  const [seconds, setSeconds] = useState(4);

  useEffect(() => {
    const tick = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    const go = setTimeout(() => {
      window.location.href = to;
    }, 4000);
    return () => {
      clearInterval(tick);
      clearTimeout(go);
    };
  }, [to]);

  return (
    <div className="mt-6">
      <ButtonLink href={to} className="w-full justify-center">
        Go to app →
      </ButtonLink>
      <p className="mt-3 text-xs text-muted">
        Redirecting automatically{seconds > 0 ? ` in ${seconds}s` : '…'}
      </p>
    </div>
  );
}
