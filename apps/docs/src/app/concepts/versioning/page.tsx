import Link from 'next/link';

import { Prose, Terminal } from '@norien-live/web-ui';

import { DocPage, Note } from '../../doc-page';

export const metadata = { title: 'Versioning' };

export default function VersioningConceptPage() {
  return (
    <DocPage
      href="/concepts/versioning"
      title="Versioning"
      lead="Immutable versions, a mutable head. A published version never changes; the slug's latest pointer moves forward."
    >
      <Prose>
        <p>
          Reproducibility is the whole point of a registry, so versioning is strict. Every publish of
          an existing slug <strong>appends</strong> a new immutable version — it never overwrites an
          old one. Semantic versions order the history; <code>latest</code> tracks the newest.
        </p>

        <h2>The two rules</h2>
        <ul>
          <li>
            <strong>A version is immutable.</strong> <code>trading-agent@0.5.0</code> resolves to the
            same manifest today as the day it was published. An install you scripted last month still
            installs the same thing.
          </li>
          <li>
            <strong>The head is mutable.</strong> Installing <code>trading-agent</code> without a
            version gives you <code>latest</code>; pin a version for a build you never want to move.
          </li>
        </ul>

        <h2>Pinning</h2>
        <Terminal
          lines={[
            '$ norien install trading-agent          # latest',
            '$ norien install trading-agent@0.5.0    # pinned, forever reproducible',
            '$ norien info trading-agent --versions  # the full history',
          ]}
        />

        <h2>Soft deletion</h2>
        <p>
          A slug&apos;s history never disappears from under consumers that already installed it.
          Removed artifacts are tombstoned, not deleted, and every read path filters them out — so a
          past install is never silently broken.
        </p>
      </Prose>

      <Note>
        The same rules apply to <Link href="/concepts/tools">tools</Link>. See{' '}
        <Link href="/guides/publishing">Publishing agents</Link> for the publish flow.
      </Note>
    </DocPage>
  );
}
