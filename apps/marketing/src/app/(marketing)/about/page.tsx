import Link from 'next/link';

import { Container, PageHeader, Prose } from '@norien-live/web-ui';
import { Card } from '@norien-live/web-ui';

export const metadata = {
  title: 'About',
  description: 'What Norien is, and the principles it is built on.',
};

const PRINCIPLES = [
  {
    title: 'Never fabricate',
    body: 'If a provider has no answer, the field is absent and the response says which source was missing. No placeholder value ever stands in for a real one.',
  },
  {
    title: 'Partial beats broken',
    body: 'One failing provider degrades a response rather than failing it. The caller is told what is missing instead of being handed an error or a half-truth.',
  },
  {
    title: 'One way to do a thing',
    body: 'Timeout, retry, caching, and logging live in one outbound client. Binary resolution lives in one module. Duplicated logic is how behaviour drifts.',
  },
  {
    title: 'The terminal is a first-class client',
    body: 'Every command emits JSON on request, stdout stays pipeable, and exit codes are stable. Anything the UI can do, a script can do.',
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHeader
        title="About Norien"
        detail="Infrastructure for autonomous agents: a registry to publish them, a marketplace for the tools they use, a supervisor to run them, and one API for the data they read."
      />

      <Container className="pb-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
          <Prose>
            <p>
              Agents are software that other software depends on, and software like that needs the
              same infrastructure any package ecosystem needs: somewhere to publish it, a way to pin
              a version, a resolver for its dependencies, and something to run it.
            </p>
            <p>
              Norien is that, applied to agents. An <code>agent.json</code> declares a runtime, an
              entrypoint, the tools it needs, the permissions it wants, and the environment it
              expects. The registry validates that manifest, resolves every declared tool against a
              real catalogue, and records an immutable version. A supervisor on your machine runs it,
              streams its logs, probes its health, and restarts it when it crashes.
            </p>
            <h2>The tools are the interesting part</h2>
            <p>
              Most agent frameworks bake capabilities into the framework. Norien treats a tool as a
              published record with a schema on both ends — the runtime knows the protocol, not the
              tools. Adding a capability to the ecosystem never means editing the thing that runs it.
            </p>
            <h2>And the data</h2>
            <p>
              Agents that act on the world need to read it. Six external providers are normalized
              behind one API, with per-field ownership decided in advance and provenance attached to
              every response. A caller cannot tell which service answered, which is the point — and
              when one of them is down, the response says so rather than quietly substituting.
            </p>
            <p>
              Everything runs locally today. There is no hosted registry yet, no accounts, and no
              billing. What exists, works — and the pages in this app read from it live rather than
              from fixtures.
            </p>
          </Prose>

          <aside className="space-y-4">
            <Card title="Built in phases">
              <p className="text-sm leading-relaxed text-muted">
                Eight so far: registry, runtime inspection, CLI and SDKs, execution, marketplace,
                data integration, product surface, and this frontend.
              </p>
              <Link
                href="/changelog"
                className="mt-3 inline-block text-sm font-medium text-accent"
              >
                Read the changelog →
              </Link>
            </Card>

            <Card title="How it is built">
              <p className="text-sm leading-relaxed text-muted">
                Notes on specific decisions — why a cache keeps two dates, why versions are immutable,
                why the supervisor is a separate process.
              </p>
              <Link href="/blog" className="mt-3 inline-block text-sm font-medium text-accent">
                Engineering notes →
              </Link>
            </Card>
          </aside>
        </div>

        <div className="mt-16">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Principles</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {PRINCIPLES.map((principle) => (
              <Card key={principle.title}>
                <h3 className="text-base font-semibold tracking-tight text-ink">{principle.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{principle.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </Container>
    </>
  );
}
