import Link from 'next/link';

import { APP_URL, Prose, Terminal } from '@norien-live/web-ui';

import { DocPage, Note } from '../../doc-page';

export const metadata = { title: 'Registry' };

export default function RegistryConceptPage() {
  return (
    <DocPage
      href="/concepts/registry"
      title="Registry"
      lead="A versioned catalogue of agents and tools. Publish once; anyone can discover, inspect, and install an exact version."
    >
      <Prose>
        <p>
          The registry is Norien&apos;s system of record. It stores <strong>agents</strong> and{' '}
          <strong>tools</strong> as immutable, versioned artifacts, keyed by a slug. Publishing{' '}
          <code>trading-agent</code> the first time creates it; publishing again appends a new
          version. A version, once published, never changes — so an install is reproducible.
        </p>

        <h2>What it stores</h2>
        <ul>
          <li>
            <strong>The manifest</strong> — an agent&apos;s <code>agent.json</code> or a tool&apos;s
            declaration: identity, runtime, tool dependencies, permissions, and required environment.
          </li>
          <li>
            <strong>Versions</strong> — every published version, retained. The slug&apos;s{' '}
            <em>latest</em> pointer advances; old versions stay installable.
          </li>
          <li>
            <strong>Provenance</strong> — the publishing handle, so an artifact has an author.
          </li>
        </ul>

        <h2>What it does not do</h2>
        <p>
          The registry never executes an agent. It serves manifests; running them is the{' '}
          <Link href="/concepts/runtime">runtime&apos;s</Link> job, and the runtime is local. A shared
          catalogue that ran user code would be a shared catalogue running arbitrary code — so it
          doesn&apos;t.
        </p>

        <h2>Working with it</h2>
        <Terminal
          lines={[
            '$ norien search trading      # find agents',
            '$ norien info trading-agent  # inspect the manifest',
            '$ norien install trading-agent@0.5.0',
            '$ norien publish             # create or append a version',
          ]}
        />
      </Prose>

      <Note>
        Browse the live registry in the <a href={`${APP_URL}/registry`}>app</a>, or read the REST
        surface in the <Link href="/api-reference">API reference</Link>.
      </Note>
    </DocPage>
  );
}
