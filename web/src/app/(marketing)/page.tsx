import Link from 'next/link';
import { Suspense } from 'react';

import { api } from '@/lib/api';
import { count } from '@/lib/format';
import {
  CodeBlock,
  Container,
  Eyebrow,
  FeatureCard,
  Section,
  SectionTitle,
  Terminal,
} from '@/components/marketing';
import { ButtonLink, Skeleton } from '@/components/ui';

/**
 * The landing page — a marketing page, not the dashboard. The product lives at
 * `/app`.
 *
 * The numbers in the hero are read from the live registry rather than written
 * into the copy, so the page cannot claim a catalogue size that is not true.
 */

export const revalidate = 60;

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Features />
      <HowItWorks />
      <Cli />
      <Registry />
      <Runtime />
      <Marketplace />
      <Api />
      <DocsCta />
    </>
  );
}

/* --- 1. Hero -------------------------------------------------------------- */

function Hero() {
  return (
    <Container className="py-20 sm:py-28">
      <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <Eyebrow>Agent infrastructure</Eyebrow>
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-5xl">
            The registry for
            <br />
            AI agents.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Publish an agent, install the tools it depends on, run it locally under a supervisor, and
            read normalized market and on-chain data — through one API, one CLI, and one SDK.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href="/app">Open the app</ButtonLink>
            <ButtonLink href="/docs" tone="secondary">
              Read the docs
            </ButtonLink>
          </div>

          <Suspense fallback={<StatsFallback />}>
            <LiveStats />
          </Suspense>
        </div>

        <Terminal
          caption="norien"
          lines={[
            '$ norien search trading',
            '  trading-agent   0.5.0   python',
            '',
            '$ norien install trading-agent',
            '  ✓ resolved 4 tools · wrote ./norien_agents',
            '',
            '$ norien run trading-agent',
            '  ✓ running · pid 24180 · healthy',
          ]}
        />
      </div>
    </Container>
  );
}

