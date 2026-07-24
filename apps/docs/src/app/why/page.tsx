import Link from 'next/link';

import { Prose } from '@norien-live/web-ui';

import { DocPage, Note } from '../doc-page';

export const metadata = {
  title: 'Why Norien',
  description: 'The reasoning behind the registry, the runtime, the unified API, and the local-first design.',
};

export default function WhyPage() {
  return (
    <DocPage
      href="/why"
      title="Why Norien"
      lead="Not a pitch — the reasoning. Why another agent platform should exist, why it is shaped this way, and what it refuses to do."
    >
      <Prose>
        <h2>Why another AI agent platform?</h2>
        <p>
          Most agent tooling optimizes for the demo: a notebook, a single script, an API key pasted
          inline. That is where the hard parts are hidden, not solved. The moment an agent needs a
          second tool, a teammate, a specific version, a secret it should not leak, or data from a
          chain, the demo collapses into bespoke glue. Norien exists to make the parts <em>after</em>{' '}
          the demo boring: distribution, versioning, execution, and data — the plumbing every serious
          agent needs and no one wants to rebuild.
        </p>

        <h2>Why a registry?</h2>
        <p>
          Software got good at sharing when it got a registry — npm, PyPI, crates. Agents have none.
          An agent today is a link to a repo and a prayer that the README is current. A registry
          turns an agent into an addressable, versioned artifact: <code>trading-agent@0.5.0</code>{' '}
          resolves to exactly one manifest, one set of tool dependencies, one runtime contract, for
          everyone, forever. Immutable versions mean an install you did last month still installs the
          same thing today.
        </p>

        <h2>Why a runtime?</h2>
        <p>
          Publishing is half the problem; running is the other half. An agent declares tools,
          permissions, and health — but declarations are worthless if nothing enforces them. The
          runtime is the supervisor that actually does it: it detects the language, injects only the
          declared tools and secrets, probes health on an interval, and restarts a crash with a loop
          cap so a broken agent cannot spin forever. Crucially, it runs <strong>locally</strong>. A
          shared registry must never execute someone else&apos;s code — so it doesn&apos;t.
        </p>

        <h2>Why a unified data API?</h2>
        <p>
          An agent that trades or reads a chain has to talk to market-data providers, explorers, TVL
          aggregators, and RPC nodes — each with its own auth, shape, rate limit, and outage. That
          integration is re-written in every project and rots constantly. Norien does it once and
          exposes one normalized surface. Every response carries <code>sources</code> and{' '}
          <code>degraded</code>: if a provider fails, the request still succeeds with whatever the
          others returned, and the answer is <em>visibly</em> partial rather than quietly wrong.
        </p>

        <h2>Why Robinhood Chain?</h2>
        <p>
          Agents that act on-chain need a chain that is fast, cheap, and legible. Norien is built for
          the Robinhood Chain ecosystem: the unified API defaults to it, the explorer and RPC are
          wired in, and token, wallet, and contract data resolve natively. One chain, deeply
          supported, beats ten chains supported shallowly.
        </p>

        <h2>Why a CLI and SDKs?</h2>
        <p>
          Different surfaces, one contract. The CLI is for humans and CI — every command speaks{' '}
          <code>--json</code>, stdout stays pure so it composes with <code>jq</code>, and diagnostics
          go to stderr. The SDKs (TypeScript and Python) are for programs — same endpoints, typed,
          with pagination and retries handled. All three are thin clients over one public REST API,
          so nothing can do something the API cannot.
        </p>

        <h2>Design principles</h2>
        <ul>
          <li>
            <strong>One source of truth.</strong> The REST API is the product. Every client is a thin
            wrapper; no capability lives only in a UI.
          </li>
          <li>
            <strong>Partial beats wrong.</strong> A degraded answer with its provenance attached is
            always preferable to a confident hole.
          </li>
          <li>
            <strong>Immutable versions, mutable head.</strong> A published version never changes; a
            slug&apos;s <em>latest</em> pointer moves forward.
          </li>
          <li>
            <strong>Local-first.</strong> Everything works on your machine with no account and no
            server. The hosted registry is a convenience, not a dependency.
          </li>
          <li>
            <strong>Declarations are enforced.</strong> A manifest that lists a permission it does not
            need, or omits one it does, should fail — not silently over- or under-grant.
          </li>
        </ul>

        <h2>Security philosophy</h2>
        <p>
          The registry stores and serves manifests; it never executes them. Execution is the
          runtime&apos;s job, and the runtime is local, so untrusted code never runs on shared
          infrastructure. Tools declare their permissions and receive only what they declare. API
          keys are stored as hashes, shown once, and revocable. Reads are public and need no
          credential; identity is only required to publish. The threat model is stated, not assumed.
        </p>

        <h2>Long-term vision</h2>
        <p>
          The end state is an ecosystem where an agent is as easy to share, install, and trust as a
          package — where &ldquo;run this agent&rdquo; is one command, its data layer is already
          solved, and its behaviour is legible because its manifest is the contract. Norien is the
          registry, runtime, and data layer for that world, starting on Robinhood Chain.
        </p>
      </Prose>

      <Note>
        Convinced? <Link href="/getting-started">Getting started</Link> takes you from install to a
        running agent in a few commands.
      </Note>
    </DocPage>
  );
}
