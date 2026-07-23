'use client';

import { useEffect } from 'react';

import { Button, Card, ErrorState } from '@/components/ui';

/**
 * Root error boundary.
 *
 * A provider outage should never blank the app; the user gets an explanation
 * and a way to retry the render. Because this can catch a failure in either
 * shell, it renders standalone chrome rather than assuming a sidebar exists.
 */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-24">
      <Card>
        <ErrorState
          title="Something went wrong"
          detail={error.message || 'This page could not be loaded.'}
          action={
            <Button onClick={reset} type="button">
              Try again
            </Button>
          }
        />
      </Card>
    </div>
  );
}
