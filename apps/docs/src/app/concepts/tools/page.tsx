import Link from 'next/link';

import { APP_URL, Prose, Terminal } from '@norien-live/web-ui';

import { DocPage, Note } from '../../doc-page';

export const metadata = { title: 'Tools' };

export default function ToolsConceptPage() {
  return (
    <DocPage
      href="/concepts/tools"
      title="Tools"
      lead="A tool is a plugin an agent calls — a typed capability with declared inputs, outputs, permissions, and environment. Never a special case in the runtime."
    >
      <Prose>
        <p>
          Tools are how an agent reaches the outside world — search, an HTTP client, a wallet reader.
          Each declares its input and output as JSON Schema, its runtime (<code>node</code>,{' '}
          <code>python</code>, or <code>http</code>), the permissions it needs, and the environment it
          requires. An agent lists the tools it uses; installing the agent resolves them.
        </p>

        <h2>One protocol</h2>
        <p>
          Every tool speaks the same wire protocol, so the runtime treats them all identically: JSON
          arrives on stdin as <code>{'{ input, context }'}</code>, JSON leaves on stdout as{' '}
          <code>{'{ output }'}</code> or <code>{'{ error }'}</code>, and logs go to stderr. An{' '}
          <code>http</code> tool instead proxies to a URL with placeholder substitution — and the
          caller cannot tell the difference. That uniformity is what keeps the runtime small.
        </p>

        <h2>Working with tools</h2>
        <Terminal
          lines={[
            '$ norien tool search wallet',
            '$ norien tool info http-client',
            '$ norien tool install http-client',
            '$ norien tool publish',
          ]}
        />
      </Prose>

      <Note>
        Tools are versioned in the <Link href="/concepts/registry">registry</Link> just like agents.
        Browse the marketplace in the <a href={`${APP_URL}/tools`}>app</a>.
      </Note>
    </DocPage>
  );
}
