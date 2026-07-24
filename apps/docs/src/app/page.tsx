import Link from 'next/link';

import { CodeBlock, Prose, Terminal } from '@norien-live/web-ui';

import { DocPage, Note } from './doc-page';

export const metadata = {
  title: 'What is Norien',
  description: 'The registry, runtime, and unified data API for AI agents on Robinhood Chain.',
};

export default function IntroductionPage() {
  return (
    <DocPage
      href="/"
      title="What is Norien"
      lead="The registry, runtime, and unified data API for AI agents on Robinhood Chain — one place to publish an agent, install what it depends on, run it, and read the data it acts on."
    >
      <Prose>
        <p>
          An AI agent is rarely one file. It is code, a set of tools it calls, the permissions those
          tools need, secrets, a way to run it, and — for anything that touches markets or a chain —
          a firehose of external data in a dozen incompatible shapes. Today that is assembled by hand,
          per project, and none of it is portable. Norien makes each of those a first-class,
          shareable primitive.
        </p>
      </Prose>

      <Prose>
        <p>Norien is four things that fit together:</p>
        <ul>
          <li>
            <strong>Registry</strong> — a versioned catalogue of agents and tools. Publish once,
            and anyone can discover, inspect, and install a specific version.
          </li>
          <li>
            <strong>Runtime</strong> — a local supervisor that runs installed agents, injects their
            tools and secrets, checks their health, and restarts them when they crash.
          </li>
          <li>
            <strong>Unified data API</strong> — one normalized surface over market and on-chain data,
            with provenance attached, so an agent reads <em>Norien</em>, not six vendors.
          </li>
          <li>
            <strong>CLI &amp; SDKs</strong> — the same capabilities from a terminal and from
            TypeScript or Python, over one public REST API.
          </li>
        </ul>
      </Prose>

      <Terminal
        caption="norien"
        lines={[
          '$ norien search trading',
          '  trading-agent   0.5.0   python   4 tools',
          '',
          '$ norien install trading-agent',
          '  ✓ resolved 4 tools · wrote ./norien_agents',
          '',
          '$ norien run trading-agent',
          '  ✓ running · pid 24180 · healthy',
        ]}
      />

      <Prose>
        <p>
          Or skip the install entirely and read the data directly — every response is normalized and
          tagged with where it came from:
        </p>
      </Prose>
      <CodeBlock>{`curl https://api.norien.live/api/tokens?limit=5`}</CodeBlock>

      <Note>
        Everything is free and runs locally. The registry needs no database server — with{' '}
        <code>DATABASE_URL</code> unset it runs an embedded Postgres and seeds a sample catalogue on
        first boot.
      </Note>

      <Prose>
        <p>
          New here? Read <Link href="/why">Why Norien</Link> for the reasoning, or jump straight to{' '}
          <Link href="/getting-started">Getting started</Link>.
        </p>
      </Prose>
    </DocPage>
  );
}
