import Link from 'next/link';

import { CodeBlock, Prose, Terminal } from '@norien-live/web-ui';

import { DocPage, Note } from '../doc-page';

export const metadata = { title: 'CLI' };

export default function CliReferencePage() {
  return (
    <DocPage
      href="/cli"
      title="CLI"
      lead="The norien command — for humans and CI. Every command speaks --json; stdout stays pure so it composes with jq."
    >
      <Prose>
        <p>
          Install the CLI with <code>curl -fsSL https://norien.live/install.sh | sh</code> or{' '}
          <code>npm i -g @norien-live/cli</code>. It targets <code>api.norien.live</code> by default;
          point it elsewhere with <code>--registry</code> or a profile.
        </p>

        <h2>Common commands</h2>
      </Prose>
      <Terminal
        lines={[
          '$ norien init my-agent',
          '$ norien search trading',
          '$ norien info trading-agent',
          '$ norien install trading-agent',
          '$ norien run trading-agent',
          '$ norien logs trading-agent -f',
          '$ norien chat trading-agent',
          '$ norien skill run market-recap',
          '$ norien doctor',
        ]}
      />

      <Prose>
        <h2>Start a new agent</h2>
        <p>
          <code>norien init</code> scaffolds a runnable agent in one step — a valid{' '}
          <code>agent.json</code>, a zero-dependency entrypoint that already serves{' '}
          <code>/health</code>, a README, and <code>.env.example</code>. It publishes as-is and runs
          as-is; pick <code>node</code> or <code>python</code>.
        </p>
      </Prose>
      <CodeBlock>{`norien init my-agent --runtime node -y
cd my-agent
norien publish --dry-run     # validate against the registry
norien publish               # after: norien login`}</CodeBlock>

      <Prose>
        <h2>Chat</h2>
        <p>
          <code>norien chat</code> opens a live conversation in your terminal, replies streaming in as
          they form. Pass an agent slug to talk to that agent in character — a preview, so its code
          never runs — or omit it to ask the Norien assistant about the product. Use{' '}
          <code>-m</code> for a single, pipe-friendly reply. See{' '}
          <Link href="/features/chat">Chat with an agent</Link> for the full feature.
        </p>

        <h2>Skills</h2>
        <p>
          <code>norien skill run &lt;slug&gt;</code> runs a published skill and streams a result
          grounded in Norien&apos;s live data. <code>norien skill search</code> lists them and{' '}
          <code>norien skill publish</code> ships your own from a <code>skill.json</code>. See{' '}
          <Link href="/features/skills">Skills</Link>.
        </p>
      </Prose>
      <CodeBlock>{`norien chat                  # ask the Norien assistant anything
norien chat trading-agent    # chat with an agent, in character
norien chat -m "hi"          # one-shot reply, no prompt`}</CodeBlock>

      <Prose>
        <h2>Composability</h2>
        <p>
          Every command accepts <code>--json</code>, and stdout is pure JSON while spinners and
          diagnostics go to stderr — so the CLI drops straight into pipelines and CI without
          special-casing.
        </p>
      </Prose>
      <CodeBlock>{`norien search trading --json | jq '.[0].slug'`}</CodeBlock>

      <Prose>
        <h2>Exit codes</h2>
        <p>
          <code>0</code> success · <code>1</code> error · <code>2</code> bad usage · <code>3</code>{' '}
          not authenticated · <code>4</code> not found · <code>5</code> validation or dependency
          failure. Stable, so scripts can branch on them.
        </p>

        <h2>Authentication</h2>
        <p>
          Reads need no credential. To publish, create a key on the API Keys page and run{' '}
          <code>norien login</code>; profiles live in <code>~/.norien/config.json</code>.
        </p>
      </Prose>

      <Note>
        <code>norien doctor</code> checks the API, your manifest, dependencies, installed runtimes,
        and configuration, and tells you which one is wrong. See{' '}
        <Link href="/guides/running">Running agents</Link> for the runtime commands.
      </Note>
    </DocPage>
  );
}