/** Catalogue size, straight from the registry. */
async function LiveStats() {
  const [agents, tools, chain] = await Promise.all([
    api.agents({ limit: 1 }).catch(() => null),
    api.tools({ limit: 1 }).catch(() => null),
    api.chain().catch(() => null),
  ]);

  const stats: { value: string; label: string }[] = [];
  if (agents) stats.push({ value: count(agents.meta.total), label: 'agents published' });
  if (tools) stats.push({ value: count(tools.meta.total), label: 'tools available' });
  if (chain) stats.push({ value: count(chain.data.blockNumber), label: 'chain height' });

  if (stats.length === 0) return null;

  return (
    <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-line pt-6">
      {stats.map((stat) => (
        <div key={stat.label}>
          <dt className="text-xs uppercase tracking-wide text-muted">{stat.label}</dt>
          <dd className="mt-0.5 text-2xl font-semibold tracking-tight text-ink">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatsFallback() {
  return (
    <div className="mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-line pt-6">
      {[0, 1, 2].map((index) => (
        <div key={index}>
          <Skeleton width={90} height={10} />
          <div className="h-2" />
          <Skeleton width={70} height={22} />
        </div>
      ))}
    </div>
  );
}

/* --- 2. Features ---------------------------------------------------------- */

function Features() {
  return (
    <Section id="features">
      <SectionTitle
        title="Everything an agent needs to ship"
        detail="Four layers that compose. Use one, or use all of them behind a single API."
      />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FeatureCard title="Versioned registry" href="/app/registry">
          Immutable version records with a mutable head. Install a pinned version and get the exact
          manifest that was published.
        </FeatureCard>
        <FeatureCard title="Local runtime" href="/app/runtime">
          A supervisor that starts agents, streams logs, probes health, and restarts them when they
          crash — with a crash-loop cap.
        </FeatureCard>
        <FeatureCard title="Tool marketplace" href="/app/tools">
          Tools are plugins, never hardcoded. JSON in, JSON out, across seventeen categories.
        </FeatureCard>
        <FeatureCard title="Unified data API" href="/app/markets">
          Six providers normalized into one shape, with provenance attached to every response.
        </FeatureCard>
      </div>
    </Section>
  );
}

/* --- 3. How it Works ------------------------------------------------------ */

const STEPS = [
  {
    title: 'Describe the agent',
    body: 'An agent.json declares its runtime, entrypoint, commands, required tools, permissions, and environment.',
  },
  {
    title: 'Publish it',
    body: 'The registry validates the manifest, resolves every declared tool, and records an immutable version.',
  },
  {
    title: 'Install anywhere',
    body: 'Installing writes the manifest, a resolved tool list, and an .env.example — the way node_modules works.',
  },
  {
    title: 'Run it',
    body: 'The supervisor detects the runtime, injects tools and environment, and keeps the process healthy.',
  },
];

function HowItWorks() {
  return (
    <Section id="how-it-works" className="bg-card">
      <SectionTitle
        title="How it works"
        detail="The same four steps whether you are running one agent locally or a catalogue of them."
      />
      <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <div className="flex size-8 items-center justify-center rounded-lg border border-line bg-accent-soft text-sm font-semibold text-accent">
              {index + 1}
            </div>
            <h3 className="mt-4 text-base font-semibold tracking-tight text-ink">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/* --- 4. CLI --------------------------------------------------------------- */

function Cli() {
  return (
    <Section id="cli">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <Eyebrow>Command line</Eyebrow>
          <SectionTitle
            title="Built for the terminal first"
            detail="Every command supports --json, and stdout stays pure JSON while spinners and diagnostics go to stderr — so the CLI composes with jq and CI without special-casing."
          />
          <ul className="mt-6 space-y-2.5 text-sm text-muted">
            {[
              'Publish, search, install, update, and uninstall',
              'Run, stop, restart, tail logs, and check status',
              'Market data: markets, trending, token, wallet, contract, project',
              'norien doctor diagnoses the API, manifest, runtimes, and config',
            ].map((item) => (
              <li key={item} className="flex gap-2.5">
                <span aria-hidden className="mt-[0.4rem] size-1.5 shrink-0 rounded-full bg-accent" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <Terminal
          caption="markets"
          lines={[
            '$ norien markets --limit 3',
            '  SYMBOL  PRICE      24H      VOLUME   HOLDERS',
            '  USDG    $1.0011    +0.14%   $85.69M   31,967',
            '  WETH    $1944.81   +0.81%   $85.69M  254,872',
            '',
            '$ norien doctor',
            '  ✓ registry  http://localhost:3000 — ok',
          ]}
        />
      </div>
    </Section>
  );
}

/* --- 5. Registry ---------------------------------------------------------- */

function Registry() {
  return (
    <Section id="registry" className="bg-card">
      <div className="grid items-start gap-12 lg:grid-cols-2">
        <div>
          <Eyebrow>Registry</Eyebrow>
          <SectionTitle
            title="Versions that never move"
            detail="Every publish writes an immutable version row alongside a mutable head. A pinned install resolves to exactly what was published, and a deleted slug stays reserved so it can never be taken over."
          />
          <ButtonLink href="/app/registry" tone="secondary" className="mt-6">
            Browse the registry
          </ButtonLink>
        </div>
        <dl className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
          {[
            ['Manifest validation', 'Structure, semver, slug rules, and tool resolution before anything is stored.'],
            ['Ranked search', 'Postgres full-text with generated tsvector columns and ts_rank ordering.'],
            ['Dependency resolution', 'Declared tools resolve to real records; unresolvable names are reported, not ignored.'],
            ['Runtime inspection', 'Ask whether an agent could run here before installing it.'],
          ].map(([title, body]) => (
            <div key={title} className="bg-card p-5">
              <dt className="text-sm font-semibold text-ink">{title}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted">{body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}

/* --- 6. Runtime ----------------------------------------------------------- */

function Runtime() {
  return (
    <Section id="runtime">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <Terminal
          caption="supervisor"
          lines={[
            '$ norien run research-agent',
            '  ✓ node detected · 3 tools injected',
            '  ✓ running · pid 24180',
            '',
            '$ norien logs research-agent -f',
            '  [12:04:01] ready on :7070',
            '  [12:04:12] health ok',
          ]}
        />
        <div>
          <Eyebrow>Runtime</Eyebrow>
          <SectionTitle
            title="Docker, npm, and systemd — for agents"
            detail="A supervisor process separate from the registry, because a shared catalogue must never execute user code. It detects the runtime, validates permissions, injects tools and environment, and recovers crashes with a loop cap so a failing agent cannot spin forever."
          />
          <ButtonLink href="/app/runtime" tone="secondary" className="mt-6">
            View runtime status
          </ButtonLink>
        </div>
      </div>
    </Section>
  );
}

/* --- 7. Marketplace ------------------------------------------------------- */

function Marketplace() {
  return (
    <Section id="marketplace" className="bg-card">
      <SectionTitle
        title="Tools are plugins, not special cases"
        detail="A tool declares its input and output schema, its runtime, its permissions, and the environment it needs. The runtime speaks one protocol to all of them — JSON on stdin, JSON on stdout — so nothing about a tool is hardcoded."
      />
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <FeatureCard title="node · python · http">
          Three runtimes behind one contract. An http tool proxies to a URL with placeholder
          substitution; the caller cannot tell the difference.
        </FeatureCard>
        <FeatureCard title="Schema-checked">
          Input and output are JSON Schema, stored verbatim — which is also what makes them MCP
          compatible later.
        </FeatureCard>
        <FeatureCard title="Seventeen categories">
          Search, data, wallet, social, media, notifications, storage, and more.
        </FeatureCard>
      </div>
      <ButtonLink href="/app/tools" tone="secondary" className="mt-8">
        Explore the marketplace
      </ButtonLink>
    </Section>
  );
}

/* --- 8. API --------------------------------------------------------------- */

function Api() {
  return (
    <Section id="api">
      <div className="grid items-start gap-12 lg:grid-cols-2">
        <div>
          <Eyebrow>Unified API</Eyebrow>
          <SectionTitle
            title="Six providers, one shape"
            detail="Market data, on-chain state, repository health, and TVL are normalized behind a single surface. Responses carry their own provenance, so a partial answer is visibly partial instead of quietly incomplete."
          />
          <ul className="mt-6 space-y-2 font-mono text-sm text-muted">
            {[
              'GET /api/tokens',
              'GET /api/token/:address',
              'GET /api/wallets/:address',
              'GET /api/contracts/:address',
              'GET /api/projects',
              'GET /api/search',
            ].map((route) => (
              <li key={route}>{route}</li>
            ))}
          </ul>
        </div>

        <CodeBlock>{`{
  "data": {
    "symbol": "USDG",
    "price": 1.0002,
    "holders": 31579
  },
  "sources": [
    { "provider": "codex",      "status": "ok" },
    { "provider": "blockscout", "status": "ok" }
  ],
  "degraded": false
}`}</CodeBlock>
      </div>
    </Section>
  );
}

/* --- 9. Documentation CTA ------------------------------------------------- */

function DocsCta() {
  return (
    <Section id="docs-cta" className="bg-card">
      <div className="rounded-xl border border-line bg-accent-soft px-6 py-12 text-center sm:px-12">
        <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Start with the docs
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-muted">
          The manifest format, the REST surface, the CLI reference, and the SDKs — everything needed
          to publish your first agent.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/docs">Read the documentation</ButtonLink>
          <ButtonLink href="/signup" tone="secondary">
            Create an account
          </ButtonLink>
        </div>
        <p className="mt-5 text-sm text-muted">
          Or jump straight into{' '}
          <Link href="/app" className="text-accent underline underline-offset-2">
            the app
          </Link>
          .
        </p>
      </div>
    </Section>
  );
}
