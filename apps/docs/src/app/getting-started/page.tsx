import Link from 'next/link';

import { APP_URL, CodeBlock, Prose, Terminal } from '@norien-live/web-ui';

import { DocPage, Note } from '../doc-page';

export const metadata = {
  title: 'Getting started',
  description: 'Install, discover, run, read, and publish — the whole loop, start to finish.',
};

export default function GettingStartedPage() {
  return (
    <DocPage
      href="/getting-started"
      title="Getting started"
      lead="From nothing to a running agent — and your own published one — in a handful of commands."
    >
      <Prose>
        <p>
          <strong>1. Install the CLI.</strong> One command, no configuration. It talks to the hosted
          registry at <code>api.norien.live</code> out of the box.
        </p>
      </Prose>
      <CodeBlock>{`# macOS / Linux
curl -fsSL https://norien.live/install.sh | sh

# or with npm
npm install -g @norien-live/cli`}</CodeBlock>

      <Prose>
        <p>
          <strong>2. Find something to run.</strong> Search the registry, or browse it in the{' '}
          <a href={`${APP_URL}/registry`}>app</a>.
        </p>
      </Prose>
      <Terminal
        lines={['$ norien search trading', '  trading-agent   0.5.0   python   4 tools', '', '$ norien info trading-agent']}
      />

      <Prose>
        <p>
          <strong>3. Install and run it.</strong> Install resolves the agent&apos;s declared tools and
          writes them locally; run hands it to the supervisor, which starts it, probes its health, and
          restarts it if it crashes.
        </p>
      </Prose>
      <Terminal
        lines={[
          '$ norien install trading-agent',
          '  ✓ resolved 4 tools · wrote ./norien_agents',
          '',
          '$ norien runtime start',
          '$ norien run trading-agent',
          '  ✓ running · pid 24180 · healthy',
          '$ norien logs trading-agent -f',
        ]}
      />

      <Prose>
        <p>
          <strong>4. Or just read the data.</strong> No install needed — hit the unified API directly,
          or explore it in the <a href={`${APP_URL}/markets`}>app</a>.
        </p>
      </Prose>
      <CodeBlock>{`curl https://api.norien.live/api/tokens?limit=5
curl https://api.norien.live/api/token/0x…`}</CodeBlock>

      <Prose>
        <p>
          <strong>5. Publish your own.</strong> Write an <code>agent.json</code> (see{' '}
          <Link href="/concepts/manifest">the manifest</Link>), validate it against the live registry
          on the <a href={`${APP_URL}/publish`}>publish page</a>, then ship it:
        </p>
      </Prose>
      <Terminal lines={['$ norien publish', '  ✓ published trading-agent@0.5.0']} />

      <Note>
        Publishing needs identity. Create a key on the <a href={`${APP_URL}/api-keys`}>API Keys page</a>{' '}
        and run <code>norien login</code>. Reads stay public and free.
      </Note>

      <Prose>
        <p>
          That is the full loop — discover, run, read, publish. The{' '}
          <Link href="/concepts/registry">Core concepts</Link> explain each piece; the{' '}
          <Link href="/guides/publishing">Guides</Link> go deep on the workflows.
        </p>
      </Prose>
    </DocPage>
  );
}
