import Link from 'next/link';

import { Prose, Terminal } from '@norien-live/web-ui';

import { DocPage, Note } from '../../doc-page';

export const metadata = { title: 'Installing agents' };

export default function InstallingGuidePage() {
  return (
    <DocPage
      href="/guides/installing"
      title="Installing agents"
      lead="Resolve an agent and its tools, and write everything locally — reproducibly."
    >
      <Prose>
        <p>
          Installing an agent resolves its manifest and every tool it declares, fetches the code, and
          writes it to <code>./norien_agents</code>. Pin a version for a build you never want to move;
          omit it for <code>latest</code>.
        </p>
      </Prose>

      <Terminal
        lines={[
          '$ norien install trading-agent          # latest',
          '$ norien install trading-agent@0.5.0    # pinned',
          '  ✓ resolved 4 tools · wrote ./norien_agents',
          '',
          '$ norien list                           # what is installed',
        ]}
      />

      <Prose>
        <h2>What lands on disk</h2>
        <ul>
          <li>The agent&apos;s code and manifest.</li>
          <li>Each declared tool, resolved to a specific version.</li>
          <li>
            An environment template listing the variables the agent needs — fill it in before running.
          </li>
        </ul>

        <h2>Secrets</h2>
        <p>
          Install never asks for secrets. Variables marked <code>secret</code> in the manifest are
          listed in the template; you provide them at run time, and the runtime injects them without
          logging them.
        </p>
      </Prose>

      <Note>
        Installing writes code but runs nothing. Starting it is the{' '}
        <Link href="/guides/running">runtime&apos;s</Link> job.
      </Note>
    </DocPage>
  );
}
