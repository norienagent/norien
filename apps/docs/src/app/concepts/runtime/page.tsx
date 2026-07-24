import Link from 'next/link';

import { Prose, Terminal } from '@norien-live/web-ui';

import { DocPage, Note } from '../../doc-page';

export const metadata = { title: 'Runtime' };

export default function RuntimeConceptPage() {
  return (
    <DocPage
      href="/concepts/runtime"
      title="Runtime"
      lead="The local supervisor that executes installed agents — injecting tools, enforcing permissions, probing health, and recovering crashes."
    >
      <Prose>
        <p>
          The runtime is a separate process from the registry, and it runs on your machine. It is
          what turns an installed manifest into a live process and keeps it alive.
        </p>

        <h2>What the supervisor does</h2>
        <ul>
          <li>
            <strong>Detects the runtime</strong> — node, python, or an http tool — from the manifest.
          </li>
          <li>
            <strong>Injects tools and environment</strong> — only what the manifest declares, nothing
            more.
          </li>
          <li>
            <strong>Validates permissions</strong> — a declared permission is granted; an undeclared
            capability is not.
          </li>
          <li>
            <strong>Probes health</strong> on an interval, and <strong>restarts crashes</strong> with
            a loop cap so a failing agent cannot spin forever.
          </li>
        </ul>

        <h2>Status vs. health</h2>
        <p>
          These are two axes, deliberately separate. <strong>Status</strong> is what the supervisor is
          doing with the process (<code>running</code>, <code>stopped</code>, <code>failed</code>,
          <code>restarting</code>). <strong>Health</strong> is what the agent reports about itself (
          <code>healthy</code>, <code>unhealthy</code>). A process can be <code>running</code> and{' '}
          <code>unhealthy</code> at the same time — and knowing that is the point.
        </p>

        <h2>Running agents</h2>
        <Terminal
          lines={[
            '$ norien runtime start',
            '$ norien run research-agent',
            '$ norien status',
            '$ norien restart research-agent',
            '$ norien stop research-agent',
          ]}
        />
      </Prose>

      <Note type="warn">
        The runtime executes code, so it is intentionally local-only. In the hosted app the runtime
        page shows the registry and chain status (both live) and explains how to start the supervisor
        yourself — see <Link href="/guides/running">Running agents</Link>.
      </Note>
    </DocPage>
  );
}
