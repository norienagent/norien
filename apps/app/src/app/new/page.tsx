import { api } from '@norien-live/web-ui/api';
import { DegradedNotice, SectionHeading } from '@norien-live/web-ui';

import { NewLaunches } from '@/components/new-launches';

export const metadata = {
  title: 'New launches',
  description: 'The newest token launches on Robinhood Chain, live.',
};

/**
 * New-launches radar.
 *
 * Server-fetches the first page so the list is there on load; the client
 * component then keeps it fresh on an interval.
 */
export default async function NewLaunchesPage() {
  const result = await api.newTokens({ limit: 30 });
  const tokens = result?.data.items ?? [];

  return (
    <>
      <SectionHeading
        title="New launches"
        detail="The freshest tokens on Robinhood Chain, newest first — updating live."
      />
      {result ? <DegradedNotice sources={result.sources} degraded={result.degraded} /> : null}
      <NewLaunches initial={tokens} />
    </>
  );
}
