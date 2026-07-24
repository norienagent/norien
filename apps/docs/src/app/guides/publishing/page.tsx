import Link from 'next/link';

import { APP_URL, Prose, Terminal } from '@norien-live/web-ui';

import { DocPage, Note } from '../../doc-page';

export const metadata = { title: 'Publishing agents' };

export default function PublishingGuidePage() {
  return (
    <DocPage
      href="/guides/publishing"
      title="Publishing agents"
      lead="From a working directory to a versioned artifact anyone can install."
    >
      <Prose>
        <p>
          <strong>1. Write the manifest.</strong> An <code>agent.json</code> at the root of your
          project declares identity, runtime, tools, permissions, and environment. See{' '}
          <Link href="/concepts/manifest">the manifest</Link> for every field.
        </p>
        <p>
          <strong>2. Authenticate.</strong> Publishing is the one thing that needs identity. Create a
          key on the <a href={`${APP_URL}/api-keys`}>API Keys page</a> and log in:
        </p>
      </Prose>
      <Terminal lines={['$ norien login   # paste your key', '$ norien whoami']} />

      <Prose>
        <p>
          <strong>3. Validate, then publish.</strong> Validate against the live registry first — it
          resolves your declared tools against the real catalogue — then publish. The first publish
          creates the slug; each one after appends an immutable version.
        </p>
      </Prose>
      <Terminal
        lines={[
          '$ norien publish --dry-run   # validate only',
          '$ norien publish',
          '  ✓ published trading-agent@0.5.0',
        ]}
      />

      <Note>
        A published version is <Link href="/concepts/versioning">immutable</Link> — bump the version
        in <code>agent.json</code> to ship a change. You can also validate a pasted manifest in the{' '}
        <a href={`${APP_URL}/publish`}>publish page</a> without the CLI.
      </Note>
    </DocPage>
  );
}
