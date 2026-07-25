'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

/**
 * Catches a failure in the root layout itself — the one case an ordinary route
 * error boundary can't reach. Reports to Sentry and renders fully standalone
 * (its own <html>/<body> with inline styles), because at this point the app
 * shell and its stylesheet may not have loaded.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F6F2EA',
          color: '#2E261F',
          fontFamily: "ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif",
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: '0 0 8px' }}>
            Something went wrong
          </h1>
          <p style={{ margin: '0 0 20px', color: '#6B5D4F', lineHeight: 1.5 }}>
            An unexpected error interrupted the page. It has been reported — try reloading.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              border: 0,
              borderRadius: '8px',
              background: '#7A5A3A',
              color: '#F6F2EA',
              padding: '10px 18px',
              fontSize: '0.95rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
