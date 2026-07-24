import Link from 'next/link';

import { Prose } from '@norien-live/web-ui';

import { DocPage } from '../doc-page';

export const metadata = { title: 'FAQ' };

export default function FaqPage() {
  return (
    <DocPage href="/faq" title="FAQ" lead="Short answers to the questions that come up most.">
      <Prose>
        <h2>Is it free?</h2>
        <p>
          Yes. Everything runs locally at no cost, and the hosted registry and API are free to read.
          You only need an account to publish.
        </p>

        <h2>Do I need an account?</h2>
        <p>
          Not to read, install, or run — those are public. Publishing an agent or tool needs a key,
          which you create on the app&apos;s API Keys page.
        </p>

        <h2>Does the registry run my agent?</h2>
        <p>
          No. The registry only stores and serves manifests. Execution is the{' '}
          <Link href="/concepts/runtime">runtime&apos;s</Link> job, and the runtime runs on your
          machine — a shared catalogue must never execute someone else&apos;s code.
        </p>

        <h2>Why is the runtime &ldquo;local&rdquo; in the hosted app?</h2>
        <p>
          By design. The hosted app can show you the live registry and chain status, but it cannot run
          agents for you — that would mean executing arbitrary code on shared infrastructure. Start
          the supervisor yourself with <code>norien runtime start</code>.
        </p>

        <h2>What data does the API cover?</h2>
        <p>
          Tokens, trending, projects, wallets, contracts, search, and chain status — normalized across
          several providers, defaulting to Robinhood Chain. Every response says where it came from.
          See <Link href="/concepts/api">the unified API</Link>.
        </p>

        <h2>Can I point the tools at my own registry?</h2>
        <p>
          Yes. The CLI and SDKs take a registry URL, and the registry runs anywhere Node runs — with{' '}
          <code>DATABASE_URL</code> unset it uses an embedded Postgres, so a local instance needs no
          setup.
        </p>

        <h2>What happens when a data provider is down?</h2>
        <p>
          The request still succeeds with whatever the other providers returned, and the response is
          marked <code>degraded</code> with the failing source listed. A partial answer is never
          presented as a complete one.
        </p>

        <h2>Are published versions permanent?</h2>
        <p>
          A published version is immutable and stays installable. Removed artifacts are tombstoned,
          not deleted, so a past install is never silently broken. See{' '}
          <Link href="/concepts/versioning">versioning</Link>.
        </p>
      </Prose>
    </DocPage>
  );
}
