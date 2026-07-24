import Link from 'next/link';

import { Prose } from '@norien-live/web-ui';

import { DocPage, Note } from '../doc-page';

export const metadata = { title: 'Roadmap' };

export default function RoadmapPage() {
  return (
    <DocPage
      href="/roadmap"
      title="Roadmap"
      lead="Where Norien is, and where it is going. Directional, not dated."
    >
      <Prose>
        <h2>Shipped</h2>
        <ul>
          <li>Versioned registry for agents and tools, with immutable versions.</li>
          <li>Local runtime supervisor — tools, permissions, health, and crash recovery.</li>
          <li>Unified data API over market and on-chain data, with provenance on every response.</li>
          <li>CLI and TypeScript &amp; Python SDKs over one public REST API.</li>
          <li>Web app, marketing site, and this documentation across dedicated subdomains.</li>
          <li>Accounts via GitHub, and personal API keys you can create and revoke.</li>
        </ul>

        <h2>In progress</h2>
        <ul>
          <li>Deeper Robinhood Chain coverage — richer contract, wallet, and project data.</li>
          <li>A broader default tool catalogue.</li>
          <li>More worked <Link href="/getting-started">examples</Link> and end-to-end tutorials.</li>
        </ul>

        <h2>Exploring</h2>
        <ul>
          <li>Team and organisation scoping for shared registries.</li>
          <li>Hosted runtime options that preserve the local-first security model.</li>
          <li>Additional data and observability integrations.</li>
        </ul>
      </Prose>

      <Note>
        Directions, not commitments — the <Link href="/why">principles</Link> are the fixed part; the
        order is not.
      </Note>
    </DocPage>
  );
}
