import Link from 'next/link';

import { Prose, Terminal } from '@norien-live/web-ui';

import { DocPage, Note } from '../../doc-page';

export const metadata = { title: 'Running agents' };

export default function RunningGuidePage() {
  return (
    <DocPage
      href="/guides/running"
      title="Running agents"
      lead="Start the supervisor, run an installed agent, and watch its status, health, and logs."
    >
      <Prose>
        <p>
          The <Link href="/concepts/runtime">runtime</Link> supervisor runs locally. Start it once,
          then run any installed agent under it.
        </p>
      </Prose>

      <Terminal
        lines={[
          '$ norien runtime start',
          '$ norien run research-agent',
          '  ✓ running · pid 24180 · healthy',
          '',
          '$ norien status               # status + health of everything',
          '$ norien logs research-agent -f',
          '$ norien restart research-agent',
          '$ norien stop research-agent',
        ]}
      />

      <Prose>
        <h2>Reading the state</h2>
        <p>
          <code>status</code> shows two axes per agent. <strong>Status</strong> is what the supervisor
          is doing — <code>running</code>, <code>stopped</code>, <code>failed</code>,{' '}
          <code>restarting</code>. <strong>Health</strong> is what the agent reports — {' '}
          <code>healthy</code>, <code>unhealthy</code>. An agent can be running and unhealthy; that is
          a real state worth seeing.
        </p>

        <h2>Recovery</h2>
        <p>
          A crash is restarted automatically, with a loop cap: an agent that keeps failing is left
          stopped rather than spun forever. Environment variables the agent needs are injected at
          launch — including secrets, which are never written to logs.
        </p>
      </Prose>

      <Note type="warn">
        Because it executes code, the supervisor is local-only. The hosted app&apos;s runtime page
        shows the live registry and chain status and points you here to start it yourself.
      </Note>
    </DocPage>
  );
}
