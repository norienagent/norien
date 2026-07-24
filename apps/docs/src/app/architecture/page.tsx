import Link from 'next/link';

import { CodeBlock, Prose } from '@norien-live/web-ui';

import { DocPage, Note } from '../doc-page';

export const metadata = { title: 'Architecture' };

export default function ArchitecturePage() {
  return (
    <DocPage
      href="/architecture"
      title="System overview"
      lead="How the pieces fit: a registry that stores, a runtime that executes, an aggregator that normalizes, and thin clients over one API."
    >
      <Prose>
        <h2>The shape of it</h2>
        <p>
          Norien is a single REST API with three responsibilities behind it — the registry, the
          aggregator, and (locally) the runtime. Every client is thin.
        </p>
      </Prose>

      <CodeBlock>{`  CLI        TypeScript SDK      Python SDK        Web app
   │              │                 │                │
   └──────────────┴────────┬────────┴────────────────┘
                           │  one public REST API
                 ┌─────────▼──────────┐
                 │   Norien registry  │  (Fastify + Postgres)
                 │  ┌──────────────┐  │
                 │  │  Registry    │  │  agents, tools, versions
                 │  ├──────────────┤  │
                 │  │  Aggregator  │──┼──► market data · price feed
                 │  │  (/api/*)    │  │    protocol data · explorer
                 │  └──────────────┘  │    repository data · chain node
                 └────────────────────┘
                           ▲
                           │ reads manifests (never executes)
                 ┌─────────┴──────────┐
                 │  Local runtime     │  runs agents on your machine
                 │  supervisor        │  tools · health · restarts
                 └────────────────────┘`}</CodeBlock>

      <Prose>
        <h2>Request flow</h2>
        <p>
          A client calls the API. Registry endpoints serve Norien&apos;s own records straight from
          Postgres. Data endpoints (<code>/api/*</code>) go through the aggregator, which fans out to
          the external providers concurrently, caches each response, and merges them into one
          normalized envelope with <code>sources</code> and <code>degraded</code> attached. A provider
          outage degrades a response; it never fails the request.
        </p>

        <h2>Agent lifecycle</h2>
        <ul>
          <li>
            <strong>Publish</strong> — an author&apos;s manifest is validated and stored as an
            immutable version in the registry.
          </li>
          <li>
            <strong>Install</strong> — a consumer resolves the agent and its declared tools; code is
            fetched and written locally.
          </li>
          <li>
            <strong>Run</strong> — the local supervisor launches it, injects tools and secrets, probes
            health, and restarts crashes.
          </li>
          <li>
            <strong>Observe</strong> — status and health stream back; logs follow with{' '}
            <code>norien logs -f</code>.
          </li>
        </ul>

        <h2>Tool resolution</h2>
        <p>
          At install time each tool slug in the manifest is resolved against the registry to a
          specific version and written alongside the agent. At run time the supervisor wires those
          tools to the agent over the one stdin/stdout protocol, so adding a tool never changes the
          runtime.
        </p>

        <h2>Deployment</h2>
        <p>
          The web is three independently deployed apps sharing one design system —{' '}
          <strong>norien.live</strong> (marketing), <strong>app.norien.live</strong> (product), and{' '}
          <strong>docs.norien.live</strong> (this site) — all reading the same{' '}
          <strong>api.norien.live</strong>. The registry runs anywhere Node runs; with{' '}
          <code>DATABASE_URL</code> unset it uses an embedded Postgres.
        </p>
      </Prose>

      <Note>
        The runtime never runs on shared infrastructure — see{' '}
        <Link href="/why">Why Norien</Link> for the security reasoning.
      </Note>
    </DocPage>
  );
}
